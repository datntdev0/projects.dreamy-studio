use super::*;
use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::text::text_hash;
use crate::features::novel::files::NovelFiles;
use crate::features::pipeline::analyzer::LlmAnalyzer;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::TaskStatus;
use crate::features::settings::llm::CliSettings;
use crate::features::settings::llm::FeatureSettings;
use crate::features::settings::models::AppSettings;
use crate::features::settings::repository::SettingsRepository;
use crate::features::translation::service::TranslatedRun;
use crate::features::translation::service::TranslationWorkspace;
use crate::testing::analyzer::FakeAnalyzer;
use crate::testing::cli::ScriptedCli;
use crate::testing::job::JobFixture;
use crate::testing::job::RecordingTarget;
use std::time::Duration;
use tempfile::TempDir;

struct EagerAnalyzer;

impl Analyzer for EagerAnalyzer {
    fn analyze(
        &self,
        _job: &AnalyzeJob,
        _log: &TaskLog,
        _progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<ChapterAnalysis, AnalyzeError> {
        cancel.store(true, Ordering::SeqCst);
        Ok(ChapterAnalysis::default())
    }
}

struct Setup {
    fixture: JobFixture,
    workspace: KnowledgeWorkspace,
}

fn setup() -> Setup {
    let fixture = JobFixture::new();
    let workspace = KnowledgeWorkspace::new(fixture.path());
    Setup { fixture, workspace }
}

fn job_with(setup: &Setup, lang: KnowledgeLang, analyzer: Arc<dyn Analyzer>) -> AnalysisJob {
    AnalysisJob::new(
        setup.workspace.clone(),
        setup.fixture.novel_id,
        lang,
        analyzer,
    )
}

fn job(setup: &Setup, analyzer: &Arc<FakeAnalyzer>) -> AnalysisJob {
    job_with(setup, KnowledgeLang::Src, analyzer.clone())
}

fn fake() -> Arc<FakeAnalyzer> {
    Arc::new(FakeAnalyzer::new())
}

fn task_of(chapter_id: &str) -> PipelineTask {
    PipelineTask {
        id: 1,
        chapter_id: chapter_id.to_string(),
        passage: None,
        status: TaskStatus::Running,
        progress: 0,
        error: String::new(),
        started_at: None,
        finished_at: None,
    }
}

fn request(chapter_id: &str, passage: Option<usize>) -> TaskRequest {
    TaskRequest {
        chapter_id: chapter_id.to_string(),
        passage,
    }
}

fn run(job: &AnalysisJob, chapter_id: &str) -> Result<(), TaskOutcome> {
    job.run(
        &task_of(chapter_id),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(false),
    )
}

fn stored(setup: &Setup, lang: KnowledgeLang, chapter_id: &str) -> Option<ChapterAnalysis> {
    KnowledgeFiles::new(setup.fixture.path())
        .read(setup.fixture.novel_id, lang, chapter_id)
        .unwrap()
}

fn translate(setup: &Setup, chapter_id: &str) {
    TranslationWorkspace::new(setup.fixture.path())
        .save_run(
            setup.fixture.novel_id,
            "VI",
            chapter_id,
            None,
            TranslatedRun {
                title: "Chuong".to_string(),
                paragraphs: vec!["nguon".to_string()],
            },
        )
        .unwrap();
}

#[test]
fn describes_itself_for_the_executor() {
    let setup = setup();
    let job = job_with(&setup, KnowledgeLang::Vi, fake());

    assert_eq!(job.kind(), "analysis");
    assert_eq!(job.kind(), KIND_ANALYSIS);
    assert_eq!(job.scope(), "VI");
    assert_eq!(job.novel_id(), setup.fixture.novel_id);
    assert_eq!(job.dir(), setup.fixture.path());
    assert!(job.prepare().is_ok());
}

#[test]
fn a_completed_run_writes_the_chapter_file_with_the_hash_and_ontology() {
    let setup = setup();
    let chapter_id = setup.fixture.chapter_id.clone();

    run(&job(&setup, &fake()), &chapter_id).unwrap();

    let file = NovelFiles::new(setup.fixture.path())
        .novel_dir(setup.fixture.novel_id)
        .join("knowledgebase_src")
        .join(format!("chapter_{chapter_id}.json"));
    assert!(file.is_file());
    let analysis = stored(&setup, KnowledgeLang::Src, &chapter_id).unwrap();
    assert_eq!(analysis.ontology, 1);
    assert_eq!(analysis.source_hash, text_hash(&["source".to_string()]));
    assert!(!analysis.analyzed_at.is_empty());
    assert_eq!(analysis.entities[0].name, "Chapter");
    assert_eq!(analysis.facts[0].pred, "occupation");
}

#[test]
fn a_translated_lang_is_analyzed_on_the_translation_text() {
    let setup = setup();
    let chapter_id = setup.fixture.chapter_id.clone();
    translate(&setup, &chapter_id);
    let analyzer = fake();

    run(
        &job_with(&setup, KnowledgeLang::Vi, analyzer.clone()),
        &chapter_id,
    )
    .unwrap();

    let analysis = stored(&setup, KnowledgeLang::Vi, &chapter_id).unwrap();
    assert_eq!(analysis.source_hash, text_hash(&["nguon".to_string()]));
    assert!(stored(&setup, KnowledgeLang::Src, &chapter_id).is_none());
    let received = analyzer.received();
    assert_eq!(received[0].lang, "VI");
    assert_eq!(received[0].paragraphs, vec!["nguon".to_string()]);
}

#[test]
fn the_analyzer_receives_the_chapter_and_the_raw_ontology() {
    let setup = setup();
    let analyzer = fake();

    run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap();

    let received = analyzer.received();
    assert_eq!(received.len(), 1);
    assert_eq!(received[0].lang, "src");
    assert_eq!(received[0].title, "Chapter");
    assert_eq!(received[0].paragraphs, vec!["source".to_string()]);
    assert_eq!(received[0].ontology, Ontology::raw());
    assert!(received[0].known.is_empty());
}

#[test]
fn an_analyzer_error_is_a_failed_task_and_writes_nothing() {
    let setup = setup();
    let analyzer = Arc::new(FakeAnalyzer::new().failing_title("Chapter"));

    let outcome = run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap_err();

    assert_eq!(outcome, TaskOutcome::Failed("provider refused".to_string()));
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_none());
}

#[test]
fn a_cancelled_analyzer_is_a_cancelled_task_and_writes_nothing() {
    let setup = setup();
    let cancel = AtomicBool::new(true);

    let outcome = job(&setup, &fake())
        .run(
            &task_of(&setup.fixture.chapter_id),
            &TaskLog::none(),
            &|_| {},
            &cancel,
        )
        .unwrap_err();

    assert_eq!(outcome, TaskOutcome::Cancelled);
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_none());
}

#[test]
fn a_cancel_after_a_successful_analysis_writes_nothing() {
    let setup = setup();
    let job = job_with(&setup, KnowledgeLang::Src, Arc::new(EagerAnalyzer));

    let outcome = run(&job, &setup.fixture.chapter_id).unwrap_err();

    assert_eq!(outcome, TaskOutcome::Cancelled);
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_none());
}

#[test]
fn running_a_chapter_without_text_fails_the_task() {
    let setup = setup();
    let chapter_id = setup.fixture.chapter_id.clone();
    let job = job_with(&setup, KnowledgeLang::Vi, fake());

    let outcome = run(&job, &chapter_id).unwrap_err();

    assert!(matches!(outcome, TaskOutcome::Failed(_)));
    assert!(stored(&setup, KnowledgeLang::Vi, &chapter_id).is_none());
}

#[test]
fn running_an_unknown_chapter_fails_the_task() {
    let setup = setup();

    let outcome = run(&job(&setup, &fake()), "0123456789abcdef0123456789abcdef").unwrap_err();

    assert!(matches!(outcome, TaskOutcome::Failed(_)));
}

#[test]
fn known_entities_come_only_from_earlier_chapters() {
    let setup = setup();
    let second = setup.fixture.add_chapter("Two");
    let third = setup.fixture.add_chapter("Three");
    let first = setup.fixture.chapter_id.clone();
    run(&job(&setup, &fake()), &first).unwrap();
    run(&job(&setup, &fake()), &second).unwrap();
    run(&job(&setup, &fake()), &third).unwrap();
    let analyzer = fake();
    let job = job(&setup, &analyzer);

    run(&job, &second).unwrap();
    run(&job, &third).unwrap();
    run(&job, &first).unwrap();

    let names = |title: &str| -> Vec<String> {
        analyzer
            .received_for(title)
            .unwrap()
            .known
            .into_iter()
            .map(|entity| entity.name)
            .collect()
    };
    assert_eq!(names("Two"), vec!["Chapter".to_string()]);
    assert_eq!(
        names("Three"),
        vec!["Chapter".to_string(), "Two".to_string()]
    );
    assert!(names("Chapter").is_empty());
    assert_eq!(
        analyzer.received_for("Two").unwrap().known[0].kind,
        "persona"
    );
}

#[test]
fn a_rerun_overwrites_the_chapter_file() {
    let setup = setup();
    let chapter_id = setup.fixture.chapter_id.clone();
    run(&job(&setup, &fake()), &chapter_id).unwrap();
    let canned = ChapterAnalysis::default();
    let analyzer = Arc::new(FakeAnalyzer::new().with_analysis("Chapter", canned));

    run(&job(&setup, &analyzer), &chapter_id).unwrap();

    let analysis = stored(&setup, KnowledgeLang::Src, &chapter_id).unwrap();
    assert!(analysis.entities.is_empty());
    assert_eq!(analysis.ontology, 1);
}

#[test]
fn validates_the_chapters_and_passages_of_the_tasks() {
    let setup = setup();
    let job = job(&setup, &fake());
    let chapter_id = setup.fixture.chapter_id.clone();
    let empty = setup
        .fixture
        .novel
        .chapter_add(setup.fixture.novel_id, "Empty")
        .unwrap();

    assert!(job.validate(&[request(&chapter_id, None)]).is_ok());
    let passage = job.validate(&[request(&chapter_id, Some(1))]).unwrap_err();
    let missing = job
        .validate(&[request("0123456789abcdef0123456789abcdef", None)])
        .unwrap_err();
    let no_paragraphs = job.validate(&[request(&empty.id, None)]).unwrap_err();

    assert_eq!(passage.code, PipelineErrorCode::InvalidInput);
    assert_eq!(missing.code, PipelineErrorCode::NotFound);
    assert_eq!(no_paragraphs.code, PipelineErrorCode::InvalidInput);
    assert_eq!(no_paragraphs.detail, "no src text for chapters 2");
}

#[test]
fn a_translated_lang_without_the_translation_fails_with_every_seq() {
    let setup = setup();
    let second = setup.fixture.add_chapter("Two");
    let third = setup.fixture.add_chapter("Three");
    let first = setup.fixture.chapter_id.clone();
    translate(&setup, &second);
    let job = job_with(&setup, KnowledgeLang::Vi, fake());

    let error = job
        .validate(&[
            request(&first, None),
            request(&second, None),
            request(&third, None),
        ])
        .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(error.detail, "no VI text for chapters 1, 3");
    assert!(job.validate(&[request(&second, None)]).is_ok());
}

#[test]
fn the_executor_runs_an_analysis_job_to_completion() {
    let setup = setup();
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let chapter_id = setup.fixture.chapter_id.clone();

    let snapshot = executor
        .start(
            Box::new(job(&setup, &fake())),
            setup.fixture.tasks(),
            target.clone(),
        )
        .unwrap();

    assert_eq!(snapshot.kind, "analysis");
    assert_eq!(snapshot.target, "src");
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 1);
    let analysis = stored(&setup, KnowledgeLang::Src, &chapter_id).unwrap();
    assert_eq!(analysis.source_hash, text_hash(&["source".to_string()]));
    assert_eq!(analysis.ontology, 1);
    assert!(!analysis.analyzed_at.is_empty());
}

#[test]
fn the_executor_fails_only_the_chapter_the_analyzer_refused() {
    let setup = setup();
    let bad = setup.fixture.add_chapter("Bad");
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let analyzer = Arc::new(FakeAnalyzer::new().failing_title("Bad"));
    let mut tasks = setup.fixture.tasks();
    tasks.push(request(&bad, None));

    executor
        .start(Box::new(job(&setup, &analyzer)), tasks, target.clone())
        .unwrap();

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.done, 1);
    assert_eq!(finished.failed, 1);
    let failed = finished
        .tasks
        .iter()
        .find(|task| task.chapter_id == bad)
        .unwrap();
    assert_eq!(failed.status, TaskStatus::Failed);
    assert_eq!(failed.error, "provider refused");
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_some());
    assert!(stored(&setup, KnowledgeLang::Src, &bad).is_none());
}

#[test]
fn the_executor_records_a_cancelled_analysis_without_writing_it() {
    let setup = setup();
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let analyzer = Arc::new(FakeAnalyzer::new().with_delay(Duration::from_secs(10)));
    let snapshot = executor
        .start(
            Box::new(job(&setup, &analyzer)),
            setup.fixture.tasks(),
            target.clone(),
        )
        .unwrap();

    assert!(executor.cancel_pipeline(snapshot.id));

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert_eq!(finished.tasks[0].status, TaskStatus::Cancelled);
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_none());
}

#[test]
fn the_executor_rejects_a_translated_lang_without_translation_before_queueing() {
    let setup = setup();
    let executor = PipelineExecutor::new();

    let error = executor
        .start(
            Box::new(job_with(&setup, KnowledgeLang::En, fake())),
            setup.fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .err()
        .unwrap();

    assert_eq!(error.detail, "no EN text for chapters 1");
    assert!(!executor.cancel());
}

#[test]
fn the_factory_needs_an_open_workspace() {
    let factory = AnalysisJobFactory::new(KnowledgeService::new(), fake());

    let error = factory
        .create(
            &WorkspaceSession::new(),
            1,
            &serde_json::json!({ "lang": "VI" }),
        )
        .err()
        .unwrap();

    assert_eq!(factory.kind(), KIND_ANALYSIS);
    assert_eq!(error.code, PipelineErrorCode::NoWorkspace);
}

const BAD_REPLY: &str = "{\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"Wren\",\"ev\":[{\"p\":1,\"q\":\"source\"}]},{\"id\":\"E2\",\"type\":\"planet\",\"name\":\"Mars\"}],\"facts\":[]}";

const GOOD_REPLY: &str = "{\"entities\":[{\"id\":\"E1\",\"type\":\"persona\",\"name\":\"Wren\",\"ev\":[{\"p\":1,\"q\":\"source\"}]}],\"facts\":[{\"id\":\"F1\",\"pred\":\"occupation\",\"subject\":\"E1\",\"ev\":[{\"p\":1,\"q\":\"source\"}]}]}";

fn llm_analyzer(dir: &TempDir, cli: &ScriptedCli) -> Arc<LlmAnalyzer> {
    let repository = SettingsRepository::new(dir.path().join("settings.json"));
    let mut settings = AppSettings::default();
    settings.llm.providers.insert(
        "claude".to_string(),
        CliSettings {
            path: Some(cli.path.clone()),
        },
    );
    settings.llm.features.insert(
        "knowledge".to_string(),
        FeatureSettings {
            provider: Some("claude".to_string()),
            ..FeatureSettings::default()
        },
    );
    repository.save(&settings).unwrap();
    Arc::new(LlmAnalyzer::new(repository))
}

fn only_run_folder(logs: &TempDir) -> std::path::PathBuf {
    let folders: Vec<_> = std::fs::read_dir(logs.path())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(folders.len(), 1);
    folders[0].clone()
}

#[test]
fn an_analysis_run_logs_its_command_prompts_and_responses_in_its_own_folder() {
    let setup = setup();
    let chapter_id = setup.fixture.chapter_id.clone();
    let tools = TempDir::new().unwrap();
    let cli = ScriptedCli::new(tools.path(), &[BAD_REPLY, GOOD_REPLY]);
    let analyzer = llm_analyzer(&tools, &cli);
    let logs = TempDir::new().unwrap();
    let executor = PipelineExecutor::with_logs(logs.path().to_path_buf());
    let target = Arc::new(RecordingTarget::new());

    executor
        .start(
            Box::new(job_with(&setup, KnowledgeLang::Src, analyzer)),
            setup.fixture.tasks(),
            target.clone(),
        )
        .unwrap();

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    let folder = only_run_folder(&logs);
    assert!(folder.to_string_lossy().ends_with("-analysis-1"));
    let log = std::fs::read_to_string(folder.join("pipeline.log")).unwrap();
    let prefix = format!("t1-{chapter_id}");
    for expected in [
        "[pipeline] analysis pipeline 1 (src) for novel 1: 1 tasks, running",
        "[pipeline] prepared",
        "analyzing \"Chapter\": 1 paragraphs, 0 known entities from earlier chapters, language src",
        "exchange 1 (new session): ",
        "--session-id",
        "exchange 1 working directory: ",
        &format!("exchange 1 prompt: {prefix}-exchange-1-prompt.txt"),
        &format!("exchange 1 response: {prefix}-exchange-1-response.txt"),
        "reply has 1 problems",
        "problem: entity E2: type \"planet\" is not in the ontology",
        "retry 1 of 2: sending the problems back into session ",
        "exchange 2 (resumed session): ",
        "--resume",
        &format!("exchange 2 prompt: {prefix}-exchange-2-prompt.txt"),
        "reply accepted: 1 entities, 1 facts",
        "saved 1 entities and 1 facts",
        "] completed",
        "[pipeline] finished Completed: 1 done, 0 failed of 1 tasks",
    ] {
        assert!(
            log.contains(expected),
            "log misses {expected:?}:
{log}"
        );
    }
    let read =
        |name: &str| std::fs::read_to_string(folder.join(format!("{prefix}-{name}"))).unwrap();
    assert!(read("exchange-1-prompt.txt").contains("[1] source"));
    assert!(read("exchange-1-prompt.txt").contains("Chapter title: Chapter"));
    assert!(read("exchange-1-response.txt").contains("planet"));
    assert!(read("exchange-2-prompt.txt").contains("type \"planet\" is not in the ontology"));
    assert!(read("exchange-2-response.txt").contains("occupation"));
    let analysis = stored(&setup, KnowledgeLang::Src, &chapter_id).unwrap();
    assert_eq!(analysis.entities.len(), 1);
    assert_eq!(analysis.facts.len(), 1);
}

#[test]
fn a_failed_analysis_run_logs_the_failure() {
    let setup = setup();
    let tools = TempDir::new().unwrap();
    let cli = ScriptedCli::new(tools.path(), &["no json", "still none", "never"]);
    let analyzer = llm_analyzer(&tools, &cli);
    let logs = TempDir::new().unwrap();
    let executor = PipelineExecutor::with_logs(logs.path().to_path_buf());
    let target = Arc::new(RecordingTarget::new());

    executor
        .start(
            Box::new(job_with(&setup, KnowledgeLang::Src, analyzer)),
            setup.fixture.tasks(),
            target.clone(),
        )
        .unwrap();

    assert_eq!(target.wait_for_finished().status, PipelineStatus::Failed);
    let log = std::fs::read_to_string(only_run_folder(&logs).join("pipeline.log")).unwrap();
    assert!(log.contains("reply cannot be used: The model did not return a JSON result."));
    assert!(log.contains("] failed: The model did not return a JSON result."));
    assert!(log.contains("[pipeline] finished Failed: 0 done, 1 failed of 1 tasks"));
}

#[test]
fn a_run_without_a_log_folder_still_works() {
    let setup = setup();
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());

    executor
        .start(
            Box::new(job(&setup, &fake())),
            setup.fixture.tasks(),
            target.clone(),
        )
        .unwrap();

    assert_eq!(target.wait_for_finished().status, PipelineStatus::Completed);
}
