use super::*;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelWorkspace;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::translator::FakeTranslator;
use std::sync::Condvar;
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use std::time::Instant;
use tempfile::TempDir;

struct RecordingTarget {
    events: Mutex<Vec<PipelineEvent>>,
    finished: Condvar,
}

impl RecordingTarget {
    fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            finished: Condvar::new(),
        }
    }

    fn wait_for_finished(&self) -> PipelineSnapshot {
        let events = lock(&self.events);
        let (events, _) = self
            .finished
            .wait_timeout_while(events, Duration::from_secs(5), |events| {
                !events
                    .iter()
                    .any(|event| matches!(event, PipelineEvent::Finished { .. }))
            })
            .unwrap();
        events
            .iter()
            .find_map(|event| match event {
                PipelineEvent::Finished { pipeline } => Some(pipeline.clone()),
                _ => None,
            })
            .expect("pipeline should finish")
    }
}

impl PipelineTarget for RecordingTarget {
    fn deliver(&self, event: PipelineEvent) -> Result<(), String> {
        let is_finished = matches!(event, PipelineEvent::Finished { .. });
        lock(&self.events).push(event);
        if is_finished {
            self.finished.notify_all();
        }
        Ok(())
    }
}

struct Fixture {
    _dir: TempDir,
    novel: NovelWorkspace,
    translation: TranslationWorkspace,
    novel_id: i64,
    chapter_id: String,
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
    let path = dir.path().to_path_buf();
    let novel = NovelWorkspace::new(path.clone());
    let novel_id = novel
        .create(NovelInput {
            title: "Book".to_string(),
            name: String::new(),
            author: String::new(),
            lang: "ZH".to_string(),
            description: String::new(),
            tags: Vec::new(),
        })
        .unwrap()
        .id;
    let chapter = novel.chapter_add(novel_id, "Chapter").unwrap();
    novel
        .paragraph_add(novel_id, &chapter.id, "source")
        .unwrap();
    Fixture {
        _dir: dir,
        novel,
        translation: TranslationWorkspace::new(path),
        novel_id,
        chapter_id: chapter.id,
    }
}

#[test]
fn completes_a_translation_and_emits_lifecycle_events() {
    let fixture = fixture();
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(
        Duration::from_millis(10),
    )));
    let target = Arc::new(RecordingTarget::new());
    let snapshot = executor
        .start(
            fixture.translation.clone(),
            PipelineStart {
                novel_id: fixture.novel_id,
                target: "VI".to_string(),
                tasks: vec![TaskRequest {
                    chapter_id: fixture.chapter_id.clone(),
                    passage: None,
                }],
            },
            target.clone(),
        )
        .unwrap();
    assert_eq!(snapshot.status, PipelineStatus::Running);
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 1);
    let until = Instant::now() + Duration::from_secs(1);
    while executor.is_running() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(!executor.is_running());
    let translated = fixture.translation.get(fixture.novel_id, "VI").unwrap();
    assert_eq!(
        translated.chapters[&fixture.chapter_id].paragraphs[0].text,
        "[translated] source"
    );
    assert_eq!(
        fixture.novel.chapters(fixture.novel_id).unwrap()[0].translation_status,
        "none"
    );
    let events = lock(&target.events);
    assert!(matches!(
        events.first(),
        Some(PipelineEvent::Started { .. })
    ));
    assert!(matches!(
        events.last(),
        Some(PipelineEvent::Finished { .. })
    ));
}

#[test]
fn rejects_invalid_requests_without_claiming_the_executor() {
    let fixture = fixture();
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(
        Duration::from_millis(10),
    )));
    let error = executor
        .start(
            fixture.translation,
            PipelineStart {
                novel_id: fixture.novel_id,
                target: "VI".to_string(),
                tasks: Vec::new(),
            },
            Arc::new(RecordingTarget::new()),
        )
        .unwrap_err();
    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert!(!executor.is_running());
    assert!(!executor.cancel());
}
