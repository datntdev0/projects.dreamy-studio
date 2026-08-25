use super::*;
use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::text::text_hash;
use crate::features::novel::models::NovelInput;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::NovelWrite;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const TEXT: &str = "Lin Mo drew his sword.";

struct Fixture {
    _dir: TempDir,
    workspace: NovelWorkspace,
    knowledge: KnowledgeWorkspace,
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
