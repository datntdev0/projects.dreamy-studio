use std::fs::OpenOptions;
use std::fs::create_dir_all;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::DateTime;
use chrono::Local;

#[derive(Clone)]
pub struct Logger {
    logs: PathBuf,
    clock: Arc<dyn Fn() -> DateTime<Local> + Send + Sync>,
}

impl Logger {
    pub fn new(logs: PathBuf) -> Self {
        Self::with_clock(logs, Local::now)
    }

    pub fn with_clock<F>(logs: PathBuf, clock: F) -> Self
    where
        F: Fn() -> DateTime<Local> + Send + Sync + 'static,
    {
        Self {
            logs,
            clock: Arc::new(clock),
        }
    }

    pub fn prepare(&self) -> std::io::Result<()> {
        create_dir_all(&self.logs)?;
        let now = (self.clock)();
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.file_for(&now))?;
        Ok(())
    }

    pub fn log(&self, level: &str, target: &str, message: &str) {
        let now = (self.clock)();
        let line = format!("{} {} {} {}\n", now.to_rfc3339(), level, target, message);
        let _ = self.append(&now, &line);
    }

    pub fn info(&self, target: &str, message: &str) {
        self.log("INFO", target, message);
    }

    pub fn error(&self, target: &str, message: &str) {
        self.log("ERROR", target, message);
    }

    fn file_for(&self, now: &DateTime<Local>) -> PathBuf {
        self.logs.join(format!("{}.log", now.format("%Y-%m-%d")))
    }

    fn append(&self, now: &DateTime<Local>, line: &str) -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.file_for(now))?;
        file.write_all(line.as_bytes())
    }
}
