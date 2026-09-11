use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::pipeline::models::TaskStatus;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;

const HISTORY_COLUMNS: &str = "id, novel_id, project_id, kind, target, status, total, done, \
     failed, created_at, started_at, finished_at";
const TASK_COLUMNS: &str =
    "id, chapter_id, segment_id, passage, status, progress, error, started_at, finished_at";

pub struct PipelineRepository<'a> {
    conn: &'a Connection,
}

impl<'a> PipelineRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn insert_pipeline(
        &self,
        owner: JobOwner,
        kind: &str,
        target: &str,
        status: PipelineStatus,
        tasks: &[TaskRequest],
        now: &str,
    ) -> rusqlite::Result<i64> {
        let started = (status == PipelineStatus::Running).then_some(now);
        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO ws_pipeline_history \
             (novel_id, project_id, kind, target, status, total, created_at, started_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                owner.novel_id(),
                owner.project_id(),
                kind,
                target,
                status.as_str(),
                tasks.len() as i64,
                now,
                started
            ],
        )?;
        let pipeline_id = transaction.last_insert_rowid();
        for task in tasks {
            transaction.execute(
                "INSERT INTO ws_pipeline_tasks \
                 (pipeline_id, chapter_id, segment_id, passage, status) \
                 VALUES (?1, ?2, ?3, ?4, 'queued')",
                params![
                    pipeline_id,
                    task.chapter_id,
                    task.segment_id,
                    task.passage.map(|passage| passage as i64)
                ],
            )?;
        }
        transaction.commit()?;
        Ok(pipeline_id)
    }

    pub fn snapshot(&self, id: i64) -> rusqlite::Result<Option<PipelineSnapshot>> {
        self.conn
            .query_row(
                &format!("SELECT {HISTORY_COLUMNS} FROM ws_pipeline_history WHERE id = ?1"),
                [id],
                row_to_snapshot,
            )
            .optional()
            .and_then(|snapshot| self.with_tasks(snapshot))
    }

    pub fn task(&self, task_id: i64) -> rusqlite::Result<Option<PipelineTask>> {
        self.conn
            .query_row(
                &format!("SELECT {TASK_COLUMNS} FROM ws_pipeline_tasks WHERE id = ?1"),
                [task_id],
                row_to_task,
            )
            .optional()
    }

    pub fn set_task_running(&self, task_id: i64, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_pipeline_tasks SET status = 'running', started_at = ?2, progress = 0 \
             WHERE id = ?1",
            params![task_id, now],
        )?;
        Ok(())
    }

    pub fn set_task_progress(&self, task_id: i64, progress: u8) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_pipeline_tasks SET progress = ?2 WHERE id = ?1",
            params![task_id, progress],
        )?;
        Ok(())
    }

    pub fn finish_task(
        &self,
        task_id: i64,
        status: TaskStatus,
        error: &str,
        now: &str,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_pipeline_tasks SET status = ?2, error = ?3, finished_at = ?4, \
             progress = CASE WHEN ?2 = 'completed' THEN 100 ELSE progress END WHERE id = ?1",
            params![task_id, status.as_str(), error, now],
        )?;
        Ok(())
    }

    pub fn mark_pipeline_running(&self, id: i64, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_pipeline_history SET status = 'running', started_at = ?2 \
             WHERE id = ?1 AND status = 'queued'",
            params![id, now],
        )?;
        Ok(())
    }

    pub fn finish_pipeline(
        &self,
        id: i64,
        status: PipelineStatus,
        done: i64,
        failed: i64,
        now: &str,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_pipeline_history SET status = ?2, done = ?3, failed = ?4, finished_at = ?5 \
             WHERE id = ?1",
            params![id, status.as_str(), done, failed, now],
        )?;
        Ok(())
    }

    pub fn list_history(
        &self,
        owner: Option<JobOwner>,
        limit: i64,
    ) -> rusqlite::Result<Vec<PipelineSnapshot>> {
        let mut statement = self.conn.prepare(&format!(
            "SELECT {HISTORY_COLUMNS} FROM ws_pipeline_history \
             WHERE (?1 IS NULL OR novel_id = ?1) AND (?2 IS NULL OR project_id = ?2) \
             ORDER BY id DESC LIMIT ?3"
        ))?;
        let novel_id = owner.and_then(JobOwner::novel_id);
        let project_id = owner.and_then(JobOwner::project_id);
        let snapshots = statement
            .query_map(params![novel_id, project_id, limit], row_to_snapshot)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        snapshots
            .into_iter()
            .map(|snapshot| self.with_tasks(Some(snapshot)))
            .collect::<rusqlite::Result<Vec<_>>>()
            .map(|snapshots| snapshots.into_iter().flatten().collect())
    }

    pub fn cancel_orphans(&self, now: &str) -> rusqlite::Result<usize> {
        let transaction = self.conn.unchecked_transaction()?;
        let changed = transaction.execute(
            "UPDATE ws_pipeline_history SET status = 'cancelled', finished_at = ?1 \
             WHERE status IN ('running', 'queued')",
            [now],
        )?;
        transaction.execute(
            "UPDATE ws_pipeline_tasks SET status = 'cancelled', finished_at = ?1 \
             WHERE status IN ('queued', 'running')",
            [now],
        )?;
        transaction.commit()?;
        Ok(changed)
    }

    fn with_tasks(
        &self,
        snapshot: Option<PipelineSnapshot>,
    ) -> rusqlite::Result<Option<PipelineSnapshot>> {
        match snapshot {
            Some(mut snapshot) => {
                snapshot.tasks = self.tasks(snapshot.id)?;
                Ok(Some(snapshot))
            }
            None => Ok(None),
        }
    }

    fn tasks(&self, pipeline_id: i64) -> rusqlite::Result<Vec<PipelineTask>> {
        let mut statement = self.conn.prepare(&format!(
            "SELECT {TASK_COLUMNS} FROM ws_pipeline_tasks WHERE pipeline_id = ?1 ORDER BY id"
        ))?;
        statement.query_map([pipeline_id], row_to_task)?.collect()
    }
}

fn row_to_snapshot(row: &Row<'_>) -> rusqlite::Result<PipelineSnapshot> {
    let status: String = row.get(5)?;
    Ok(PipelineSnapshot {
        id: row.get(0)?,
        novel_id: row.get(1)?,
        project_id: row.get(2)?,
        kind: row.get(3)?,
        target: row.get(4)?,
        status: PipelineStatus::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?,
        total: row.get(6)?,
        done: row.get(7)?,
        failed: row.get(8)?,
        created_at: row.get(9)?,
        started_at: row.get(10)?,
        finished_at: row.get(11)?,
        tasks: Vec::new(),
    })
}

fn row_to_task(row: &Row<'_>) -> rusqlite::Result<PipelineTask> {
    let status: String = row.get(4)?;
    Ok(PipelineTask {
        id: row.get(0)?,
        chapter_id: row.get(1)?,
        segment_id: row.get(2)?,
        passage: row
            .get::<_, Option<i64>>(3)?
            .map(|passage| passage as usize),
        status: TaskStatus::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?,
        progress: row.get(5)?,
        error: row.get(6)?,
        started_at: row.get(7)?,
        finished_at: row.get(8)?,
    })
}
