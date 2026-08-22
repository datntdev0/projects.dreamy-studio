use super::*;
use crate::features::pipeline::jobs::translation::KIND_TRANSLATION;
use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use serde_json::json;

fn snapshot() -> PipelineSnapshot {
    PipelineSnapshot {
        id: 1,
        novel_id: 2,
        kind: KIND_TRANSLATION.to_string(),
        target: "VI".to_string(),
        status: PipelineStatus::Running,
        total: 1,
        done: 0,
        failed: 0,
        created_at: "created".to_string(),
        started_at: Some("started".to_string()),
        finished_at: None,
        tasks: vec![task()],
    }
}

fn task() -> PipelineTask {
    PipelineTask {
        id: 3,
        chapter_id: "chapter".to_string(),
        passage: Some(2),
        status: TaskStatus::Queued,
        progress: 0,
        error: String::new(),
        started_at: None,
        finished_at: None,
    }
}

#[test]
fn serializes_pipeline_events_and_snapshots_for_the_wire() {
    assert_eq!(
        serde_json::to_value(PipelineEvent::Started {
            pipeline: snapshot()
        })
        .unwrap(),
        json!({
            "type": "started",
            "pipeline": {
                "id": 1, "novelId": 2, "kind": "translation", "target": "VI",
                "status": "running", "total": 1, "done": 0, "failed": 0,
                "createdAt": "created", "startedAt": "started", "finishedAt": null,
                "tasks": [{
                    "id": 3, "chapterId": "chapter", "passage": 2, "status": "queued",
                    "progress": 0, "error": "", "startedAt": null, "finishedAt": null
                }]
            }
        })
    );
    assert_eq!(
        serde_json::to_value(PipelineEvent::Task {
            pipeline_id: 1,
            task: task()
        })
        .unwrap(),
        json!({
            "type": "task",
            "pipelineId": 1,
            "task": {
                "id": 3, "chapterId": "chapter", "passage": 2, "status": "queued",
                "progress": 0, "error": "", "startedAt": null, "finishedAt": null
            }
        })
    );
}

#[test]
fn maps_translation_errors_to_pipeline_errors() {
    let cases = [
        (
            TranslationErrorCode::NoWorkspace,
            PipelineErrorCode::NoWorkspace,
        ),
        (TranslationErrorCode::NotFound, PipelineErrorCode::NotFound),
        (
            TranslationErrorCode::InvalidInput,
            PipelineErrorCode::InvalidInput,
        ),
        (
            TranslationErrorCode::DictionaryDuplicate,
            PipelineErrorCode::InvalidInput,
        ),
        (TranslationErrorCode::Io, PipelineErrorCode::Io),
        (TranslationErrorCode::Db, PipelineErrorCode::Db),
        (TranslationErrorCode::Task, PipelineErrorCode::Task),
    ];
    for (source, expected) in cases {
        let error = PipelineError::from(TranslationError::new(source, "detail"));
        assert_eq!(error.code, expected);
        assert_eq!(error.detail, "detail");
    }
}

#[test]
fn parses_statuses() {
    assert_eq!(
        PipelineStatus::parse("running"),
        Some(PipelineStatus::Running)
    );
    assert_eq!(PipelineStatus::parse("unknown"), None);
    assert_eq!(TaskStatus::parse("queued"), Some(TaskStatus::Queued));
    assert_eq!(TaskStatus::parse("unknown"), None);
}
