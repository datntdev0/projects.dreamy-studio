use super::*;
use crate::features::knowledge::merge::entity_id;
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

const SEEDED_TEXTS: [&str; 3] = [
    "Lin Mo drew his sword.",
    "Lin Mo sheathed his blade.",
    "The Sect gate stood open.",
];

fn seeded(fixture: &Fixture) -> (i64, Vec<String>) {
    let novel = fixture.novel.create(novel_input()).unwrap();
    let files = KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf());
    let mut ids = Vec::new();
    for (index, text) in SEEDED_TEXTS.iter().enumerate() {
        let chapter = fixture
            .novel
            .chapter_add(novel.id, &format!("Chapter {index}"))
            .unwrap();
        fixture
            .novel
            .paragraph_add(novel.id, &chapter.id, text)
            .unwrap();
        let hash = if index == 1 {
            "outdated".to_string()
        } else {
            text_hash(&[text.to_string()])
        };
        let entities = if index == 2 {
            vec![entity("E1", "organization", "Sect", Vec::new())]
        } else {
            vec![entity(
                "E1",
                "character",
                "Lin Mo",
                vec![evidence(1, "Lin Mo")],
            )]
        };
        files
            .write(
                novel.id,
                KnowledgeLang::Src,
                &chapter.id,
                &analysis(&hash, entities, Vec::new()),
            )
            .unwrap();
        ids.push(chapter.id);
    }
    (novel.id, ids)
}

fn snapshot(fixture: &Fixture, novel_id: i64, ids: &[String]) -> Vec<Vec<u8>> {
    let dir = NovelFiles::new(fixture.knowledge.dir().to_path_buf())
        .novel_dir(novel_id)
        .join("knowledgebase_src");
    ids.iter()
        .map(|id| std::fs::read(dir.join(format!("chapter_{id}.json"))).unwrap())
        .collect()
}

fn rename(id: &str, name: &str) -> KnowledgeEdit {
    KnowledgeEdit::Rename {
        id: id.to_string(),
        name: name.to_string(),
    }
}

#[test]
fn edit_rewrites_only_the_dirty_chapter_files() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    let before = snapshot(&fixture, novel_id, &ids);
    let old_id = entity_id("character", "Lin Mo");
    let new_id = entity_id("character", "Lin");

    let result = fixture
        .knowledge
        .edit(novel_id, "src", vec![rename(&old_id, "Lin")])
        .unwrap();

    let after = snapshot(&fixture, novel_id, &ids);
    assert_ne!(before[0], after[0]);
    assert_ne!(before[1], after[1]);
    assert_eq!(before[2], after[2]);
    assert_eq!(result.remap.get(&old_id), Some(&new_id));
    let names: Vec<&str> = entities_of(&result.knowledge)
        .iter()
        .map(|entity| entity.name.as_str())
        .collect();
    assert_eq!(names.len(), 2);
    assert!(names.contains(&"Lin"));
    assert!(names.contains(&"Sect"));
    assert_eq!(
        result.knowledge,
        fixture.knowledge.get(novel_id, "src").unwrap()
    );
}

#[test]
fn edit_keeps_the_analysis_header_of_the_chapters_it_rewrites() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);

    fixture
        .knowledge
        .edit(
            novel_id,
            "src",
            vec![rename(&entity_id("character", "Lin Mo"), "Lin")],
        )
        .unwrap();

    let loaded = fixture
        .knowledge
        .load_chapters(novel_id, KnowledgeLang::Src)
        .unwrap();
    assert_eq!(loaded[0].id, ids[0]);
    assert_eq!(
        loaded[0].file.source_hash,
        text_hash(&[SEEDED_TEXTS[0].to_string()])
    );
    assert_eq!(loaded[1].file.source_hash, "outdated");
    assert_eq!(loaded[0].file.analyzed_at, "2026-01-01T00:00:00Z");
    assert_eq!(loaded[0].file.ontology, 1);
    assert_eq!(loaded[0].file.entities[0].name, "Lin");
}

#[test]
fn a_failed_validation_leaves_every_file_byte_identical() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    let before = snapshot(&fixture, novel_id, &ids);

    let error = fixture
        .knowledge
        .edit(
            novel_id,
            "src",
            vec![rename(&entity_id("character", "Lin Mo"), "sword")],
        )
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert_eq!(snapshot(&fixture, novel_id, &ids), before);
}

#[test]
fn a_second_edit_that_fails_writes_nothing() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    let before = snapshot(&fixture, novel_id, &ids);

    let error = fixture
        .knowledge
        .edit(
            novel_id,
            "src",
            vec![
                rename(&entity_id("character", "Lin Mo"), "Lin"),
                rename(&entity_id("organization", "Sect"), "Nowhere"),
            ],
        )
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::TextNotFound);
    assert_eq!(snapshot(&fixture, novel_id, &ids), before);
}

#[test]
fn edit_rejects_empty_edits_and_unknown_langs() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    let before = snapshot(&fixture, novel_id, &ids);

    let empty = fixture
        .knowledge
        .edit(novel_id, "src", Vec::new())
        .unwrap_err();
    let lang = fixture
        .knowledge
        .edit(novel_id, "FR", vec![rename("E1", "Lin")])
        .unwrap_err();

    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(lang.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(snapshot(&fixture, novel_id, &ids), before);
}

#[test]
fn edit_of_an_unknown_novel_is_not_found() {
    let fixture = fixture();

    let error = fixture
        .knowledge
        .edit(99, "src", vec![rename("E1", "Lin")])
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
}

#[test]
fn stale_accept_rehashes_the_chapter_and_clears_the_flag() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    let before = snapshot(&fixture, novel_id, &ids);
    assert!(fixture.knowledge.get(novel_id, "src").unwrap().analyzed[&2].stale);

    let knowledge = fixture
        .knowledge
        .stale_accept(novel_id, "src", &[2])
        .unwrap();

    let after = snapshot(&fixture, novel_id, &ids);
    assert!(!knowledge.analyzed[&2].stale);
    assert!(
        entities_of(&knowledge)
            .iter()
            .all(|entity| entity.stale.is_empty())
    );
    assert_ne!(before[1], after[1]);
    assert_eq!(before[0], after[0]);
    assert_eq!(before[2], after[2]);
    let loaded = fixture
        .knowledge
        .load_chapters(novel_id, KnowledgeLang::Src)
        .unwrap();
    assert_eq!(
        loaded[1].file.source_hash,
        text_hash(&[SEEDED_TEXTS[1].to_string()])
    );
    assert_eq!(loaded[1].file.entities.len(), 1);
    assert_eq!(knowledge, fixture.knowledge.get(novel_id, "src").unwrap());
}

#[test]
fn stale_accept_does_not_rewrite_an_up_to_date_chapter() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    let before = snapshot(&fixture, novel_id, &ids);

    let knowledge = fixture
        .knowledge
        .stale_accept(novel_id, "src", &[1, 3])
        .unwrap();

    assert_eq!(snapshot(&fixture, novel_id, &ids), before);
    assert!(knowledge.analyzed[&2].stale);
}

#[test]
fn stale_accept_rejects_unknown_and_unanalyzed_seqs_without_writing() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    fixture.novel.chapter_add(novel_id, "Fourth").unwrap();
    let before = snapshot(&fixture, novel_id, &ids);

    let unknown = fixture
        .knowledge
        .stale_accept(novel_id, "src", &[2, 9])
        .unwrap_err();
    let unanalyzed = fixture
        .knowledge
        .stale_accept(novel_id, "src", &[4])
        .unwrap_err();

    assert_eq!(unknown.code, KnowledgeErrorCode::NotFound);
    assert_eq!(unanalyzed.code, KnowledgeErrorCode::NotFound);
    assert_eq!(snapshot(&fixture, novel_id, &ids), before);
}

#[test]
fn stale_accept_requires_chapter_text_for_the_lang() {
    let fixture = fixture();
    let (novel_id, ids) = seeded(&fixture);
    KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf())
        .write(
            novel_id,
            KnowledgeLang::Vi,
            &ids[0],
            &analysis("x", Vec::new(), Vec::new()),
        )
        .unwrap();

    let error = fixture
        .knowledge
        .stale_accept(novel_id, "VI", &[1])
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
    assert!(
        error
            .detail
            .contains("chapter has no text for this language")
    );
}

#[test]
fn stale_accept_rejects_empty_lists_and_unknown_langs() {
    let fixture = fixture();
    let (novel_id, _) = seeded(&fixture);

    let empty = fixture
        .knowledge
        .stale_accept(novel_id, "src", &[])
        .unwrap_err();
    let lang = fixture
        .knowledge
        .stale_accept(novel_id, "FR", &[1])
        .unwrap_err();

    assert_eq!(empty.code, KnowledgeErrorCode::InvalidInput);
    assert_eq!(lang.code, KnowledgeErrorCode::InvalidInput);
}

fn three_chapters(fixture: &Fixture) -> (i64, Vec<String>) {
    let novel = fixture.novel.create(novel_input()).unwrap();
    let mut ids = Vec::new();
    for title in ["One", "Two", "Three"] {
        let chapter = fixture.novel.chapter_add(novel.id, title).unwrap();
        fixture
            .novel
            .paragraph_add(novel.id, &chapter.id, TEXT)
            .unwrap();
        ids.push(chapter.id);
    }
    (novel.id, ids)
}

fn persona_of(id: &str, subject: &str, object: &str) -> AnalysisFact {
    AnalysisFact {
        id: id.to_string(),
        pred: "persona_of".to_string(),
        subject: subject.to_string(),
        object: Some(object.to_string()),
        ev: Vec::new(),
    }
}

fn save(fixture: &Fixture, novel_id: i64, chapter_id: &str, analysis: ChapterAnalysis) {
    fixture
        .knowledge
        .save_analysis(novel_id, KnowledgeLang::Src, chapter_id, analysis)
        .unwrap();
}

fn saved_story(fixture: &Fixture) -> (i64, Vec<String>) {
    let (novel_id, ids) = three_chapters(fixture);
    let quote = || vec![evidence(1, "Lin Mo")];
    let first = analysis(
        "ignored",
        vec![
            entity("E1", "persona", "Wren", quote()),
            entity("E2", "character", "Wren Aldous", Vec::new()),
            entity("E3", "location", "Hall", quote()),
        ],
        vec![persona_of("F1", "E1", "E2")],
    );
    let second = analysis(
        "ignored",
        vec![
            entity("E1", "persona", "wren", quote()),
            entity("E2", "persona", "Ash", quote()),
        ],
        Vec::new(),
    );
    let third = analysis(
        "ignored",
        vec![entity("E1", "persona", "Late", quote())],
        Vec::new(),
    );
    save(fixture, novel_id, &ids[0], first);
    save(fixture, novel_id, &ids[1], second);
    save(fixture, novel_id, &ids[2], third);
    (novel_id, ids)
}

fn names(known: &[KnownEntity]) -> Vec<&str> {
    known.iter().map(|entity| entity.name.as_str()).collect()
}

#[test]
fn save_analysis_sets_the_ontology_hash_and_timestamp() {
    let fixture = fixture();
    let (novel_id, ids) = two_chapters(&fixture);
    let stale = ChapterAnalysis {
        ontology: 99,
        source_hash: "bogus".to_string(),
        analyzed_at: "never".to_string(),
        ..analysis(
            "x",
            vec![entity("E1", "persona", "Wren", Vec::new())],
            Vec::new(),
        )
    };

    fixture
        .knowledge
        .save_analysis(novel_id, KnowledgeLang::Src, &ids[0], stale)
        .unwrap();

    let saved = KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf())
        .read(novel_id, KnowledgeLang::Src, &ids[0])
        .unwrap()
        .unwrap();
    assert_eq!(saved.ontology, 1);
    assert_eq!(saved.source_hash, text_hash(&[TEXT.to_string()]));
    assert!(saved.analyzed_at.ends_with('Z'));
    assert_ne!(saved.analyzed_at, "never");
    assert_eq!(saved.entities.len(), 1);
    assert!(!fixture.knowledge.get(novel_id, "src").unwrap().analyzed[&1].stale);
}

#[test]
fn save_analysis_overwrites_the_previous_file() {
    let fixture = fixture();
    let (novel_id, ids) = two_chapters(&fixture);
    save(
        &fixture,
        novel_id,
        &ids[0],
        analysis(
            "x",
            vec![entity("E1", "persona", "Wren", Vec::new())],
            Vec::new(),
        ),
    );

    save(
        &fixture,
        novel_id,
        &ids[0],
        analysis(
            "x",
            vec![entity("E1", "persona", "Ash", Vec::new())],
            Vec::new(),
        ),
    );

    let knowledge = fixture.knowledge.get(novel_id, "src").unwrap();
    let names: Vec<&str> = entities_of(&knowledge)
        .iter()
        .map(|entity| entity.name.as_str())
        .collect();
    assert_eq!(names, vec!["Ash"]);
}

#[test]
fn save_analysis_rejects_unknown_novels_and_chapters() {
    let fixture = fixture();
    let (novel_id, _) = two_chapters(&fixture);
    let empty = || analysis("x", Vec::new(), Vec::new());

    let chapter = fixture
        .knowledge
        .save_analysis(
            novel_id,
            KnowledgeLang::Src,
            "0123456789abcdef0123456789abcdef",
            empty(),
        )
        .unwrap_err();
    let novel = fixture
        .knowledge
        .save_analysis(novel_id + 100, KnowledgeLang::Src, "x", empty())
        .unwrap_err();

    assert_eq!(chapter.code, KnowledgeErrorCode::NotFound);
    assert_eq!(novel.code, KnowledgeErrorCode::NotFound);
}

#[test]
fn save_analysis_requires_chapter_text_for_the_lang() {
    let fixture = fixture();
    let (novel_id, ids) = two_chapters(&fixture);

    let error = fixture
        .knowledge
        .save_analysis(
            novel_id,
            KnowledgeLang::Vi,
            &ids[0],
            analysis("x", Vec::new(), Vec::new()),
        )
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
    assert_eq!(error.detail, "chapter has no text for this language");
    assert!(
        KnowledgeFiles::new(fixture.knowledge.dir().to_path_buf())
            .read(novel_id, KnowledgeLang::Vi, &ids[0])
            .unwrap()
            .is_none()
    );
}

#[test]
fn known_entities_only_come_from_earlier_chapters() {
    let fixture = fixture();
    let (novel_id, _) = saved_story(&fixture);

    let before_third = fixture
        .knowledge
        .known_entities(novel_id, KnowledgeLang::Src, 3, 50)
        .unwrap();
    let before_second = fixture
        .knowledge
        .known_entities(novel_id, KnowledgeLang::Src, 2, 50)
        .unwrap();
    let before_first = fixture
        .knowledge
        .known_entities(novel_id, KnowledgeLang::Src, 1, 50)
        .unwrap();

    assert!(!names(&before_third).contains(&"Late"));
    assert!(names(&before_third).contains(&"Ash"));
    assert!(!names(&before_second).contains(&"Ash"));
    assert_eq!(before_second.len(), 3);
    assert!(before_first.is_empty());
}

#[test]
fn known_entities_are_ordered_by_evidence_and_fill_the_character() {
    let fixture = fixture();
    let (novel_id, _) = saved_story(&fixture);

    let known = fixture
        .knowledge
        .known_entities(novel_id, KnowledgeLang::Src, 3, 50)
        .unwrap();

    assert_eq!(known.len(), 4);
    assert_eq!(known[0].name, "Wren");
    assert_eq!(known[0].kind, "persona");
    assert_eq!(known[0].character.as_deref(), Some("Wren Aldous"));
    assert_eq!(known[3].name, "Wren Aldous");
    assert_eq!(known[3].kind, "character");
    assert!(known[1..].iter().all(|entity| entity.character.is_none()));
}

#[test]
fn known_entities_are_capped_by_the_limit() {
    let fixture = fixture();
    let (novel_id, _) = saved_story(&fixture);

    let two = fixture
        .knowledge
        .known_entities(novel_id, KnowledgeLang::Src, 3, 2)
        .unwrap();
    let none = fixture
        .knowledge
        .known_entities(novel_id, KnowledgeLang::Src, 3, 0)
        .unwrap();

    assert_eq!(two.len(), 2);
    assert_eq!(two[0].name, "Wren");
    assert!(none.is_empty());
}

#[test]
fn known_entities_of_an_unknown_novel_are_not_found() {
    let fixture = fixture();

    let error = fixture
        .knowledge
        .known_entities(99, KnowledgeLang::Src, 3, 10)
        .unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::NotFound);
}
