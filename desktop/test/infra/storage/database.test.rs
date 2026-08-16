use super::*;
use tempfile::TempDir;

const PARENT_CHILD: &str = "CREATE TABLE parent (id INTEGER PRIMARY KEY);         CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL         REFERENCES parent(id) ON DELETE CASCADE);";

fn foreign_keys_flag(db: &Database) -> i64 {
    db.connection()
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap()
}

fn count(db: &Database, table: &str) -> i64 {
    db.connection()
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
}

#[test]
fn create_enables_foreign_keys_and_cascades_deletes() {
    let dir = TempDir::new().unwrap();
    let db = Database::create(&dir.path().join("a.db")).unwrap();
    db.connection().execute_batch(PARENT_CHILD).unwrap();
    db.connection()
        .execute_batch(
            "INSERT INTO parent (id) VALUES (1); INSERT INTO child (id, parent_id) VALUES (1, 1);",
        )
        .unwrap();

    db.connection()
        .execute("DELETE FROM parent WHERE id = 1", [])
        .unwrap();

    assert_eq!(foreign_keys_flag(&db), 1);
    assert_eq!(count(&db, "child"), 0);
}

#[test]
fn create_rejects_rows_with_a_missing_parent() {
    let dir = TempDir::new().unwrap();
    let db = Database::create(&dir.path().join("a.db")).unwrap();
    db.connection().execute_batch(PARENT_CHILD).unwrap();

    let result = db
        .connection()
        .execute("INSERT INTO child (id, parent_id) VALUES (1, 99)", []);

    assert!(result.is_err());
}

#[test]
fn open_existing_and_read_only_enable_foreign_keys() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("a.db");
    drop(Database::create(&path).unwrap());

    let existing = Database::open_existing(&path).unwrap();
    let read_only = Database::open_read_only(&path).unwrap();

    assert_eq!(foreign_keys_flag(&existing), 1);
    assert_eq!(foreign_keys_flag(&read_only), 1);
}
