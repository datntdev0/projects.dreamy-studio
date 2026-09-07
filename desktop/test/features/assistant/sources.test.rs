use super::*;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::text::text_hash;
use crate::features::library::models::VoiceEngineKind;
use crate::features::library::models::VoiceGender;
use crate::features::library::models::VoiceInput;
use crate::features::library::models::VoiceSource as VoiceOrigin;
use crate::features::novel::models::NovelInput;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::TaskRequest;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::ScriptUnit;
use crate::features::translation::service::TranslatedRun;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::assistant::FakeAudiobooks;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeProjects;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::FakeVoices;
use crate::testing::assistant::NovelWrite;
use crate::testing::assistant::TranslationWrite;
use crate::testing::assistant::audiobook_fixture;
use crate::testing::assistant::project_chapter_fixture;
use crate::testing::assistant::project_summary;
use crate::testing::assistant::script_block;
use crate::testing::assistant::script_fixture;
use crate::testing::assistant::voice_fixture;
use crate::testing::project::create_project;
use crate::testing::project::project_workspace;
use rusqlite::Connection;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const TEXT: &str = "Lin Mo drew his sword.";

struct Fixture {
    _dir: TempDir,
    workspace: NovelWorkspace,
    knowledge: KnowledgeWorkspace,
    translation: TranslationWorkspace,
    novel_id: i64,
    chapter_id: String,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    drop(db);
    let workspace = NovelWorkspace::new(dir.path().to_path_buf());
    let knowledge = KnowledgeWorkspace::new(dir.path().to_path_buf());
    let translation = TranslationWorkspace::new(dir.path().to_path_buf());
    let novel = workspace
        .create(NovelInput {
            title: "Book".to_string(),
            name: String::new(),
            author: "Someone".to_string(),
            lang: "ZH".to_string(),
            description: String::new(),
            tags: Vec::new(),
        })
        .unwrap();
    let chapter = workspace.chapter_add(novel.id, "One").unwrap();
    workspace
        .paragraph_add(novel.id, &chapter.id, TEXT)
        .unwrap();
    workspace
        .paragraph_add(novel.id, &chapter.id, "Rain fell.")
        .unwrap();
    Fixture {
        _dir: dir,
        workspace,
        knowledge,
        translation,
        novel_id: novel.id,
        chapter_id: chapter.id,
    }
}

fn analyze(fixture: &Fixture) {
    let paragraphs = vec![TEXT.to_string(), "Rain fell.".to_string()];
    let analysis = ChapterAnalysis {
        ontology: 1,
        source_hash: text_hash(&paragraphs),
        analyzed_at: "2026-01-01T00:00:00Z".to_string(),
        entities: vec![AnalysisEntity {
            id: "E1".to_string(),
            kind: "persona".to_string(),
            name: "Lin Mo".to_string(),
            titles: Vec::new(),
            aliases: Vec::new(),
            ev: vec![AnalysisEvidence {
                p: 1,
                q: "Lin Mo".to_string(),
            }],
        }],
        facts: Vec::new(),
    };
    KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf())
        .write(
            fixture.novel_id,
            KnowledgeLang::Src,
            &fixture.chapter_id,
            &analysis,
        )
        .unwrap();
}

fn entity_names(knowledge: &WireKnowledge) -> Vec<String> {
    knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) => Some(entity.name.clone()),
            KnowledgeItem::Fact(_) => None,
        })
        .collect()
}

#[test]
fn novel_adapter_reads_novels_chapters_and_paragraphs() {
    let fixture = fixture();
    let source: &dyn NovelSource = &fixture.workspace;

    let novels = source.list().unwrap();
    let chapters = source.chapters(fixture.novel_id).unwrap();
    let paragraphs = source
        .chapter_read(fixture.novel_id, &fixture.chapter_id)
        .unwrap();

    assert_eq!(novels.len(), 1);
    assert_eq!(novels[0].title, "Book");
    assert_eq!(chapters.len(), 1);
    assert_eq!(chapters[0].title, "One");
    assert_eq!(paragraphs.len(), 2);
    assert_eq!(paragraphs[0].text, TEXT);
}

#[test]
fn novel_adapter_updates_metadata() {
    let fixture = fixture();
    let source: &dyn NovelSource = &fixture.workspace;
    let patch = NovelPatch {
        title: Some("Renamed".to_string()),
        tags: Some(vec!["epic".to_string()]),
        ..NovelPatch::default()
    };

    let updated = source.update(fixture.novel_id, patch).unwrap();
    let listed = source.list().unwrap();

    assert_eq!(updated.title, "Renamed");
    assert_eq!(updated.author, "Someone");
    assert_eq!(updated.tags, vec!["epic".to_string()]);
    assert_eq!(listed[0].title, "Renamed");
}

#[test]
fn novel_adapter_updates_a_paragraph_and_renames_a_chapter() {
    let fixture = fixture();
    let source: &dyn NovelSource = &fixture.workspace;

    source
        .paragraph_update(fixture.novel_id, &fixture.chapter_id, 2, "Snow fell.")
        .unwrap();
    let renamed = source
        .chapter_rename(fixture.novel_id, &fixture.chapter_id, "Prologue")
        .unwrap();
    let paragraphs = source
        .chapter_read(fixture.novel_id, &fixture.chapter_id)
        .unwrap();

    assert_eq!(renamed.title, "Prologue");
    assert_eq!(paragraphs[0].text, TEXT);
    assert_eq!(paragraphs[1].text, "Snow fell.");
    assert_eq!(
        source.chapters(fixture.novel_id).unwrap()[0].title,
        "Prologue"
    );
}

#[test]
fn novel_adapter_reports_failures_as_text() {
    let fixture = fixture();
    let source: &dyn NovelSource = &fixture.workspace;

    let update = source
        .update(fixture.novel_id + 100, NovelPatch::default())
        .unwrap_err();
    let paragraph = source
        .paragraph_update(fixture.novel_id, &fixture.chapter_id, 9, "x")
        .unwrap_err();
    let rename = source
        .chapter_rename(fixture.novel_id, &fixture.chapter_id, "  ")
        .unwrap_err();
    let read = source
        .chapter_read(fixture.novel_id, "missing")
        .unwrap_err();

    assert!(!update.is_empty());
    assert!(!paragraph.is_empty());
    assert!(!rename.is_empty());
    assert!(!read.is_empty());
}

#[test]
fn knowledge_adapter_reads_merged_knowledge() {
    let fixture = fixture();
    analyze(&fixture);
    let source: &dyn KnowledgeSource = &fixture.knowledge;

    let knowledge = source.get(fixture.novel_id, "src").unwrap();

    assert_eq!(knowledge.lang, "src");
    assert_eq!(entity_names(&knowledge), vec!["Lin Mo".to_string()]);
}

#[test]
fn knowledge_adapter_applies_edits_and_persists_them() {
    let fixture = fixture();
    analyze(&fixture);
    let source: &dyn KnowledgeSource = &fixture.knowledge;
    let id = match &source.get(fixture.novel_id, "src").unwrap().items[0] {
        KnowledgeItem::Entity(entity) => entity.id.clone(),
        KnowledgeItem::Fact(_) => unreachable!(),
    };
    let edits = vec![KnowledgeEdit::Rename {
        id,
        name: "Lin".to_string(),
    }];

    let result = source.edit(fixture.novel_id, "src", edits).unwrap();
    let reread = source.get(fixture.novel_id, "src").unwrap();

    assert_eq!(entity_names(&result.knowledge), vec!["Lin".to_string()]);
    assert_eq!(entity_names(&reread), vec!["Lin".to_string()]);
}

#[test]
fn knowledge_adapter_previews_edits_without_persisting_them() {
    let fixture = fixture();
    analyze(&fixture);
    let source: &dyn KnowledgeSource = &fixture.knowledge;
    let id = match &source.get(fixture.novel_id, "src").unwrap().items[0] {
        KnowledgeItem::Entity(entity) => entity.id.clone(),
        KnowledgeItem::Fact(_) => unreachable!(),
    };
    let edits = vec![KnowledgeEdit::Rename {
        id,
        name: "Lin".to_string(),
    }];

    let preview = source.preview(fixture.novel_id, "src", edits).unwrap();
    let reread = source.get(fixture.novel_id, "src").unwrap();
    let empty = source
        .preview(fixture.novel_id, "src", Vec::new())
        .unwrap_err();

    assert_eq!(entity_names(&preview), vec!["Lin".to_string()]);
    assert_eq!(entity_names(&reread), vec!["Lin Mo".to_string()]);
    assert!(empty.contains("no edits"));
}

#[test]
fn knowledge_adapter_reports_failures_as_text() {
    let fixture = fixture();
    analyze(&fixture);
    let source: &dyn KnowledgeSource = &fixture.knowledge;

    let lang = source.get(fixture.novel_id, "FR").unwrap_err();
    let missing = source.get(fixture.novel_id + 100, "src").unwrap_err();
    let empty = source
        .edit(fixture.novel_id, "src", Vec::new())
        .unwrap_err();
    let unknown = source
        .edit(
            fixture.novel_id,
            "src",
            vec![KnowledgeEdit::Del {
                id: "nope".to_string(),
            }],
        )
        .unwrap_err();

    assert!(lang.contains("unsupported lang 'FR'"));
    assert!(!missing.is_empty());
    assert!(empty.contains("no edits"));
    assert!(!unknown.is_empty());
}

#[test]
fn fake_novels_apply_and_record_writes_in_memory() {
    let fake = FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 1, "One", &["a", "b"]);
    let source: &dyn NovelSource = &fake;
    let patch = NovelPatch {
        author: Some("New".to_string()),
        ..NovelPatch::default()
    };

    let updated = source.update(1, patch.clone()).unwrap();
    source
        .paragraph_update(1, "chapter-1-1", 2, "changed")
        .unwrap();
    let renamed = source.chapter_rename(1, "chapter-1-1", "Intro").unwrap();

    assert_eq!(updated.author, "New");
    assert_eq!(renamed.title, "Intro");
    assert_eq!(fake.paragraph_texts("chapter-1-1"), vec!["a", "changed"]);
    assert_eq!(
        fake.writes(),
        vec![
            NovelWrite::Update { novel_id: 1, patch },
            NovelWrite::Paragraph {
                novel_id: 1,
                chapter_id: "chapter-1-1".to_string(),
                n: 2,
                text: "changed".to_string(),
            },
            NovelWrite::Rename {
                novel_id: 1,
                chapter_id: "chapter-1-1".to_string(),
                title: "Intro".to_string(),
            },
        ]
    );
    assert!(source.paragraph_update(1, "chapter-1-1", 3, "x").is_err());
    assert!(source.update(2, NovelPatch::default()).is_err());
    assert_eq!(fake.writes().len(), 3);
}

#[test]
fn fake_knowledge_serves_configured_items_and_records_edits() {
    let seeded = FakeKnowledge::new().with_entity("e1", "persona", "Lan", &[], &[], &[1]);
    let fake = FakeKnowledge::new().with_knowledge(seeded.get(1, "src").unwrap());
    let source: &dyn KnowledgeSource = &fake;
    let edits = vec![KnowledgeEdit::Del {
        id: "e1".to_string(),
    }];

    let result = source.edit(1, "VI", edits.clone()).unwrap();

    assert_eq!(entity_names(&result.knowledge), vec!["Lan".to_string()]);
    assert_eq!(result.knowledge.lang, "VI");
    assert_eq!(
        fake.calls(),
        vec![crate::testing::assistant::KnowledgeCall {
            novel_id: 1,
            lang: "VI".to_string(),
            edits,
        }]
    );
}

#[test]
fn fake_knowledge_previews_simple_edits_or_the_configured_result() {
    let fake = FakeKnowledge::new()
        .with_entity("e1", "persona", "Lan", &[], &[], &[1])
        .with_entity("e2", "persona", "Mai", &[], &[], &[1]);
    let source: &dyn KnowledgeSource = &fake;
    let edits = vec![
        KnowledgeEdit::Rename {
            id: "e1".to_string(),
            name: "Lan Anh".to_string(),
        },
        KnowledgeEdit::Del {
            id: "e2".to_string(),
        },
    ];

    let preview = source.preview(1, "src", edits.clone()).unwrap();

    assert_eq!(entity_names(&preview), vec!["Lan Anh".to_string()]);
    assert_eq!(entity_names(&source.get(1, "src").unwrap()).len(), 2);
    assert_eq!(fake.previews().len(), 1);
    assert!(fake.calls().is_empty());
    let seeded = FakeKnowledge::new().with_entity("e9", "persona", "Zed", &[], &[], &[1]);
    let configured = FakeKnowledge::new().with_preview(seeded.get(1, "src").unwrap().items);
    let result = configured.preview(1, "src", edits.clone()).unwrap();
    assert_eq!(entity_names(&result), vec!["Zed".to_string()]);
    let failing = FakeKnowledge::new().with_preview_failure("nope");
    assert_eq!(failing.preview(1, "src", edits).unwrap_err(), "nope");
}

fn translate(fixture: &Fixture) {
    fixture
        .translation
        .save_run(
            fixture.novel_id,
            "VI",
            &fixture.chapter_id,
            None,
            TranslatedRun {
                title: "Chuong mot".to_string(),
                paragraphs: vec!["Lam Mo rut kiem.".to_string(), "Mua roi.".to_string()],
            },
        )
        .unwrap();
}

fn entry(src: &str, dst: &str) -> DictInput {
    DictInput {
        src: src.to_string(),
        dst: dst.to_string(),
        kind: "name".to_string(),
        note: String::new(),
    }
}

#[test]
fn translation_adapter_reads_the_translation_of_a_novel() {
    let fixture = fixture();
    translate(&fixture);
    let source: &dyn TranslationSource = &fixture.translation;

    let book = source.get(fixture.novel_id, "VI").unwrap();
    let empty = source.get(fixture.novel_id, "EN").unwrap();

    let chapter = &book.chapters[&fixture.chapter_id];
    assert_eq!(chapter.title, "Chuong mot");
    assert_eq!(chapter.paragraphs.len(), 2);
    assert_eq!(chapter.paragraphs[0].text, "Lam Mo rut kiem.");
    assert!(book.dict.is_empty());
    assert!(empty.chapters.is_empty());
}

#[test]
fn translation_adapter_saves_a_passage() {
    let fixture = fixture();
    translate(&fixture);
    let source: &dyn TranslationSource = &fixture.translation;

    let saved = source
        .passage_save(fixture.novel_id, "VI", &fixture.chapter_id, 2, "Tuyet roi.")
        .unwrap();
    let reread = source.get(fixture.novel_id, "VI").unwrap();

    assert_eq!(saved.paragraphs[1].text, "Tuyet roi.");
    assert_eq!(
        reread.chapters[&fixture.chapter_id].paragraphs[1].text,
        "Tuyet roi."
    );
    assert_eq!(
        reread.chapters[&fixture.chapter_id].paragraphs[0].text,
        "Lam Mo rut kiem."
    );
}

#[test]
fn translation_adapter_adds_updates_and_deletes_dictionary_entries() {
    let fixture = fixture();
    let source: &dyn TranslationSource = &fixture.translation;

    let added = source
        .dict_add(fixture.novel_id, "VI", entry("Lin Mo", "Lam Mo"))
        .unwrap();
    let patch = DictPatch {
        dst: Some("Lam Mac".to_string()),
        ..DictPatch::default()
    };
    let updated = source
        .dict_update(fixture.novel_id, added.entry.id, patch)
        .unwrap();
    let listed = source.get(fixture.novel_id, "VI").unwrap().dict;
    source
        .dict_delete(fixture.novel_id, added.entry.id)
        .unwrap();
    let after = source.get(fixture.novel_id, "VI").unwrap().dict;

    assert_eq!(added.entry.src, "Lin Mo");
    assert_eq!(updated.entry.dst, "Lam Mac");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].dst, "Lam Mac");
    assert!(after.is_empty());
}

#[test]
fn translation_adapter_reports_failures_as_text() {
    let fixture = fixture();
    translate(&fixture);
    let source: &dyn TranslationSource = &fixture.translation;
    source
        .dict_add(fixture.novel_id, "VI", entry("Lin Mo", "Lam Mo"))
        .unwrap();

    let target = source.get(fixture.novel_id, "FR").unwrap_err();
    let novel = source.get(fixture.novel_id + 100, "VI").unwrap_err();
    let passage = source
        .passage_save(fixture.novel_id, "VI", &fixture.chapter_id, 9, "x")
        .unwrap_err();
    let duplicate = source
        .dict_add(fixture.novel_id, "VI", entry("Lin Mo", "Other"))
        .unwrap_err();
    let update = source
        .dict_update(fixture.novel_id, 999, DictPatch::default())
        .unwrap_err();
    let delete = source.dict_delete(fixture.novel_id, 999).unwrap_err();

    assert!(target.contains("unsupported target"));
    assert!(!novel.is_empty());
    assert!(passage.contains("out of range"));
    assert!(duplicate.contains("already exists"));
    assert!(update.contains("does not exist"));
    assert!(delete.contains("does not exist"));
}

#[test]
fn fake_translation_serves_books_per_novel_and_target() {
    let fake = FakeTranslation::new()
        .with_guidelines(1, "VI", "natural")
        .with_translated_chapter(1, "vi", "c1", "One", &["a", "b"])
        .with_entry(1, "VI", "Lin", "Lam", "name", "");
    let source: &dyn TranslationSource = &fake;

    let book = source.get(1, "VI").unwrap();

    assert_eq!(book.guidelines, "natural");
    assert_eq!(book.chapters["c1"].paragraphs.len(), 2);
    assert_eq!(book.dict[0].id, 1);
    assert!(source.get(1, "EN").unwrap().dict.is_empty());
    assert!(source.get(2, "VI").unwrap().chapters.is_empty());
    assert!(source.get(1, "FR").is_err());
}

#[test]
fn fake_translation_applies_and_records_writes_in_memory() {
    let fake = FakeTranslation::new()
        .with_translated_chapter(1, "VI", "c1", "One", &["a", "b"])
        .with_entry(1, "VI", "Lin", "Lam", "name", "");
    let source: &dyn TranslationSource = &fake;
    let patch = DictPatch {
        note: Some("hero".to_string()),
        ..DictPatch::default()
    };

    source.passage_save(1, "VI", "c1", 2, "changed").unwrap();
    let added = source.dict_add(1, "VI", entry("Moon", "Trang")).unwrap();
    let updated = source.dict_update(1, 1, patch.clone()).unwrap();
    source.dict_delete(1, added.entry.id).unwrap();

    assert_eq!(fake.passage_text(1, "VI", "c1", 2), "changed");
    assert_eq!(updated.entry.note, "hero");
    assert_eq!(fake.book(1, "VI").dict.len(), 1);
    assert_eq!(
        fake.writes(),
        vec![
            TranslationWrite::Passage {
                novel_id: 1,
                target: "VI".to_string(),
                chapter_id: "c1".to_string(),
                n: 2,
                text: "changed".to_string(),
            },
            TranslationWrite::DictAdd {
                novel_id: 1,
                target: "VI".to_string(),
                input: entry("Moon", "Trang"),
            },
            TranslationWrite::DictUpdate {
                novel_id: 1,
                id: 1,
                patch,
            },
            TranslationWrite::DictDelete {
                novel_id: 1,
                id: added.entry.id,
            },
        ]
    );
}

#[test]
fn fake_translation_refuses_bad_writes_without_recording_them() {
    let fake = FakeTranslation::new()
        .with_translated_chapter(1, "VI", "c1", "One", &["a"])
        .with_entry(1, "VI", "Lin", "Lam", "name", "");
    let source: &dyn TranslationSource = &fake;

    assert!(source.passage_save(1, "VI", "c9", 1, "x").is_err());
    assert!(source.passage_save(1, "VI", "c1", 2, "x").is_err());
    assert!(source.dict_add(1, "VI", entry("Lin", "x")).is_err());
    assert!(source.dict_add(1, "VI", entry(" ", "x")).is_err());
    assert!(source.dict_update(1, 9, DictPatch::default()).is_err());
    assert!(source.dict_delete(1, 9).is_err());
    assert!(fake.writes().is_empty());
}

#[test]
fn failing_fake_translation_rejects_every_call() {
    let fake = FakeTranslation::new().failing("boom");
    let source: &dyn TranslationSource = &fake;

    assert_eq!(source.get(1, "VI").unwrap_err(), "boom");
    assert_eq!(
        source.passage_save(1, "VI", "c", 1, "x").unwrap_err(),
        "boom"
    );
    assert_eq!(
        source.dict_add(1, "VI", entry("a", "b")).unwrap_err(),
        "boom"
    );
    assert_eq!(
        source.dict_update(1, 1, DictPatch::default()).unwrap_err(),
        "boom"
    );
    assert_eq!(source.dict_delete(1, 1).unwrap_err(), "boom");
}

#[test]
fn script_adapter_reads_the_saved_script_and_its_module_states() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    ScriptingWorkspace::new(projects.clone())
        .save(project_id, script_fixture())
        .unwrap();
    let source: &dyn ScriptSource = &ProjectScripts::new(projects);

    let script = source.script(project_id).unwrap().unwrap();
    let modules = source.modules(project_id).unwrap();

    assert_eq!(script.units.len(), 1);
    assert_eq!(script.units[0].blocks.as_ref().unwrap().len(), 3);
    assert_eq!(script.cfg.preset, "audiobook");
    assert_eq!(
        modules
            .iter()
            .map(|state| state.id.as_str())
            .collect::<Vec<_>>(),
        ["scripting", "audiobook"]
    );
}

#[test]
fn script_adapter_has_no_script_and_no_chapters_for_a_fresh_project_without_a_novel() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let source: &dyn ScriptSource = &ProjectScripts::new(projects);

    assert!(source.script(project_id).unwrap().is_none());
    assert!(source.chapters(project_id).unwrap().is_empty());
}

#[test]
fn script_adapter_saves_a_unit_and_the_extra_cast_through_the_workspace() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    ScriptingWorkspace::new(projects.clone())
        .save(project_id, script_fixture())
        .unwrap();
    let source: &dyn ScriptSource = &ProjectScripts::new(projects);
    let mut unit = source.script(project_id).unwrap().unwrap().units.remove(0);
    unit.blocks = Some(vec![script_block("B9", "narration", "Rewritten.", "")]);
    let cast = vec![CastMember {
        id: "spk1".to_string(),
        name: "Gatekeeper".to_string(),
        kind: "extra".to_string(),
        c: 1,
    }];

    source.cast_save(project_id, cast.clone()).unwrap();
    source.unit_save(project_id, unit, 9).unwrap();

    let saved = source.script(project_id).unwrap().unwrap();
    assert_eq!(saved.extra_cast, cast);
    assert_eq!(saved.seq, 9);
    let blocks = saved.units[0].blocks.as_ref().unwrap();
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].id, "B9");
}

#[test]
fn script_adapter_cannot_save_before_a_script_exists() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let source: &dyn ScriptSource = &ProjectScripts::new(projects);
    let unit = ScriptUnit {
        id: "c1".to_string(),
        chapter_id: Some("c1".to_string()),
        blocks: Some(Vec::new()),
        ..ScriptUnit::default()
    };

    assert!(source.unit_save(project_id, unit, 1).is_err());
    assert!(source.cast_save(project_id, Vec::new()).is_err());
    assert!(source.unit_save(404, ScriptUnit::default(), 1).is_err());
}

#[test]
fn fake_scripts_record_their_writes_in_order() {
    let fake = FakeScripts::with_script(script_fixture(), vec![project_chapter_fixture()]);
    let source: &dyn ScriptSource = &fake;

    source.cast_save(1, Vec::new()).unwrap();
    source.unit_save(1, ScriptUnit::default(), 7).unwrap();

    assert_eq!(fake.write_order(), ["cast", "unit"]);
    assert_eq!(fake.saved_casts(), vec![Vec::<CastMember>::new()]);
    assert_eq!(fake.saved_units()[0].1, 7);
}

#[test]
fn failing_fake_scripts_reject_only_unit_saves() {
    let fake = FakeScripts::default().failing_unit_saves();
    let source: &dyn ScriptSource = &fake;

    assert_eq!(
        source.unit_save(1, ScriptUnit::default(), 1).unwrap_err(),
        "disk is full"
    );
    assert!(source.cast_save(1, Vec::new()).is_ok());
    assert!(fake.saved_units().is_empty());
}

#[test]
fn script_adapter_reports_an_unknown_project_as_text() {
    let (_dir, projects) = project_workspace();
    let source: &dyn ScriptSource = &ProjectScripts::new(projects);

    assert!(source.chapters(404).is_err());
    assert!(source.script(404).is_err());
    assert!(source.modules(404).is_err());
}

#[test]
fn audiobook_adapter_reads_the_configured_voices_and_empty_units() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let workspace = AudiobookWorkspace::new(projects);
    let source: &dyn AudiobookSource = &workspace;
    assert!(source.book(project_id).unwrap().is_none());

    let voices = audiobook_fixture().voices;
    workspace
        .config_save(
            project_id,
            AudiobookConfig {
                voices: voices.clone(),
                ..AudiobookConfig::default()
            },
        )
        .unwrap();

    let book = source.book(project_id).unwrap().unwrap();
    assert_eq!(book.voices, voices);
}

#[test]
fn audiobook_adapter_reports_an_unknown_project_as_text() {
    let (_dir, projects) = project_workspace();
    let source: &dyn AudiobookSource = &AudiobookWorkspace::new(projects);

    assert!(source.book(404).is_err());
}

#[test]
fn fake_scripts_serve_the_configured_script_chapters_and_modules() {
    let fake = FakeScripts::with_script(script_fixture(), vec![project_chapter_fixture()]);
    let source: &dyn ScriptSource = &fake;

    assert_eq!(source.chapters(1).unwrap().len(), 1);
    assert_eq!(source.script(1).unwrap().unwrap().units.len(), 1);
    assert!(source.modules(1).unwrap().is_empty());
    assert!(FakeScripts::default().script(1).unwrap().is_none());
}

#[test]
fn fake_audiobooks_serve_the_book_and_its_units() {
    let fake = FakeAudiobooks::with_book(audiobook_fixture());
    let source: &dyn AudiobookSource = &fake;

    assert_eq!(source.book(1).unwrap().unwrap().units.len(), 1);
    assert!(FakeAudiobooks::default().book(1).unwrap().is_none());
}

#[test]
fn project_adapter_updates_the_name_and_the_description() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let source: &dyn ProjectSource = &projects;
    let patch = ProjectPatch {
        name: Some(" Renamed ".to_string()),
        description: Some("About it".to_string()),
        modules: None,
    };

    let updated = source.update(project_id, patch).unwrap();

    assert_eq!(updated.name, "Renamed");
    assert_eq!(updated.description, "About it");
    assert_eq!(source.get(project_id).unwrap().unwrap().name, "Renamed");
}

#[test]
fn project_adapter_refuses_an_empty_name_and_an_unknown_project() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let source: &dyn ProjectSource = &projects;
    let blank = ProjectPatch {
        name: Some("  ".to_string()),
        ..ProjectPatch::default()
    };

    assert!(source.update(project_id, blank).is_err());
    assert!(source.update(404, ProjectPatch::default()).is_err());
    assert_eq!(source.get(project_id).unwrap().unwrap().name, "Book");
}

#[test]
fn audiobook_adapter_saves_a_clamped_mix_and_the_voices() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let workspace = AudiobookWorkspace::new(projects);
    let source: &dyn AudiobookSource = &workspace;
    let wide = MixSettings {
        gap: 99.0,
        ..MixSettings::default()
    };

    let stored = source.mix_save(project_id, wide).unwrap();
    let voices = audiobook_fixture().voices;
    let config = AudiobookConfig {
        voices: voices.clone(),
        mix: stored,
    };
    source.config_save(project_id, config).unwrap();

    assert_eq!(stored.gap, 5.0);
    let book = source.book(project_id).unwrap().unwrap();
    assert_eq!(book.mix.gap, 5.0);
    assert_eq!(book.voices, voices);
}

#[test]
fn audiobook_adapter_cannot_flag_a_block_without_audio() {
    let (_dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let source: &dyn AudiobookSource = &AudiobookWorkspace::new(projects);

    assert!(source.flag_set(project_id, "c1", "b2", "echo").is_err());
    assert!(source.flag_set(404, "c1", "b2", "echo").is_err());
}

#[test]
fn voice_adapter_lists_the_voices_of_the_library() {
    let (dir, _projects) = project_workspace();
    let workspace = LibraryWorkspace::with_gate(dir.path().to_path_buf(), Arc::new(Mutex::new(())));
    let source: &dyn VoiceSource = &workspace;
    assert!(source.list().unwrap().is_empty());
    let input = VoiceInput {
        name: "Mai Anh".to_string(),
        description: String::new(),
        engine: "vieneu-turbo".to_string(),
        engine_kind: VoiceEngineKind::Local,
        source: VoiceOrigin::Preset,
        language: "vi".to_string(),
        gender: VoiceGender::Female,
        preset: Some("Mai Anh".to_string()),
        reference: None,
        prompt: String::new(),
    };
    let created = workspace.voice_create(input).unwrap();

    let listed = source.list().unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.id);
    assert_eq!(listed[0].name, "Mai Anh");
}

#[test]
fn fake_projects_apply_and_record_an_update() {
    let fake = FakeProjects::with(vec![project_summary(1, None)]);
    let source: &dyn ProjectSource = &fake;
    let patch = ProjectPatch {
        name: Some(" New ".to_string()),
        ..ProjectPatch::default()
    };

    let updated = source.update(1, patch).unwrap();

    assert_eq!(updated.name, "New");
    assert_eq!(source.get(1).unwrap().unwrap().name, "New");
    assert_eq!(fake.updates().len(), 1);
    assert!(source.update(2, ProjectPatch::default()).is_err());
}

#[test]
fn fake_audiobooks_record_their_writes() {
    let fake = FakeAudiobooks::with_book(audiobook_fixture());
    let source: &dyn AudiobookSource = &fake;

    let mix = source
        .mix_save(
            1,
            MixSettings {
                gap: 99.0,
                ..MixSettings::default()
            },
        )
        .unwrap();
    source.config_save(1, AudiobookConfig::default()).unwrap();
    let flagged = source.flag_set(1, "c1", "b2", " echo ").unwrap();

    assert_eq!(mix.gap, 5.0);
    assert_eq!(flagged.flag, "echo");
    assert_eq!(fake.saved_mixes().len(), 1);
    assert_eq!(fake.saved_configs().len(), 1);
    assert_eq!(fake.flag_calls().len(), 1);
    assert!(source.flag_set(1, "c1", "missing", "x").is_err());
}

#[test]
fn fake_voices_serve_the_configured_library() {
    let fake = FakeVoices::with(vec![voice_fixture(7, "Mai Anh", VoiceGender::Female)]);
    let source: &dyn VoiceSource = &fake;

    assert_eq!(source.list().unwrap().len(), 1);
    assert!(FakeVoices::default().list().unwrap().is_empty());
}

const NOW: &str = "2026-11-17T00:00:00Z";

fn pipeline_source() -> (TempDir, WorkspacePipelines, i64, i64) {
    let (dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    let connection = Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    connection
        .execute(
            "INSERT INTO ws_novels (title, name, author, lang, description, origin, created_at,              updated_at) VALUES ('Novel', '', 'Author', 'ZH', '', 'created', ?1, ?1)",
            [NOW],
        )
        .unwrap();
    let novel_id = connection.last_insert_rowid();
    let source = WorkspacePipelines::new(dir.path().to_path_buf(), PipelineExecutor::new());
    (dir, source, novel_id, project_id)
}

fn insert_run(dir: &TempDir, owner: JobOwner, status: PipelineStatus) -> i64 {
    let connection = Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    let tasks = [TaskRequest {
        chapter_id: "chapter-one".to_string(),
        passage: None,
        segment_id: None,
    }];
    PipelineRepository::new(&connection)
        .insert_pipeline(owner, "translation", "VI", status, &tasks, NOW)
        .unwrap()
}

#[test]
fn pipeline_adapter_lists_the_history_of_one_owner_or_of_everyone() {
    let (dir, source, novel_id, project_id) = pipeline_source();
    let novel_run = insert_run(&dir, JobOwner::Novel(novel_id), PipelineStatus::Running);
    let project_run = insert_run(&dir, JobOwner::Project(project_id), PipelineStatus::Queued);

    let everyone = source.history(None, 10).unwrap();
    assert_eq!(
        everyone.iter().map(|run| run.id).collect::<Vec<_>>(),
        [project_run, novel_run]
    );
    let novel = source.history(Some(JobOwner::Novel(novel_id)), 10).unwrap();
    assert_eq!(novel.len(), 1);
    assert_eq!(novel[0].tasks.len(), 1);
    let limited = source.history(None, 1).unwrap();
    assert_eq!(limited[0].id, project_run);
}

#[test]
fn pipeline_adapter_reads_a_snapshot_or_nothing() {
    let (dir, source, novel_id, _) = pipeline_source();
    let run = insert_run(&dir, JobOwner::Novel(novel_id), PipelineStatus::Running);

    let snapshot = source.snapshot(run).unwrap().unwrap();

    assert_eq!(snapshot.id, run);
    assert_eq!(snapshot.novel_id, Some(novel_id));
    assert_eq!(snapshot.kind, "translation");
    assert_eq!(snapshot.tasks[0].chapter_id, "chapter-one");
    assert!(source.snapshot(run + 100).unwrap().is_none());
}

#[test]
fn pipeline_adapter_reports_a_missing_database_as_text() {
    let dir = TempDir::new().unwrap();
    let source = WorkspacePipelines::new(dir.path().to_path_buf(), PipelineExecutor::new());

    assert!(source.history(None, 10).is_err());
    assert!(source.snapshot(1).is_err());
}

#[test]
fn pipeline_adapter_cancels_through_the_executor() {
    let (_dir, source, _, _) = pipeline_source();

    assert!(!source.cancel(404));
}
