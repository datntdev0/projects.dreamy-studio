use super::*;
use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::models::AnalysisEvidence;
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
    fn candidates(
        &self,
        job: &CandidateJob,
        _log: &TaskLog,
        _progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<ChapterDraft>, AnalyzeError> {
        cancel.store(true, Ordering::SeqCst);
        Ok(job
            .chapters
            .iter()
            .map(|_| ChapterDraft::default())
            .collect())
    }

    fn facts(
        &self,
        _job: &FactsJob,
        _log: &TaskLog,
        _progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<AnalysisFact>, AnalyzeError> {
        cancel.store(true, Ordering::SeqCst);
        Ok(Vec::new())
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
        segment_id: None,
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
        segment_id: None,
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

fn six_chapters(setup: &Setup) -> Vec<String> {
    let mut ids = vec![setup.fixture.chapter_id.clone()];
    for title in ["Two", "Three", "Four", "Five", "Six"] {
        ids.push(setup.fixture.add_chapter(title));
    }
    ids
}

fn tasks_of(ids: &[String]) -> Vec<TaskRequest> {
    ids.iter().map(|id| request(id, None)).collect()
}

fn start_and_wait(
    setup: &Setup,
    job: AnalysisJob,
    ids: &[String],
) -> crate::features::pipeline::models::PipelineSnapshot {
    let _ = setup;
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    executor
        .start(Box::new(job), tasks_of(ids), target.clone())
        .unwrap();
    target.wait_for_finished()
}

fn known_names(call: &CandidateJob) -> Vec<String> {
    call.known
        .iter()
        .map(|entity| entity.name.clone())
        .collect()
}

#[test]
fn describes_itself_for_the_executor() {
    let setup = setup();
    let job = job_with(&setup, KnowledgeLang::Vi, fake());

    assert_eq!(job.kind(), "analysis");
    assert_eq!(job.kind(), KIND_ANALYSIS);
    assert_eq!(job.scope(), "VI");
    assert_eq!(job.owner(), JobOwner::Novel(setup.fixture.novel_id));
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
    let candidates = analyzer.candidate_calls();
    assert_eq!(candidates[0].lang, "VI");
    assert_eq!(
        candidates[0].chapters[0].paragraphs,
        vec!["nguon".to_string()]
    );
    assert_eq!(
        analyzer.fact_calls()[0].paragraphs,
        vec!["nguon".to_string()]
    );
}

#[test]
fn the_analyzer_receives_the_chapter_text_and_then_its_entities() {
    let setup = setup();
    let analyzer = fake();

    run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap();

    let candidates = analyzer.candidate_calls();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].lang, "src");
    assert_eq!(candidates[0].chapters.len(), 1);
    assert_eq!(candidates[0].chapters[0].seq, 1);
    assert_eq!(candidates[0].chapters[0].title, "Chapter");
    assert_eq!(
        candidates[0].chapters[0].paragraphs,
        vec!["source".to_string()]
    );
    assert!(candidates[0].known.is_empty());
    let facts = analyzer.fact_calls();
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].title, "Chapter");
    assert_eq!(facts[0].entities[0].id, "E1");
    assert_eq!(facts[0].entities[0].name, "Chapter");
}

fn wren_and_aldous() -> ChapterDraft {
    let quote = vec![AnalysisEvidence {
        p: 1,
        q: "source".to_string(),
    }];
    let entity = |id: &str, kind: &str, name: &str| AnalysisEntity {
        id: id.to_string(),
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: quote.clone(),
    };
    ChapterDraft {
        entities: vec![
            entity("E1", "persona", "Wren"),
            entity("E2", "character", "Aldous"),
        ],
        facts: vec![AnalysisFact {
            id: "F1".to_string(),
            pred: "persona_of".to_string(),
            subject: "E1".to_string(),
            object: Some("E2".to_string()),
            ev: quote.clone(),
        }],
    }
}

#[test]
fn the_persona_of_links_of_the_candidates_are_saved_before_the_facts_of_the_chapter() {
    let setup = setup();
    let analyzer = Arc::new(FakeAnalyzer::new().with_draft("Chapter", wren_and_aldous()));

    run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap();

    let analysis = stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).unwrap();
    assert_eq!(analysis.entities.len(), 2);
    let preds: Vec<(&str, &str)> = analysis
        .facts
        .iter()
        .map(|fact| (fact.id.as_str(), fact.pred.as_str()))
        .collect();
    assert_eq!(preds, [("F1", "persona_of"), ("F2", "occupation")]);
    assert_eq!(analysis.facts[0].object.as_deref(), Some("E2"));
    assert_eq!(analysis.facts[1].subject, "E1");
    assert_eq!(analyzer.fact_calls()[0].entities.len(), 2);
}

#[test]
fn the_facts_found_for_a_chapter_are_renumbered_after_its_persona_of_links() {
    let setup = setup();
    let quote = vec![AnalysisEvidence {
        p: 1,
        q: "source".to_string(),
    }];
    let found = |id: &str, pred: &str, subject: &str| AnalysisFact {
        id: id.to_string(),
        pred: pred.to_string(),
        subject: subject.to_string(),
        object: None,
        ev: quote.clone(),
    };
    let analyzer = Arc::new(
        FakeAnalyzer::new()
            .with_draft("Chapter", wren_and_aldous())
            .with_facts(
                "Chapter",
                vec![found("X1", "occupation", "E1"), found("X2", "trait", "E2")],
            ),
    );

    run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap();

    let analysis = stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).unwrap();
    let facts: Vec<(&str, &str, &str)> = analysis
        .facts
        .iter()
        .map(|fact| (fact.id.as_str(), fact.pred.as_str(), fact.subject.as_str()))
        .collect();
    assert_eq!(
        facts,
        [
            ("F1", "persona_of", "E1"),
            ("F2", "occupation", "E1"),
            ("F3", "trait", "E2"),
        ]
    );
    let job = analyzer.facts_for("Chapter").unwrap();
    assert_eq!(job.paragraphs, vec!["source".to_string()]);
    assert_eq!(job.entities.len(), 2);
    assert!(analyzer.facts_for("Other").is_none());
}

#[test]
fn a_later_batch_knows_the_character_of_a_persona_but_not_the_character_entity() {
    let setup = setup();
    let ids = six_chapters(&setup);
    let analyzer = Arc::new(FakeAnalyzer::new().with_draft("Chapter", wren_and_aldous()));
    let job = job(&setup, &analyzer);
    job.validate(&tasks_of(&ids)).unwrap();

    run(&job, &ids[0]).unwrap();
    run(&job, &ids[5]).unwrap();

    let call = analyzer.candidates_with("Six").unwrap();
    assert_eq!(known_names(&call)[0], "Wren");
    assert_eq!(call.known[0].character.as_deref(), Some("Aldous"));
    assert!(call.known.iter().all(|entity| entity.kind != "character"));
}

#[test]
fn a_chapter_without_entities_is_saved_empty_without_asking_for_facts() {
    let setup = setup();
    let analyzer = Arc::new(FakeAnalyzer::new().with_entities("Chapter", Vec::new()));

    run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap();

    let analysis = stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).unwrap();
    assert!(analysis.entities.is_empty());
    assert!(analysis.facts.is_empty());
    assert_eq!(analysis.ontology, 1);
    assert!(analyzer.fact_calls().is_empty());
}

#[test]
fn a_candidate_error_is_a_failed_task_and_writes_nothing() {
    let setup = setup();
    let analyzer = Arc::new(FakeAnalyzer::new().failing_candidates("Chapter"));

    let outcome = run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap_err();

    assert_eq!(
        outcome,
        TaskOutcome::Failed("candidates refused".to_string())
    );
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_none());
    assert!(analyzer.fact_calls().is_empty());
}

#[test]
fn a_fact_error_is_a_failed_task_and_writes_nothing() {
    let setup = setup();
    let analyzer = Arc::new(FakeAnalyzer::new().failing_title("Chapter"));

    let outcome = run(&job(&setup, &analyzer), &setup.fixture.chapter_id).unwrap_err();

    assert_eq!(outcome, TaskOutcome::Failed("provider refused".to_string()));
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_none());
}

#[test]
fn a_cancelled_run_is_a_cancelled_task_and_writes_nothing() {
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
fn a_cancel_after_the_candidates_writes_nothing() {
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
fn progress_moves_through_the_candidates_and_the_facts_up_to_one_hundred() {
    let setup = setup();
    let reported = std::sync::Mutex::new(Vec::new());

    job(&setup, &fake())
        .run(
            &task_of(&setup.fixture.chapter_id),
            &TaskLog::none(),
            &|value| reported.lock().unwrap().push(value),
            &AtomicBool::new(false),
        )
        .unwrap();

    let values = reported.lock().unwrap().clone();
    assert_eq!(values, [50, 50, 100, 100]);
    assert!(values.windows(2).all(|pair| pair[0] <= pair[1]));
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

    let known = |title: &str| known_names(&analyzer.candidates_with(title).unwrap());
    assert_eq!(known("Two"), vec!["Chapter".to_string()]);
    assert_eq!(
        known("Three"),
        vec!["Chapter".to_string(), "Two".to_string()]
    );
    assert!(known("Chapter").is_empty());
    assert_eq!(
        analyzer.candidates_with("Two").unwrap().known[0].kind,
        "persona"
    );
}

#[test]
fn a_rerun_overwrites_the_chapter_file() {
    let setup = setup();
    let chapter_id = setup.fixture.chapter_id.clone();
    run(&job(&setup, &fake()), &chapter_id).unwrap();
    let analyzer = Arc::new(FakeAnalyzer::new().with_entities("Chapter", Vec::new()));

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
fn five_chapters_share_one_candidate_call_and_each_asks_for_its_own_facts() {
    let setup = setup();
    let ids = six_chapters(&setup);
    let analyzer = fake();

    let finished = start_and_wait(&setup, job(&setup, &analyzer), &ids);

    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 6);
    let mut sizes: Vec<usize> = analyzer
        .candidate_calls()
        .iter()
        .map(|call| call.chapters.len())
        .collect();
    sizes.sort_unstable();
    assert_eq!(sizes, [1, 5]);
    assert_eq!(analyzer.fact_calls().len(), 6);
    for id in &ids {
        let analysis = stored(&setup, KnowledgeLang::Src, id).unwrap();
        assert_eq!(analysis.entities.len(), 1);
        assert_eq!(analysis.facts.len(), 1);
    }
}

#[test]
fn the_batch_holds_the_chapters_in_order_even_when_the_tasks_are_not() {
    let setup = setup();
    let mut ids = six_chapters(&setup);
    ids.reverse();
    let analyzer = fake();

    start_and_wait(&setup, job(&setup, &analyzer), &ids);

    let calls = analyzer.candidate_calls();
    let big = calls.iter().find(|call| call.chapters.len() == 5).unwrap();
    let seqs: Vec<i64> = big.chapters.iter().map(|chapter| chapter.seq).collect();
    assert_eq!(seqs, [1, 2, 3, 4, 5]);
}

#[test]
fn the_batch_size_is_configurable_and_capped() {
    let setup = setup();
    let ids = six_chapters(&setup);
    let analyzer = fake();

    start_and_wait(&setup, job(&setup, &analyzer).with_batch_size(2), &ids);

    let mut sizes: Vec<usize> = analyzer
        .candidate_calls()
        .iter()
        .map(|call| call.chapters.len())
        .collect();
    sizes.sort_unstable();
    assert_eq!(sizes, [2, 2, 2]);

    let all = fake();
    start_and_wait(&setup, job(&setup, &all).with_batch_size(99), &ids);
    assert_eq!(all.candidate_calls().len(), 1);
}

#[test]
fn a_later_batch_knows_the_candidates_of_an_earlier_batch_before_they_are_saved() {
    let setup = setup();
    let ids = six_chapters(&setup);
    let analyzer = fake();
    let job = job(&setup, &analyzer);
    job.validate(&tasks_of(&ids)).unwrap();

    run(&job, &ids[0]).unwrap();
    run(&job, &ids[5]).unwrap();

    let call = analyzer.candidates_with("Six").unwrap();
    assert_eq!(
        known_names(&call),
        ["Chapter", "Two", "Three", "Four", "Five"]
    );
    assert!(stored(&setup, KnowledgeLang::Src, &ids[1]).is_none());
}

#[test]
fn a_failed_candidate_call_fails_every_chapter_of_its_batch() {
    let setup = setup();
    let ids = six_chapters(&setup);
    let analyzer = Arc::new(FakeAnalyzer::new().failing_candidates("Three"));

    let finished = start_and_wait(&setup, job(&setup, &analyzer), &ids);

    assert_eq!(finished.status, PipelineStatus::Failed);
    let failed: Vec<&str> = finished
        .tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Failed)
        .map(|task| task.error.as_str())
        .collect();
    assert_eq!(failed.len(), 5);
    assert!(failed.iter().all(|error| *error == "candidates refused"));
    let sixth = finished
        .tasks
        .iter()
        .find(|task| task.chapter_id == ids[5])
        .unwrap();
    assert_eq!(sixth.status, TaskStatus::Completed);
    assert!(stored(&setup, KnowledgeLang::Src, &ids[0]).is_none());
    assert!(stored(&setup, KnowledgeLang::Src, &ids[5]).is_some());
}

#[test]
fn the_executor_fails_only_the_chapter_whose_facts_were_refused() {
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
    assert_eq!(analyzer.candidate_calls().len(), 1);
    assert!(stored(&setup, KnowledgeLang::Src, &setup.fixture.chapter_id).is_some());
    assert!(stored(&setup, KnowledgeLang::Src, &bad).is_none());
}

#[test]
fn the_executor_records_a_cancelled_analysis_without_writing_it() {
    let setup = setup();
    let ids = six_chapters(&setup);
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let analyzer = Arc::new(FakeAnalyzer::new().with_delay(Duration::from_secs(10)));
    let snapshot = executor
        .start(
            Box::new(job(&setup, &analyzer)),
            tasks_of(&ids[..3]),
            target.clone(),
        )
        .unwrap();

    assert!(executor.cancel_pipeline(snapshot.id));

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert!(
        finished
            .tasks
            .iter()
            .all(|task| task.status == TaskStatus::Cancelled)
    );
    assert!(stored(&setup, KnowledgeLang::Src, &ids[0]).is_none());
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
            JobOwner::Novel(1),
            &serde_json::json!({ "lang": "VI" }),
        )
        .err()
        .unwrap();

    assert_eq!(factory.kind(), KIND_ANALYSIS);
    assert_eq!(error.code, PipelineErrorCode::NoWorkspace);
}

const BAD_CANDIDATES: &str = "{\"entities\":[{\"type\":\"persona\",\"name\":\"source\"},{\"type\":\"character\",\"name\":\"Mara Voss\"},{\"type\":\"planet\",\"name\":\"Mars\"}],\"facts\":[{\"pred\":\"persona_of\",\"subject\":\"source\",\"object\":\"Mara Voss\"}]}";

const CANDIDATES: &str = "{\"entities\":[{\"type\":\"persona\",\"name\":\"source\"},{\"type\":\"character\",\"name\":\"Mara Voss\"}],\"facts\":[{\"pred\":\"persona_of\",\"subject\":\"source\",\"object\":\"Mara Voss\"}]}";

const FACTS: &str = "{\"facts\":[{\"pred\":\"occupation\",\"subject\":\"E1\",\"ev\":[{\"p\":1,\"q\":\"source\"}]}]}";

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

fn one_at_a_time(executor: &PipelineExecutor) {
    executor.set_limits(crate::features::pipeline::executor::PipelineLimits::new(
        1, 1,
    ));
}

#[test]
fn a_batch_run_logs_the_command_prompts_and_responses_of_both_phases() {
    let setup = setup();
    let second = setup.fixture.add_chapter("Two");
    let first = setup.fixture.chapter_id.clone();
    let tools = TempDir::new().unwrap();
    let cli = ScriptedCli::new(tools.path(), &[BAD_CANDIDATES, CANDIDATES, FACTS, FACTS]);
    let analyzer = llm_analyzer(&tools, &cli);
    let logs = TempDir::new().unwrap();
    let executor = PipelineExecutor::with_logs(logs.path().to_path_buf());
    one_at_a_time(&executor);
    let target = Arc::new(RecordingTarget::new());

    executor
        .start(
            Box::new(job_with(&setup, KnowledgeLang::Src, analyzer)),
            tasks_of(&[first.clone(), second.clone()]),
            target.clone(),
        )
        .unwrap();

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(cli.calls(), 4);
    let folder = only_run_folder(&logs);
    assert!(folder.to_string_lossy().ends_with("-analysis-1"));
    let log = std::fs::read_to_string(folder.join("pipeline.log")).unwrap();
    for expected in [
        "[pipeline] analysis pipeline 1 (src) for novel 1: 2 tasks, running",
        "finding candidates for 2 chapters (seq 1, 2), 0 known entities from earlier chapters, language src",
        "(candidates, new session): ",
        "--session-id",
        "exchange 1 working directory: ",
        "candidates: reply has 1 problems",
        "problem: entity \"Mars\": type \"planet\" is not in the ontology",
        "candidates: retry 1 of 2, sending the problems back into session ",
        "(candidates, resumed session): ",
        "--resume",
        "candidates: reply accepted",
        "candidates found: 2 + 2",
        "the candidates of this chapter came from its batch",
        "2 entities and 1 persona_of links found in this chapter",
        "(facts, new session): ",
        "facts: reply accepted",
        "saved 2 entities and 2 facts",
        "] completed",
        "[pipeline] finished Completed: 2 done, 0 failed of 2 tasks",
    ] {
        assert!(log.contains(expected), "log misses {expected:?}:\n{log}");
    }
    let leader = format!("t1-{first}");
    let read =
        |name: &str| std::fs::read_to_string(folder.join(format!("{leader}-{name}"))).unwrap();
    assert!(read("exchange-1-candidates-prompt.txt").contains("## Chapter 1: Chapter"));
    assert!(read("exchange-1-candidates-prompt.txt").contains("## Chapter 2: Two"));
    assert!(read("exchange-1-candidates-response.txt").contains("planet"));
    assert!(
        read("exchange-2-candidates-prompt.txt").contains("type \"planet\" is not in the ontology")
    );
    assert!(read("exchange-2-candidates-response.txt").contains("\"source\""));
    assert!(read("exchange-3-facts-prompt.txt").contains("- E1 | persona | source"));
    assert!(read("exchange-3-facts-response.txt").contains("occupation"));
    let follower = format!("t2-{second}-exchange-1-facts-prompt.txt");
    assert!(folder.join(follower).is_file());
    for id in [&first, &second] {
        let analysis = stored(&setup, KnowledgeLang::Src, id).unwrap();
        assert_eq!(analysis.entities.len(), 2);
        assert_eq!(analysis.facts.len(), 2);
    }
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
    assert!(
        log.contains("candidates: reply cannot be used: The model did not return a JSON result.")
    );
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
