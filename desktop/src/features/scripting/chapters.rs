use crate::features::novel::models::ChapterRow;
use crate::features::novel::repository::NovelRepository;
use crate::features::project::models::ProjectResult;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::models::ScriptUnit;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::TranslationTarget;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use std::path::Path;

const TRANSLATION_KIND: &str = "translation";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectChapter {
    pub id: String,
    pub seq: i64,
    pub title: String,
}

pub fn project_chapters(
    workspace_dir: &Path,
    project: &ProjectSummary,
) -> ProjectResult<Vec<ProjectChapter>> {
    let Some(novel_id) = project.novel_id else {
        return Ok(Vec::new());
    };
    let db = Database::open_read_only(&workspace_dir.join(WORKSPACE_DB_FILE))?;
    let rows = NovelRepository::new(db.connection()).list_chapters(novel_id)?;
    if project.src_kind.as_deref() != Some(TRANSLATION_KIND) {
        return Ok(rows.into_iter().map(original_chapter).collect());
    }
    let Some(target) = project
        .src_lang
        .as_deref()
        .and_then(TranslationTarget::parse)
    else {
        return Ok(Vec::new());
    };
    translated_chapters(workspace_dir, novel_id, target, rows)
}

pub fn resolve_unit(unit: &mut ScriptUnit, chapters: &[ProjectChapter]) {
    let Some(chapter) = unit
        .chapter_id
        .as_deref()
        .and_then(|id| chapters.iter().find(|chapter| chapter.id == id))
    else {
        return;
    };
    unit.no = chapter.seq;
    unit.ch = Some(chapter.seq);
    unit.title.clone_from(&chapter.title);
}

fn translated_chapters(
    workspace_dir: &Path,
    novel_id: i64,
    target: TranslationTarget,
    rows: Vec<ChapterRow>,
) -> ProjectResult<Vec<ProjectChapter>> {
    let files = TranslationFiles::new(workspace_dir.to_path_buf());
    let mut chapters = Vec::new();
    for row in rows {
        let Some(translation) = files.read_chapter(novel_id, target, &row.id)? else {
            continue;
        };
        if has_translation(&translation) {
            chapters.push(translated_chapter(row, &translation));
        }
    }
    Ok(chapters)
}

fn has_translation(translation: &ChapterFile) -> bool {
    !translation.title.trim().is_empty() || !translation.paragraphs.is_empty()
}

fn original_chapter(row: ChapterRow) -> ProjectChapter {
    let title = display_title(&row.title, row.seq);
    ProjectChapter {
        id: row.id,
        seq: row.seq,
        title,
    }
}

fn translated_chapter(row: ChapterRow, translation: &ChapterFile) -> ProjectChapter {
    let translated = translation.title.trim();
    if translated.is_empty() {
        return original_chapter(row);
    }
    ProjectChapter {
        id: row.id,
        seq: row.seq,
        title: translated.to_string(),
    }
}

fn display_title(title: &str, seq: i64) -> String {
    let title = title.trim();
    if title.is_empty() {
        format!("Chapter {seq}")
    } else {
        title.to_string()
    }
}
