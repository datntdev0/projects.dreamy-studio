use super::*;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::testing::job::FAKE_KIND;
use crate::testing::job::FakeJob;
use crate::testing::job::JobFixture;
use serde_json::json;
use std::sync::Mutex;

struct FakeFactory {
    job: FakeJob,
    seen: Mutex<Vec<(JobOwner, serde_json::Value)>>,
}

impl JobFactory for FakeFactory {
    fn kind(&self) -> &'static str {
        FAKE_KIND
    }

    fn create(
        &self,
        _session: &WorkspaceSession,
        owner: JobOwner,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>> {
        self.seen.lock().unwrap().push((owner, params.clone()));
        Ok(self.job.boxed())
    }
}

#[test]
fn creates_the_job_of_the_registered_kind() {
    let fixture = JobFixture::new();
    let factory = Arc::new(FakeFactory {
        job: FakeJob::new(&fixture, "VI"),
        seen: Mutex::new(Vec::new()),
    });
    let registry = JobRegistry::new().register(factory.clone());

    let job = registry
        .create(
            FAKE_KIND,
            &WorkspaceSession::new(),
            JobOwner::Project(7),
            &json!({ "scope": "VI" }),
        )
        .unwrap();

    assert_eq!(job.kind(), FAKE_KIND);
    assert_eq!(job.scope(), "VI");
    assert_eq!(
        *factory.seen.lock().unwrap(),
        vec![(JobOwner::Project(7), json!({ "scope": "VI" }))]
    );
}

#[test]
fn rejects_an_unknown_kind_as_invalid_input() {
    let registry = JobRegistry::new();

    let error = registry
        .create(
            "missing",
            &WorkspaceSession::new(),
            JobOwner::Novel(1),
            &json!({}),
        )
        .err()
        .unwrap();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert!(error.detail.contains("missing"));
}
