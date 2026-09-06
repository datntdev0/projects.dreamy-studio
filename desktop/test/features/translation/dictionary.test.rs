use super::*;
use tempfile::TempDir;

const NOW: &str = "2026-11-17T00:00:00Z";
const NOVEL: i64 = 1;

fn input(src: &str, dst: &str) -> DictInput {
    DictInput {
        src: src.to_string(),
        dst: dst.to_string(),
        kind: "term".to_string(),
        note: "note".to_string(),
    }
}

fn dictionary_path(dir: &TempDir, novel_id: i64, lang: &str) -> PathBuf {
    dir.path()
        .join("novels")
        .join(novel_id.to_string())
        .join(format!("translation_{lang}"))
        .join("dictionary.jsonl")
}

#[test]
fn creates_reads_updates_and_deletes_entries() {
    let dir = TempDir::new().unwrap();
    let store = DictionaryFiles::new(dir.path().to_path_buf());
    let created = store
        .insert(
            NOVEL,
            TranslationTarget::Vi,
            &input("source", "target"),
            NOW,
        )
        .unwrap();

    assert_eq!(
        store.list(NOVEL, TranslationTarget::Vi).unwrap(),
        vec![DictEntry {
            id: created.id,
            src: "source".to_string(),
            dst: "target".to_string(),
            kind: "term".to_string(),
            note: "note".to_string(),
        }]
    );
    let (target, mut entry) = store.find(NOVEL, created.id).unwrap().unwrap();
    assert_eq!(target, TranslationTarget::Vi);
    entry.src = "changed source".to_string();
    entry.dst = "changed target".to_string();
    entry.kind = "name".to_string();
    entry.note = "changed note".to_string();

    assert!(
        store
            .update(NOVEL, target, &entry, "2026-11-18T00:00:00Z")
            .unwrap()
    );
    assert_eq!(
        store.find(NOVEL, created.id).unwrap(),
        Some((TranslationTarget::Vi, entry.clone()))
    );
    assert!(!store.update(999, target, &entry, NOW).unwrap());
    assert!(store.delete(NOVEL, created.id).unwrap());
    assert!(!store.delete(NOVEL, created.id).unwrap());
    assert_eq!(store.find(NOVEL, created.id).unwrap(), None);
}

#[test]
fn stores_one_json_line_per_entry_in_the_translation_folder() {
    let dir = TempDir::new().unwrap();
    let store = DictionaryFiles::new(dir.path().to_path_buf());
    store
        .insert(NOVEL, TranslationTarget::Vi, &input("a", "one"), NOW)
        .unwrap();
    store
        .insert(NOVEL, TranslationTarget::Vi, &input("b", "two"), NOW)
        .unwrap();

    let text = fs::read_to_string(dictionary_path(&dir, NOVEL, "vi")).unwrap();
    let lines: Vec<serde_json::Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();

    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["id"], 1);
    assert_eq!(lines[0]["src"], "a");
    assert_eq!(lines[0]["type"], "term");
    assert_eq!(lines[0]["createdAt"], NOW);
    assert_eq!(lines[1]["id"], 2);
}

#[test]
fn lists_entries_in_id_order_and_ignores_blank_lines() {
    let dir = TempDir::new().unwrap();
    let path = dictionary_path(&dir, NOVEL, "en");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        &path,
        "{\"id\":5,\"src\":\"z\",\"dst\":\"one\",\"type\":\"term\",\"note\":\"\",\"createdAt\":\"t\",\"updatedAt\":\"t\"}\n\n\
         {\"id\":2,\"src\":\"a\",\"dst\":\"two\",\"type\":\"term\",\"note\":\"\",\"createdAt\":\"t\",\"updatedAt\":\"t\"}\n",
    )
    .unwrap();
    let store = DictionaryFiles::new(dir.path().to_path_buf());

    let ids: Vec<i64> = store
        .list(NOVEL, TranslationTarget::En)
        .unwrap()
        .into_iter()
        .map(|entry| entry.id)
        .collect();

    assert_eq!(ids, vec![2, 5]);
    assert!(store.list(NOVEL, TranslationTarget::Vi).unwrap().is_empty());
}

#[test]
fn detects_duplicates_per_target_for_inserts_and_updates() {
    let dir = TempDir::new().unwrap();
    let store = DictionaryFiles::new(dir.path().to_path_buf());
    let first = store
        .insert(NOVEL, TranslationTarget::Vi, &input("same", "one"), NOW)
        .unwrap();
    let duplicate = store
        .insert(NOVEL, TranslationTarget::Vi, &input("same", "two"), NOW)
        .unwrap_err();
    let other_target = store
        .insert(NOVEL, TranslationTarget::En, &input("same", "three"), NOW)
        .unwrap();
    let second = store
        .insert(NOVEL, TranslationTarget::Vi, &input("other", "four"), NOW)
        .unwrap();
    let mut entry = second.clone();
    entry.src = "same".to_string();
    let update = store
        .update(NOVEL, TranslationTarget::Vi, &entry, NOW)
        .unwrap_err();

    assert_eq!(duplicate.code, TranslationErrorCode::DictionaryDuplicate);
    assert_eq!(update.code, TranslationErrorCode::DictionaryDuplicate);
    assert_ne!(first.id, other_target.id);
    assert_eq!(
        store.find(NOVEL, second.id).unwrap().unwrap().1.src,
        "other"
    );
}

#[test]
fn rejects_a_malformed_line() {
    let dir = TempDir::new().unwrap();
    let path = dictionary_path(&dir, NOVEL, "vi");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, "not json\n").unwrap();
    let store = DictionaryFiles::new(dir.path().to_path_buf());

    let error = store.list(NOVEL, TranslationTarget::Vi).unwrap_err();

    assert_eq!(error.code, TranslationErrorCode::Io);
}
