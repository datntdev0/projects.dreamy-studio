use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::pipeline::models::TaskStatus;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;

pub struct PipelineRepository<'a> {
    conn: &'a Connection,
}

impl<'a> PipelineRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    #[cfg(test)]
    pub fn insert_pipeline_with_tasks(
        &self,
        novel_id: i64,
        kind: &str,
        target: &str,
        tasks: &[TaskRequest],
        now: &str,
    ) -> rusqlite::Result<i64> {
        self.insert_pipeline(novel_id, kind, target, PipelineStatus::Running, tasks, now)
    }

    pub fn insert_pipeline(
        &self,
        novel_id: i64,
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
             (novel_id, kind, target, status, total, created_at, started_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                novel_id,
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
                "INSERT INTO ws_pipeline_tasks (pipeline_id, chapter_id, passage, status) \
                 VALUES (?1, ?2, ?3, 'queued')",
                params![
                    pipeline_id,
                    task.chapter_id,
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
                "SELECT id, novel_id, kind, target, status, total, done, failed, created_at, \
                 started_at, finished_at FROM ws_pipeline_history WHERE id = ?1",
                [id],
                row_to_snapshot,
            )
            .optional()
            .and_then(|snapshot| self.with_tasks(snapshot))
    }

    pub fn task(&self, task_id: i64) -> rusqlite::Result<Option<PipelineTask>> {
        self.conn
            .query_row(
                "SELECT id, chapter_id, passage, status, progress, error, started_at, finished_at \
                 FROM ws_pipeline_tasks WHERE id = ?1",
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
        novel_id: i64,
        limit: i64,
    ) -> rusqlite::Result<Vec<PipelineSnapshot>> {
        let mut statement = self.conn.prepare(
            "SELECT id, novel_id, kind, target, status, total, done, failed, created_at, started_at, \
             finished_at FROM ws_pipeline_history WHERE novel_id = ?1 ORDER BY id DESC LIMIT ?2",
        )?;
        let snapshots = statement
            .query_map(params![novel_id, limit], row_to_snapshot)?
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
        let mut statement = self.conn.prepare(
            "SELECT id, chapter_id, passage, status, progress, error, started_at, finished_at \
             FROM ws_pipeline_tasks WHERE pipeline_id = ?1 ORDER BY id",
        )?;
        statement.query_map([pipeline_id], row_to_task)?.collect()
    }
}

fn row_to_snapshot(row: &Row<'_>) -> rusqlite::Result<PipelineSnapshot> {
    let status: String = row.get(4)?;
    Ok(PipelineSnapshot {
        id: row.get(0)?,
        novel_id: row.get(1)?,
        kind: row.get(2)?,
        target: row.get(3)?,
        status: PipelineStatus::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?,
        total: row.get(5)?,
        done: row.get(6)?,
        failed: row.get(7)?,
        created_at: row.get(8)?,
        started_at: row.get(9)?,
        finished_at: row.get(10)?,
        tasks: Vec::new(),
    })
}

fn row_to_task(row: &Row<'_>) -> rusqlite::Result<PipelineTask> {
    let status: String = row.get(3)?;
    Ok(PipelineTask {
        id: row.get(0)?,
        chapter_id: row.get(1)?,
        passage: row
            .get::<_, Option<i64>>(2)?
            .map(|passage| passage as usize),
        status: TaskStatus::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?,
        progress: row.get(4)?,
        error: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
    })
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/repository.test.rs"]
mod tests;
