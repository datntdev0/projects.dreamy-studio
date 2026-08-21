use super::*;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use tempfile::tempdir;

const CHAPTER: &str = "0123456789abcdef0123456789abcdef";
const OTHER: &str = "fedcba9876543210fedcba9876543210";

fn analysis() -> ChapterAnalysis {
    ChapterAnalysis {
        ontology: 1,
        source_hash: "hash".to_string(),
        analyzed_at: "2026-11-18T10:00:00Z".to_string(),
        entities: vec![AnalysisEntity {
            id: "E1".to_string(),
            kind: "persona".to_string(),
            name: "Phu nhân".to_string(),
            titles: vec!["người giữ đèn".to_string()],
            aliases: Vec::new(),
            ev: vec![AnalysisEvidence {
                p: 1,
                q: "Phu nhân".to_string(),
            }],
        }],
        facts: vec![AnalysisFact {
            id: "F1".to_string(),
            pred: "occupation".to_string(),
            subject: "E1".to_string(),
            object: None,
            ev: Vec::new(),
        }],
    }
}

#[test]
fn write_then_read_round_trips() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());
    let expected = analysis();

    files
        .write(7, KnowledgeLang::Vi, CHAPTER, &expected)
        .unwrap();

    assert_eq!(
        files.read(7, KnowledgeLang::Vi, CHAPTER).unwrap(),
        Some(expected)
    );
}

#[test]
fn write_creates_the_language_directory() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());

    files
        .write(7, KnowledgeLang::Vi, CHAPTER, &analysis())
        .unwrap();

    let path = files
        .knowledge_dir(7, KnowledgeLang::Vi)
        .join(format!("chapter_{CHAPTER}.json"));
    assert!(path.is_file());
    assert_eq!(
        path.parent().unwrap().file_name().unwrap(),
        "knowledgebase_vi"
    );
}

#[test]
fn languages_are_isolated() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());

    files
        .write(7, KnowledgeLang::Src, CHAPTER, &analysis())
        .unwrap();

    assert_eq!(files.read(7, KnowledgeLang::Vi, CHAPTER).unwrap(), None);
    assert_eq!(files.read(7, KnowledgeLang::En, CHAPTER).unwrap(), None);
    assert!(
        files
            .read(7, KnowledgeLang::Src, CHAPTER)
            .unwrap()
            .is_some()
    );
}

#[test]
fn missing_file_is_none() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());

    assert_eq!(files.read(7, KnowledgeLang::En, CHAPTER).unwrap(), None);
}

#[test]
fn malformed_file_is_an_io_error_naming_the_path() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());
    let path = files
        .knowledge_dir(7, KnowledgeLang::Vi)
        .join(format!("chapter_{CHAPTER}.json"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, "{ not json").unwrap();

    let error = files.read(7, KnowledgeLang::Vi, CHAPTER).unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::Io);
    assert!(error.detail.contains(&path.display().to_string()));
}

#[test]
fn malformed_chapter_ids_are_rejected() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());

    for id in [
        "chapter_name",
        "../escape",
        "",
        "0123456789ABCDEF0123456789ABCDEF",
    ] {
        let read = files.read(7, KnowledgeLang::Vi, id).unwrap_err();
        let write = files
            .write(7, KnowledgeLang::Vi, id, &analysis())
            .unwrap_err();

        assert_eq!(read.code, KnowledgeErrorCode::InvalidInput);
        assert_eq!(read.detail, "chapter id is malformed");
        assert_eq!(write.code, KnowledgeErrorCode::InvalidInput);
    }
}

#[test]
fn list_returns_valid_chapter_files_sorted() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());
    files
        .write(7, KnowledgeLang::Vi, OTHER, &analysis())
        .unwrap();
    files
        .write(7, KnowledgeLang::Vi, CHAPTER, &analysis())
        .unwrap();
    let folder = files.knowledge_dir(7, KnowledgeLang::Vi);
    fs::write(folder.join("chapter_name.json"), "{}").unwrap();
    fs::write(folder.join("notes.txt"), "x").unwrap();
    fs::write(folder.join(format!("chapter_{CHAPTER}.json.tmp")), "x").unwrap();
    fs::write(
        folder.join(format!("chapter_{}.json", CHAPTER.to_uppercase())),
        "x",
    )
    .unwrap();

    assert_eq!(
        files.list(7, KnowledgeLang::Vi).unwrap(),
        vec![CHAPTER.to_string(), OTHER.to_string()]
    );
}

#[test]
fn list_of_a_missing_directory_is_empty() {
    let dir = tempdir().unwrap();
    let files = KnowledgeFiles::new(dir.path().to_path_buf());

    assert!(files.list(7, KnowledgeLang::Src).unwrap().is_empty());
}
