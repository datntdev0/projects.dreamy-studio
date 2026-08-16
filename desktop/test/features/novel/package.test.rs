use super::*;
use crate::features::novel::models::NullSink;
use crate::testing::package::JPEG_BYTES;
use crate::testing::package::manifest_json;
use crate::testing::package::sample_package;
use crate::testing::package::zip_bytes;
use std::io::Cursor;
use std::sync::Mutex;

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<InspectEvent>>,
}

impl InspectSink for &Recorder {
    fn emit(&self, event: InspectEvent) {
        self.events.lock().unwrap().push(event);
    }
}

fn inspect(bytes: Vec<u8>) -> NovelResult<(PackageReader<Cursor<Vec<u8>>>, ValidatedPackage)> {
    inspect_reader(Cursor::new(bytes), &NullSink)
}

fn failure(bytes: Vec<u8>) -> NovelError {
    match inspect(bytes) {
        Ok(_) => panic!("package should be rejected"),
        Err(error) => error,
    }
}

fn with_manifest(manifest: &str, chapters: &[(&str, &[u8])]) -> Vec<u8> {
    let mut entries: Vec<(&str, &[u8])> = vec![("manifest.json", manifest.as_bytes())];
    entries.extend_from_slice(chapters);
    zip_bytes(&entries)
}

#[test]
fn validates_a_package_and_summarizes_it() {
    let (_, package) = inspect(sample_package(3)).unwrap();
    let summary = package.summary();

    assert_eq!(summary.title, "Sample");
    assert_eq!(summary.author, "Someone");
    assert_eq!(summary.lang, "ZH");
    assert_eq!(summary.chapter_count, 3);
    assert_eq!(summary.word_count, 3 * (4 + 3 + 3));
    assert!(summary.has_cover);
    assert_eq!(package.chapters[1].title, "Chapter 2");
}

#[test]
fn reads_normalized_chapter_text_and_cover() {
    let (mut reader, package) = inspect(sample_package(1)).unwrap();

    let text = reader.read_chapter_text(&package.chapters[0].file).unwrap();
    let cover = reader.read_cover(package.cover.as_ref().unwrap()).unwrap();

    assert_eq!(
        text,
        "\u{534E}\u{706F}\u{521D}\u{4E0A}\nSecond line here\n\u{7B2C}\u{4E09}\u{6BB5}\n"
    );
    assert_eq!(cover, JPEG_BYTES);
}

#[test]
fn streams_every_step_in_order_with_running_and_ok() {
    let recorder = Recorder::default();

    inspect_reader(Cursor::new(sample_package(2)), &&recorder).unwrap();

    let events = recorder.events.lock().unwrap();
    let steps: Vec<_> = events
        .iter()
        .map(|event| (event.step, event.status))
        .collect();
    assert_eq!(
        steps,
        vec![
            (InspectStep::Open, InspectStatus::Ok),
            (InspectStep::Manifest, InspectStatus::Running),
            (InspectStep::Manifest, InspectStatus::Ok),
            (InspectStep::Chapters, InspectStatus::Running),
            (InspectStep::Chapters, InspectStatus::Ok),
            (InspectStep::List, InspectStatus::Running),
            (InspectStep::List, InspectStatus::Ok),
            (InspectStep::Cover, InspectStatus::Running),
            (InspectStep::Cover, InspectStatus::Ok),
        ]
    );
}

#[test]
fn path_inspection_emits_format_and_open_first() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("book.dsnovel");
    std::fs::write(&path, sample_package(1)).unwrap();
    let recorder = Recorder::default();

    inspect_path(&path, &&recorder).unwrap();

    let events = recorder.events.lock().unwrap();
    assert_eq!(
        events[0],
        InspectEvent::new(InspectStep::Format, InspectStatus::Running, None)
    );
    assert_eq!(
        events[1],
        InspectEvent::new(InspectStep::Format, InspectStatus::Ok, None)
    );
    assert_eq!(events[2].step, InspectStep::Open);
    assert_eq!(events[2].status, InspectStatus::Running);
}

#[test]
fn a_failing_step_reports_fail_and_stops() {
    let recorder = Recorder::default();
    let bytes = zip_bytes(&[("readme.txt", b"hi")]);

    let result = inspect_reader(Cursor::new(bytes), &&recorder);

    assert_eq!(result.err().unwrap().code, NovelErrorCode::PackageManifest);
    let events = recorder.events.lock().unwrap();
    let last = events.last().unwrap();
    assert_eq!(last.step, InspectStep::Manifest);
    assert_eq!(last.status, InspectStatus::Fail);
    assert!(last.detail.is_some());
    assert!(
        events
            .iter()
            .all(|event| event.step != InspectStep::Chapters)
    );
}

#[test]
fn rejects_files_that_are_not_regular_packages() {
    let dir = tempfile::tempdir().unwrap();
    let wrong = dir.path().join("book.rar");
    std::fs::write(&wrong, b"x").unwrap();
    let folder = dir.path().join("folder.zip");
    std::fs::create_dir(&folder).unwrap();
    let missing = dir.path().join("missing.zip");

    for path in [&wrong, &folder, &missing] {
        let error = check_package_path(path).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::PackageFormat);
    }
    let upper = dir.path().join("BOOK.DSNOVEL");
    std::fs::write(&upper, b"x").unwrap();
    assert!(check_package_path(&upper).is_ok());
}

#[test]
fn rejects_a_file_that_is_not_a_zip() {
    let error = failure(b"definitely not a zip".to_vec());

    assert_eq!(error.code, NovelErrorCode::PackageOpen);
}

#[test]
fn rejects_malformed_manifests() {
    let chapter: &[(&str, &[u8])] = &[("chapters/001.txt", b"a")];
    let cases = [
        "{not json",
        "{\"formatVersion\":1}",
        "{\"formatVersion\":2,\"title\":\"t\",\"lang\":\"en\",\"chapters\":[]}",
        "{\"formatVersion\":1,\"title\":\"  \",\"lang\":\"en\",\"chapters\":[]}",
        "{\"formatVersion\":1,\"title\":\"t\",\"lang\":\"fr\",\"chapters\":[]}",
        "{\"formatVersion\":1,\"title\":\"t\",\"lang\":\"en\",\"chapters\":[]}",
    ];
    for manifest in cases {
        let error = failure(with_manifest(manifest, chapter));
        assert_eq!(error.code, NovelErrorCode::PackageManifest, "{manifest}");
    }
}

#[test]
fn rejects_missing_chapter_files_and_bad_chapter_names() {
    let missing = with_manifest(
        &manifest_json(&["chapters/001.txt", "chapters/002.txt"]),
        &[("chapters/001.txt", b"a")],
    );
    assert_eq!(failure(missing).code, NovelErrorCode::PackageChapters);

    let outside = with_manifest(
        &manifest_json(&["other/001.txt"]),
        &[("other/001.txt", b"a")],
    );
    assert_eq!(failure(outside).code, NovelErrorCode::PackageChapters);

    let wrong_type = with_manifest(
        &manifest_json(&["chapters/001.pdf"]),
        &[("chapters/001.pdf", b"a")],
    );
    assert_eq!(failure(wrong_type).code, NovelErrorCode::PackageChapters);
}

#[test]
fn accepts_markdown_chapters() {
    let bytes = with_manifest(
        &manifest_json(&["chapters/001.md"]),
        &[("chapters/001.md", b"# Title\nBody")],
    );

    let (_, package) = inspect(bytes).unwrap();

    assert_eq!(package.chapters[0].word_count, 2);
}

#[test]
fn rejects_empty_lists_empty_titles_and_bad_utf8() {
    let none = with_manifest(&manifest_json(&[]), &[]);
    assert_eq!(failure(none).code, NovelErrorCode::PackageManifest);

    let untitled = with_manifest(
        "{\"formatVersion\":1,\"title\":\"t\",\"lang\":\"en\",\"chapters\":[{\"file\":\"chapters/1.txt\",\"title\":\" \"}]}",
        &[("chapters/1.txt", b"a")],
    );
    assert_eq!(failure(untitled).code, NovelErrorCode::PackageChapters);

    let broken = with_manifest(
        &manifest_json(&["chapters/1.txt"]),
        &[("chapters/1.txt", &[0xFF, 0xFE])],
    );
    assert_eq!(failure(broken).code, NovelErrorCode::PackageChapters);
}

#[test]
fn enforces_the_chapter_count_limit() {
    let names: Vec<String> = (0..=MAX_CHAPTERS)
        .map(|index| format!("chapters/{index}.txt"))
        .collect();
    let files: Vec<&str> = names.iter().map(String::as_str).collect();
    let bytes = with_manifest(&manifest_json(&files), &[]);

    let error = failure(bytes);

    assert_eq!(error.code, NovelErrorCode::PackageLimit);
}

#[test]
fn rejects_oversize_chapter_entries() {
    let big = vec![b'a'; MAX_ENTRY_BYTES as usize + 1];
    let bytes = with_manifest(
        &manifest_json(&["chapters/1.txt"]),
        &[("chapters/1.txt", &big)],
    );

    let error = failure(bytes);

    assert_eq!(error.code, NovelErrorCode::PackageLimit);
}

#[test]
fn rejects_packages_over_the_total_limit() {
    assert!(check_total_size(MAX_TOTAL_BYTES).is_ok());
    let error = check_total_size(MAX_TOTAL_BYTES + 1).unwrap_err();

    assert_eq!(error.code, NovelErrorCode::PackageLimit);
}

#[test]
fn rejects_path_traversal_and_absolute_entry_names() {
    for name in [
        "../evil.txt",
        "chapters/../../evil.txt",
        "/abs.txt",
        "\\abs.txt",
        "C:/abs.txt",
        "a\\..\\b.txt",
    ] {
        let bytes = zip_bytes(&[("manifest.json", b"{}"), (name, b"x")]);
        let error = failure(bytes);
        assert_eq!(error.code, NovelErrorCode::PackageOpen, "{name}");
    }
}

#[test]
fn missing_or_unsupported_covers_only_warn() {
    let recorder = Recorder::default();
    let manifest = manifest_json(&["chapters/1.txt"]).replace("cover.jpg", "cover.gif");
    let bytes = with_manifest(
        &manifest,
        &[("chapters/1.txt", b"a"), ("cover.gif", b"GIF89a")],
    );

    let (_, package) = inspect_reader(Cursor::new(bytes), &&recorder).unwrap();

    assert!(package.cover.is_none());
    assert!(!package.summary().has_cover);
    let events = recorder.events.lock().unwrap();
    assert_eq!(events.last().unwrap().status, InspectStatus::Warn);

    let absent = with_manifest(
        &manifest_json(&["chapters/1.txt"]),
        &[("chapters/1.txt", b"a")],
    );
    let (_, package) = inspect(absent).unwrap();
    assert!(package.cover.is_none());

    let fake = with_manifest(
        &manifest_json(&["chapters/1.txt"]),
        &[("chapters/1.txt", b"a"), ("cover.jpg", b"not an image")],
    );
    let (_, package) = inspect(fake).unwrap();
    assert!(package.cover.is_none());
}

#[test]
fn oversize_cover_only_warns() {
    let mut big = JPEG_BYTES.to_vec();
    big.resize(COVER_MAX_BYTES + 1, 0);
    let bytes = with_manifest(
        &manifest_json(&["chapters/1.txt"]),
        &[("chapters/1.txt", b"a"), ("cover.jpg", &big)],
    );

    let (_, package) = inspect(bytes).unwrap();

    assert!(package.cover.is_none());
}

#[test]
fn maps_languages_to_the_supported_codes() {
    for (raw, expected) in [
        ("zh", "ZH"),
        ("ZH-Hant", "ZH"),
        ("en_US", "EN"),
        (" vi ", "VI"),
        ("ja", "JA"),
        ("KO", "KO"),
    ] {
        assert_eq!(map_lang(raw).unwrap(), expected, "{raw}");
    }
    assert!(map_lang("fr").is_err());
    assert!(map_lang("").is_err());
}

#[test]
fn appends_the_package_extension_only_when_missing() {
    assert_eq!(
        package_destination(Path::new("out/Book v1.2")),
        PathBuf::from("out/Book v1.2.dsnovel")
    );
    assert_eq!(
        package_destination(Path::new("out/Book.DSNOVEL")),
        PathBuf::from("out/Book.DSNOVEL")
    );
    assert_eq!(
        package_destination(Path::new("out/Book.zip")),
        PathBuf::from("out/Book.zip")
    );
}

#[test]
fn numbers_chapter_files_with_a_stable_width() {
    assert_eq!(
        chapter_names(2),
        vec!["chapters/001.txt", "chapters/002.txt"]
    );
    let many = chapter_names(10_000);
    assert_eq!(many[0], "chapters/00001.txt");
    assert_eq!(many[9_999], "chapters/10000.txt");
}
