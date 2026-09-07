use crate::features::assistant::runs;
use crate::features::assistant::runs::RunItem;
use crate::features::assistant::runs::RunJob;
use crate::features::assistant::runs::RunOwner;
use crate::features::assistant::runs::RunPlan;
use crate::features::assistant::runs::RunSkip;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_bool;
use crate::features::assistant::tools::args::required_int;
use crate::features::assistant::tools::args::required_ints;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::scope::chapter_by_seq;
use crate::features::assistant::tools::scope::find_novel;
use crate::features::assistant::tools::translation::required_target;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::service::ChapterTranslation;
use crate::features::translation::service::NovelTranslation;
use serde_json::Value;
use serde_json::json;

pub const MAX_RUN_CHAPTERS: usize = 100;

enum Verdict {
    Run(Option<String>),
    Skip(String),
}

pub(super) fn definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "start_translation",
            "description": "Prepare a translation run of whole chapters of one novel into one target language. Nothing starts: the app shows a confirmation card and the user decides. Chapters that already have a translation are skipped unless `overwrite` is true, and chapters without paragraphs are skipped too. The result lists the chapters that will run and those skipped, with the reason.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "target": { "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." },
                    "chapters": chapters_property(),
                    "overwrite": overwrite_property("translate chapters that already have a translation again")
                },
                "required": ["novelId", "target", "chapters"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "start_analysis",
            "description": "Prepare a knowledge analysis run of whole chapters of one novel. Nothing starts: the app shows a confirmation card and the user decides. Chapters that are already analyzed are skipped unless `overwrite` is true; an out of date analysis is always replaced. For lang VI or EN the chapter needs a translation in that language. The result lists the chapters that will run and those skipped, with the reason.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": novel_id_property(),
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." },
                    "chapters": chapters_property(),
                    "overwrite": overwrite_property("analyze chapters that are already analyzed again")
                },
                "required": ["novelId", "lang", "chapters"],
                "additionalProperties": false
            }
        }),
    ]
}

fn novel_id_property() -> Value {
    json!({ "type": "integer", "description": "Novel id from list_novel." })
}

fn chapters_property() -> Value {
    json!({
        "type": "array",
        "minItems": 1,
        "maxItems": MAX_RUN_CHAPTERS,
        "items": { "type": "integer" },
        "description": "Chapter numbers from read_novel. Pick only the chapters the user asked for."
    })
}

fn overwrite_property(what: &str) -> Value {
    json!({ "type": "boolean", "description": format!("Set to true only when the user wants to {what}. Default false.") })
}

pub(super) fn start_translation(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let target = required_target(args)?;
    let seqs = chapter_selection(args)?;
    let overwrite = optional_bool(args, "overwrite")?.unwrap_or(false);
    let novels = sources.novels.as_ref();
    let novel = find_novel(ctx, novels, novel_id)?;
    let book = sources.translation.get(novel_id, target.as_str())?;
    let verdict = |chapter: &ChapterRow, paragraphs: usize| {
        translation_verdict(&book, target, chapter, paragraphs, overwrite)
    };
    let found = plan_chapters(novels, novel_id, &seqs, &verdict)?;
    let run = ChapterRun {
        job: RunJob::Translation,
        novel: &novel,
        target: target.as_str(),
        overwrite,
    };
    let call = format!("start_translation(novel {novel_id}, {})", target.as_str());
    submit_plan(chapter_plan(&run, found), &call, ctx)
}

pub(super) fn start_analysis(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let lang = required_lang(args)?;
    let seqs = chapter_selection(args)?;
    let overwrite = optional_bool(args, "overwrite")?.unwrap_or(false);
    let novels = sources.novels.as_ref();
    let novel = find_novel(ctx, novels, novel_id)?;
    let knowledge = sources.knowledge.get(novel_id, lang.as_str())?;
    let translated = translated_book(sources, novel_id, lang)?;
    let verdict = |chapter: &ChapterRow, paragraphs: usize| {
        analysis_verdict(
            &AnalysisInput {
                lang,
                knowledge: &knowledge,
                translated: translated.as_ref(),
                overwrite,
            },
            chapter,
            paragraphs,
        )
    };
    let found = plan_chapters(novels, novel_id, &seqs, &verdict)?;
    let run = ChapterRun {
        job: RunJob::Analysis,
        novel: &novel,
        target: lang.as_str(),
        overwrite,
    };
    let call = format!("start_analysis(novel {novel_id}, {})", lang.as_str());
    submit_plan(chapter_plan(&run, found), &call, ctx)
}

pub(super) fn submit_plan(
    plan: RunPlan,
    call: &str,
    ctx: &ToolContext,
) -> Result<ToolOutput, String> {
    plan.require_work()?;
    runs::submit(&plan, call, ctx.sink)
}

fn chapter_selection(args: &Value) -> Result<Vec<i64>, String> {
    let seqs = required_ints(args, "chapters")?;
    if seqs.len() > MAX_RUN_CHAPTERS {
        return Err(format!(
            "select at most {MAX_RUN_CHAPTERS} chapters for one run"
        ));
    }
    Ok(seqs)
}

fn required_lang(args: &Value) -> Result<KnowledgeLang, String> {
    let raw = required_str(args, "lang")?;
    KnowledgeLang::parse(&raw).ok_or_else(|| format!("unsupported lang '{raw}'; use src, VI or EN"))
}

fn translated_book(
    sources: &Sources,
    novel_id: i64,
    lang: KnowledgeLang,
) -> Result<Option<NovelTranslation>, String> {
    match TranslationTarget::parse(lang.as_str()) {
        Some(target) => sources.translation.get(novel_id, target.as_str()).map(Some),
        None => Ok(None),
    }
}

struct ChapterRun<'a> {
    job: RunJob,
    novel: &'a NovelSummary,
    target: &'a str,
    overwrite: bool,
}

fn chapter_plan(run: &ChapterRun, found: (Vec<RunItem>, Vec<RunSkip>)) -> RunPlan {
    let (items, skipped) = found;
    let replaced = items.iter().filter(|item| item.note.is_some()).count();
    let warnings = if replaced > 0 {
        vec![format!(
            "{replaced} chapter(s) already have a result that will be replaced"
        )]
    } else {
        Vec::new()
    };
    RunPlan {
        job: run.job,
        owner: RunOwner::novel(run.novel.id),
        title: run.novel.display_name().to_string(),
        target: Some(run.target.to_string()),
        mode: None,
        overwrite: run.overwrite,
        items,
        skipped,
        warnings,
    }
}

fn plan_chapters(
    novels: &dyn NovelSource,
    novel_id: i64,
    seqs: &[i64],
    verdict: &dyn Fn(&ChapterRow, usize) -> Verdict,
) -> Result<(Vec<RunItem>, Vec<RunSkip>), String> {
    let mut items = Vec::new();
    let mut skipped = Vec::new();
    for seq in seqs {
        let chapter = chapter_by_seq(novels, novel_id, *seq)?;
        let paragraphs = novels.chapter_read(novel_id, &chapter.id)?.len();
        match verdict(&chapter, paragraphs) {
            Verdict::Run(note) => items.push(RunItem {
                id: chapter.id,
                seq: Some(chapter.seq),
                title: chapter.title,
                tasks: 1,
                note,
                block_ids: None,
            }),
            Verdict::Skip(reason) => skipped.push(RunSkip {
                id: chapter.id,
                seq: Some(chapter.seq),
                title: chapter.title,
                reason,
            }),
        }
    }
    Ok((items, skipped))
}

fn has_translation(translation: &ChapterTranslation) -> bool {
    !translation.title.trim().is_empty() || !translation.paragraphs.is_empty()
}

fn translation_verdict(
    book: &NovelTranslation,
    target: TranslationTarget,
    chapter: &ChapterRow,
    paragraphs: usize,
    overwrite: bool,
) -> Verdict {
    if paragraphs == 0 {
        return Verdict::Skip("the chapter has no paragraphs".to_string());
    }
    let Some(existing) = book
        .chapters
        .get(&chapter.id)
        .filter(|item| has_translation(item))
    else {
        return Verdict::Run(None);
    };
    if overwrite {
        return Verdict::Run(Some(format!(
            "replaces the existing {} translation",
            target.as_str()
        )));
    }
    Verdict::Skip(format!(
        "already has a {} translation ({} of {paragraphs} paragraphs); set overwrite to translate it again",
        target.as_str(),
        existing.paragraphs.len()
    ))
}

struct AnalysisInput<'a> {
    lang: KnowledgeLang,
    knowledge: &'a WireKnowledge,
    translated: Option<&'a NovelTranslation>,
    overwrite: bool,
}

fn analysis_verdict(input: &AnalysisInput, chapter: &ChapterRow, paragraphs: usize) -> Verdict {
    if paragraphs == 0 {
        return Verdict::Skip("the chapter has no paragraphs".to_string());
    }
    if let Some(book) = input.translated
        && !book.chapters.get(&chapter.id).is_some_and(has_translation)
    {
        return Verdict::Skip(format!(
            "has no {} translation to analyze",
            input.lang.as_str()
        ));
    }
    let Some(analyzed) = input.knowledge.analyzed.get(&chapter.seq) else {
        return Verdict::Run(None);
    };
    if analyzed.stale {
        return Verdict::Run(Some(
            "the analysis is out of date and will be replaced".to_string(),
        ));
    }
    if input.overwrite {
        return Verdict::Run(Some("replaces the existing analysis".to_string()));
    }
    Verdict::Skip(format!(
        "already analyzed ({} entities, {} facts); set overwrite to analyze it again",
        analyzed.entities, analyzed.facts
    ))
}
