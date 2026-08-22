use chrono::DateTime;
use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::PoisonError;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;

pub const RUN_LOG_FILE: &str = "pipeline.log";

#[derive(Clone)]
pub struct RunLog {
    inner: Option<Arc<RunDir>>,
}

struct RunDir {
    dir: PathBuf,
    write: Mutex<()>,
}

pub struct TaskLog {
    run: RunLog,
    scope: String,
    prefix: String,
    exchanges: AtomicUsize,
}

impl RunLog {
    pub fn none() -> Self {
        Self { inner: None }
    }

    pub fn create(root: &Path, started: DateTime<Local>, kind: &str, pipeline_id: i64) -> Self {
        let name = format!(
            "{}-{}-{pipeline_id}",
            started.format("%Y%m%d-%H%M%S"),
            file_safe(kind)
        );
        let dir = root.join(name);
        match std::fs::create_dir_all(&dir) {
            Ok(()) => Self {
                inner: Some(Arc::new(RunDir {
                    dir,
                    write: Mutex::new(()),
                })),
            },
            Err(error) => {
                eprintln!("cannot create pipeline log {}: {error}", dir.display());
                Self::none()
            }
        }
    }

    #[cfg(test)]
    pub fn dir(&self) -> Option<&Path> {
        self.inner.as_ref().map(|run| run.dir.as_path())
    }

    pub fn line(&self, scope: &str, message: &str) {
        let Some(run) = &self.inner else {
            return;
        };
        let _guard = run.write.lock().unwrap_or_else(PoisonError::into_inner);
        let line = format!("{} [{scope}] {message}\n", Local::now().to_rfc3339());
        let written = OpenOptions::new()
            .create(true)
            .append(true)
            .open(run.dir.join(RUN_LOG_FILE))
            .and_then(|mut file| file.write_all(line.as_bytes()));
        if let Err(error) = written {
            eprintln!("cannot write pipeline log: {error}");
        }
    }

    pub fn attach(&self, name: &str, content: &str) -> Option<String> {
        let run = self.inner.as_ref()?;
        let _guard = run.write.lock().unwrap_or_else(PoisonError::into_inner);
        match std::fs::write(run.dir.join(name), content) {
            Ok(()) => Some(name.to_string()),
            Err(error) => {
                eprintln!("cannot write pipeline log file {name}: {error}");
                None
            }
        }
    }

    pub fn task(&self, task_id: i64, label: &str) -> TaskLog {
        TaskLog {
            run: self.clone(),
            scope: format!("task {task_id} {label}"),
            prefix: format!("t{task_id}-{}", file_safe(label)),
            exchanges: AtomicUsize::new(0),
        }
    }
}

impl TaskLog {
    #[cfg(test)]
    pub fn none() -> Self {
        RunLog::none().task(0, "")
    }

    pub fn line(&self, message: &str) {
        self.run.line(&self.scope, message);
    }

    pub fn next_exchange(&self) -> usize {
        self.exchanges.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn attach(&self, name: &str, content: &str) -> Option<String> {
        self.run.attach(&format!("{}-{name}", self.prefix), content)
    }
}

fn file_safe(text: &str) -> String {
    text.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/log.test.rs"]
mod tests;
