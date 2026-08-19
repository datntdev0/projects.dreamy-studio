use super::*;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use std::time::Instant;

fn job(passage: Option<usize>) -> TranslateJob {
    TranslateJob {
        novel_id: 7,
        target: "VI".to_string(),
        chapter_id: "0123456789abcdef0123456789abcdef".to_string(),
        passage,
        title: "Chapter title".to_string(),
        paragraphs: vec![
            "First paragraph".to_string(),
            "Second paragraph".to_string(),
        ],
        guidelines: "Keep names".to_string(),
        dict: Vec::new(),
    }
}

#[test]
fn prefixes_the_title_and_every_paragraph() {
    let translator = PlaceholderTranslator::with_delay(Duration::ZERO);
    let cancel = AtomicBool::new(false);

    let run = translator.translate(&job(None), &|_| {}, &cancel).unwrap();

    assert_eq!(run.title, "[translated] Chapter title");
    assert_eq!(
        run.paragraphs,
        vec![
            "[translated] First paragraph".to_string(),
            "[translated] Second paragraph".to_string(),
        ]
    );
}

#[test]
fn passage_job_returns_one_paragraph() {
    let translator = PlaceholderTranslator::with_delay(Duration::ZERO);
    let cancel = AtomicBool::new(false);
    let mut passage = job(Some(2));
    passage.paragraphs = vec!["Second paragraph".to_string()];

    let run = translator.translate(&passage, &|_| {}, &cancel).unwrap();

    assert_eq!(run.paragraphs, vec!["[translated] Second paragraph"]);
}

#[test]
fn reports_each_progress_step_in_order() {
    let translator = PlaceholderTranslator::with_delay(Duration::ZERO);
    let cancel = AtomicBool::new(false);
    let reported = Mutex::new(Vec::new());

    translator
        .translate(
            &job(None),
            &|value| reported.lock().unwrap().push(value),
            &cancel,
        )
        .unwrap();

    assert_eq!(*reported.lock().unwrap(), [20, 40, 60, 80, 100]);
}

#[test]
fn respects_the_configured_delay() {
    let translator = PlaceholderTranslator::with_delay(Duration::from_millis(50));
    let cancel = AtomicBool::new(false);
    let started = Instant::now();

    translator.translate(&job(None), &|_| {}, &cancel).unwrap();

    assert!(started.elapsed() >= Duration::from_millis(40));
}

#[test]
fn cancels_immediately_when_already_cancelled() {
    let translator = PlaceholderTranslator::with_delay(Duration::from_secs(10));
    let cancel = AtomicBool::new(true);
    let started = Instant::now();

    let result = translator.translate(&job(None), &|_| {}, &cancel);

    assert!(matches!(result, Err(TranslateError::Cancelled)));
    assert!(started.elapsed() < Duration::from_millis(100));
}

#[test]
fn cancels_within_a_short_polling_interval() {
    let translator = PlaceholderTranslator::with_delay(Duration::from_secs(10));
    let cancel = Arc::new(AtomicBool::new(false));
    let cancellation = cancel.clone();
    let trigger = thread::spawn(move || {
        thread::sleep(Duration::from_millis(50));
        cancellation.store(true, Ordering::SeqCst);
    });
    let started = Instant::now();

    let result = translator.translate(&job(None), &|_| {}, &cancel);

    trigger.join().unwrap();
    assert!(matches!(result, Err(TranslateError::Cancelled)));
    assert!(started.elapsed() < Duration::from_millis(500));
}

#[test]
fn default_uses_the_placeholder_delay() {
    assert_eq!(PlaceholderTranslator::default().delay, PLACEHOLDER_DELAY);
}
