use super::*;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::text::text_hash;
use crate::features::novel::files::NovelFiles;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelWorkspace;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const TEXT: &str = "Lin Mo drew his sword.";

struct Fixture {
    _dir: TempDir,
    novel: NovelWorkspace,
    knowledge: KnowledgeWorkspace,
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
    Fixture {
        novel: NovelWorkspace::new(dir.path().to_path_buf()),
        knowledge: KnowledgeWorkspace::new(dir.path().to_path_buf()),
        _dir: dir,
    }
}

fn novel_input() -> NovelInput {
    NovelInput {
        title: "Book".to_string(),
        name: String::new(),
        author: String::new(),
        lang: "ZH".to_string(),
        description: String::new(),
        tags: Vec::new(),
    }
}

fn evidence(p: usize, q: &str) -> AnalysisEvidence {
    AnalysisEvidence {
        p,
        q: q.to_string(),
    }
}

fn entity(id: &str, kind: &str, name: &str, ev: Vec<AnalysisEvidence>) -> AnalysisEntity {
    AnalysisEntity {
        id: id.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev,
    }
}

fn analysis(
    source_hash: &str,
    entities: Vec<AnalysisEntity>,
    facts: Vec<AnalysisFact>,
) -> ChapterAnalysis {
    ChapterAnalysis {
        ontology: 1,
        source_hash: source_hash.to_string(),
        analyzed_at: "2026-01-01T00:00:00Z".to_string(),
        entities,
        facts,
    }
}

fn two_chapters(fixture: &Fixture) -> (i64, Vec<String>) {
    let novel = fixture.novel.create(novel_input()).unwrap();
    let mut ids = Vec::new();
    for title in ["One", "Two"] {
        let chapter = fixture.novel.chapter_add(novel.id, title).unwrap();
        fixture
            .novel
            .paragraph_add(novel.id, &chapter.id, TEXT)
            .unwrap();
        ids.push(chapter.id);
    }
    (novel.id, ids)
}

fn entities_of(
    knowledge: &WireKnowledge,
) -> Vec<&crate::features::knowledge::models::KnowledgeEntity> {
    knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) => Some(entity),
            KnowledgeItem::Fact(_) => None,
        })
        .collect()
}

#[test]
fn open_without_a_workspace_is_no_workspace() {
    let error = KnowledgeService::new()
        .open(&WorkspaceSession::new())
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::NoWorkspace);
}

#[test]
fn rejects_unknown_langs_and_unknown_novels() {
    let fixture = fixture();
    let novel = fixture.novel.create(novel_input()).unwrap();

    let lang = fixture.knowledge.get(novel.id, "FR").unwrap_err();
    assert_eq!(lang.code, KnowledgeErrorCode::InvalidInput);
    assert!(lang.detail.contains("unsupported lang 'FR'"));
    let missing = fixture.knowledge.get(novel.id + 100, "src").unwrap_err();
    assert_eq!(missing.code, KnowledgeErrorCode::NotFound);
}

#[test]
fn a_novel_without_analysis_files_is_empty() {
    let fixture = fixture();
    let (novel_id, _) = two_chapters(&fixture);

    let knowledge = fixture.knowledge.get(novel_id, "src").unwrap();

    assert_eq!(knowledge.lang, "src");
    assert!(knowledge.items.is_empty());
    assert!(knowledge.analyzed.is_empty());
}

#[test]
fn merges_the_chapter_files_in_seq_order() {
    let fixture = fixture();
    let (novel_id, ids) = two_chapters(&fixture);
    let files = KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf());
    let fresh = text_hash(&[TEXT.to_string()]);
    files
        .write(
            novel_id,
            KnowledgeLang::Src,
            &ids[0],
            &analysis(
                &fresh,
                vec![
                    entity(
                        "E1",
                        "character",
                        "Lin Mo",
                        vec![evidence(1, "drew his sword")],
                    ),
                    entity("E2", "place", "Sect", Vec::new()),
                ],
                vec![AnalysisFact {
                    id: "F1".to_string(),
                    pred: "located_in".to_string(),
                    subject: "E1".to_string(),
                    object: Some("E2".to_string()),
                    ev: vec![evidence(1, "Lin Mo")],
                }],
            ),
        )
        .unwrap();
    files
        .write(
            novel_id,
            KnowledgeLang::Src,
            &ids[1],
            &analysis(
                "outdated",
                vec![entity(
                    "E1",
                    "character",
                    "lin mo",
                    vec![evidence(1, "never said")],
                )],
                Vec::new(),
            ),
        )
        .unwrap();

    let knowledge = fixture.knowledge.get(novel_id, "src").unwrap();

    let entities = entities_of(&knowledge);
    let lin = entities
        .iter()
        .find(|entity| entity.name == "Lin Mo")
        .unwrap();
    assert_eq!(entities.len(), 2);
    assert_eq!(lin.ev.len(), 2);
    assert_eq!(lin.ev[0].chapter, 1);
    assert!(lin.ev[0].verified);
    assert_eq!(lin.ev[1].chapter, 2);
    assert!(!lin.ev[1].verified);
    assert_eq!(lin.stale, vec![2]);
    assert_eq!(knowledge.items.len(), 3);
    assert_eq!(
        knowledge.analyzed.keys().copied().collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert!(!knowledge.analyzed[&1].stale);
    assert_eq!(knowledge.analyzed[&1].entities, 2);
    assert_eq!(knowledge.analyzed[&1].facts, 1);
    assert!(knowledge.analyzed[&2].stale);
}

#[test]
fn load_chapters_skips_chapters_without_a_file() {
    let fixture = fixture();
    let (novel_id, ids) = two_chapters(&fixture);
    KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf())
        .write(
            novel_id,
            KnowledgeLang::Src,
            &ids[1],
            &analysis("x", Vec::new(), Vec::new()),
        )
        .unwrap();

    let loaded = fixture
        .knowledge
        .load_chapters(novel_id, KnowledgeLang::Src)
        .unwrap();

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].seq, 2);
    assert_eq!(loaded[0].id, ids[1]);
    assert!(!loaded[0].dirty);
    assert_eq!(loaded[0].text, Some(vec![TEXT.to_string()]));
}

#[test]
fn a_corrupt_analysis_file_is_an_io_error_naming_the_file() {
    let fixture = fixture();
    let (novel_id, ids) = two_chapters(&fixture);
    let dir = NovelFiles::new(fixture.knowledge.dir().to_path_buf())
        .novel_dir(novel_id)
        .join("knowledgebase_src");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(format!("chapter_{}.json", ids[0])), "{ broken").unwrap();

    let error = fixture.knowledge.get(novel_id, "src").unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::Io);
    assert!(error.detail.contains(&format!("chapter_{}.json", ids[0])));
}
