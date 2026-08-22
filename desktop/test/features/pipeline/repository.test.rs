use super::*;
use crate::features::pipeline::jobs::translation::KIND_TRANSLATION;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use rusqlite::Connection;
use rusqlite::params;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const NOW: &str = "2026-11-17T00:00:00Z";

struct Fixture {
    dir: TempDir,
    database: Database,
    novel_id: i64,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("workspace.dreamydb");
    let mut database = Database::create(&path).unwrap();
    let cancel = AtomicBool::new(false);
    Migrator::migrate(
        database.connection_mut(),
        &workspace_scripts().unwrap(),
        &cancel,
    )
    .unwrap();
    let novel_id = insert_novel(database.connection(), "Novel");
    Fixture {
        dir,
        database,
        novel_id,
    }
}

fn insert_novel(conn: &Connection, title: &str) -> i64 {
    conn.execute(
        "INSERT INTO ws_novels (title, name, author, lang, description, origin, created_at, \
         updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![title, "", "Author", "ZH", "", "created", NOW],
    )
    .unwrap();
    conn.last_insert_rowid()
}

fn requests() -> Vec<TaskRequest> {
    vec![
        TaskRequest {
            chapter_id: "chapter-one".to_string(),
            passage: None,
        },
        TaskRequest {
            chapter_id: "chapter-two".to_string(),
            passage: Some(3),
        },
    ]
}

fn insert_pipeline(repo: &PipelineRepository<'_>, novel_id: i64, now: &str) -> i64 {
    repo.insert_pipeline_with_tasks(novel_id, KIND_TRANSLATION, "VI", &requests(), now)
        .unwrap()
}

#[test]
fn inserts_snapshots_and_mutates_tasks() {
    let fixture = fixture();
    let repo = PipelineRepository::new(fixture.database.connection());
    let pipeline_id = insert_pipeline(&repo, fixture.novel_id, NOW);
    let snapshot = repo.snapshot(pipeline_id).unwrap().unwrap();

    assert_eq!(snapshot.status, PipelineStatus::Running);
    assert_eq!(snapshot.total, 2);
    assert_eq!(snapshot.created_at, NOW);
    assert_eq!(snapshot.started_at.as_deref(), Some(NOW));
    assert_eq!(snapshot.tasks.len(), 2);
    assert_eq!(snapshot.tasks[0].chapter_id, "chapter-one");
    assert_eq!(snapshot.tasks[0].passage, None);
    assert_eq!(snapshot.tasks[1].chapter_id, "chapter-two");
    assert_eq!(snapshot.tasks[1].passage, Some(3));
    assert!(snapshot.tasks[0].id < snapshot.tasks[1].id);

    let first = snapshot.tasks[0].id;
    let second = snapshot.tasks[1].id;
    repo.set_task_running(first, "running").unwrap();
    repo.set_task_progress(first, 55).unwrap();
    repo.finish_task(first, TaskStatus::Completed, "", "finished")
        .unwrap();
    repo.finish_task(second, TaskStatus::Failed, "failure", "failed")
        .unwrap();
    repo.finish_pipeline(
        pipeline_id,
        PipelineStatus::Failed,
        1,
        1,
        "pipeline-finished",
    )
    .unwrap();

    let completed = repo.task(first).unwrap().unwrap();
    assert_eq!(completed.status, TaskStatus::Completed);
    assert_eq!(completed.progress, 100);
    assert_eq!(completed.started_at.as_deref(), Some("running"));
    assert_eq!(completed.finished_at.as_deref(), Some("finished"));
    let failed = repo.task(second).unwrap().unwrap();
    assert_eq!(failed.status, TaskStatus::Failed);
    assert_eq!(failed.progress, 0);
    assert_eq!(failed.error, "failure");
    assert_eq!(repo.task(999).unwrap(), None);
    let snapshot = repo.snapshot(pipeline_id).unwrap().unwrap();
    assert_eq!(snapshot.status, PipelineStatus::Failed);
    assert_eq!(snapshot.done, 1);
    assert_eq!(snapshot.failed, 1);
    assert_eq!(snapshot.finished_at.as_deref(), Some("pipeline-finished"));
}

#[test]
fn lists_history_by_newest_id_with_limit_and_novel_scope() {
    let fixture = fixture();
    let repo = PipelineRepository::new(fixture.database.connection());
    let first = insert_pipeline(&repo, fixture.novel_id, "first");
    let second = insert_pipeline(&repo, fixture.novel_id, "second");
    let other_novel = insert_novel(fixture.database.connection(), "Other");
    let other = insert_pipeline(&repo, other_novel, "other");

    let history = repo.list_history(fixture.novel_id, 1).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, second);
    assert_eq!(history[0].tasks.len(), 2);
    let history = repo.list_history(fixture.novel_id, 10).unwrap();
    assert_eq!(
        history.iter().map(|item| item.id).collect::<Vec<_>>(),
        vec![second, first]
    );
    assert_ne!(history[0].id, other);
    assert_eq!(repo.snapshot(999).unwrap(), None);
}

#[test]
fn cancels_only_running_pipelines_and_unfinished_tasks() {
    let fixture = fixture();
    let repo = PipelineRepository::new(fixture.database.connection());
    let running = insert_pipeline(&repo, fixture.novel_id, NOW);
    let finished = insert_pipeline(&repo, fixture.novel_id, NOW);
    let finished_tasks = repo.snapshot(finished).unwrap().unwrap().tasks;
    repo.finish_task(finished_tasks[0].id, TaskStatus::Completed, "", "done")
        .unwrap();
    repo.finish_task(finished_tasks[1].id, TaskStatus::Failed, "bad", "failed")
        .unwrap();
    repo.finish_pipeline(finished, PipelineStatus::Failed, 1, 1, "finished")
        .unwrap();

    assert_eq!(repo.cancel_orphans("cancelled").unwrap(), 1);
    let running = repo.snapshot(running).unwrap().unwrap();
    assert_eq!(running.status, PipelineStatus::Cancelled);
    assert_eq!(running.finished_at.as_deref(), Some("cancelled"));
    assert!(
        running
            .tasks
            .iter()
            .all(|task| task.status == TaskStatus::Cancelled)
    );
    assert!(
        running
            .tasks
            .iter()
            .all(|task| task.finished_at.as_deref() == Some("cancelled"))
    );
    let finished = repo.snapshot(finished).unwrap().unwrap();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.tasks[0].status, TaskStatus::Completed);
    assert_eq!(finished.tasks[1].status, TaskStatus::Failed);
    assert_eq!(repo.cancel_orphans("again").unwrap(), 0);
}

#[test]
fn deleting_a_novel_cascades_its_history_and_tasks() {
    let fixture = fixture();
    let repo = PipelineRepository::new(fixture.database.connection());
    let pipeline_id = insert_pipeline(&repo, fixture.novel_id, NOW);
    fixture
        .database
        .connection()
        .execute("DELETE FROM ws_novels WHERE id = ?1", [fixture.novel_id])
        .unwrap();

    assert_eq!(repo.snapshot(pipeline_id).unwrap(), None);
    assert!(fixture.dir.path().exists());
}
