use crate::features::novel::files::COVER_MAX_BYTES;
use crate::features::novel::files::CoverKind;
use crate::features::novel::files::NovelFiles;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::InspectEvent;
use crate::features::novel::models::InspectSink;
use crate::features::novel::models::InspectStatus;
use crate::features::novel::models::InspectStep;
use crate::features::novel::models::NovelError;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::models::NovelResult;
use crate::features::novel::models::PackageSummary;
use crate::features::novel::repository::NovelRow;
use crate::features::novel::service::normalize_chapter_text;
use crate::features::novel::service::word_count;
use serde::Deserialize;
use serde::Serialize;
use std::ffi::OsString;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::io::Seek;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use zip::CompressionMethod;
use zip::ZipArchive;
use zip::ZipWriter;
use zip::write::SimpleFileOptions;

pub const MAX_CHAPTERS: usize = 10_000;
pub const MAX_ENTRY_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 256 * 1024 * 1024;
pub const FORMAT_VERSION: u32 = 1;
pub const MANIFEST_ENTRY: &str = "manifest.json";
pub const CHAPTERS_PREFIX: &str = "chapters/";
pub const PACKAGE_EXTENSIONS: [&str; 2] = ["dsnovel", "zip"];
pub const EXPORT_EXTENSION: &str = "dsnovel";

const MIN_NUMBER_WIDTH: usize = 3;
const PART_SUFFIX: &str = ".part";
const CHAPTER_EXTENSIONS: [&str; 2] = ["txt", "md"];
const PACKAGE_LANGS: [(&str, &str); 5] = [
    ("en", "EN"),
    ("vi", "VI"),
    ("zh", "ZH"),
    ("ja", "JA"),
    ("ko", "KO"),
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format_version: u32,
    title: String,
    #[serde(default)]
    author: String,
    lang: String,
    #[serde(default)]
    cover: Option<String>,
    chapters: Vec<ManifestChapter>,
}

#[derive(Debug, Clone, Deserialize)]
struct ManifestChapter {
    file: String,
    title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackageChapter {
    pub file: String,
    pub title: String,
    pub word_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackageCover {
    pub entry: String,
    pub kind: CoverKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedPackage {
    pub title: String,
    pub author: String,
    pub lang: String,
    pub chapters: Vec<PackageChapter>,
    pub cover: Option<PackageCover>,
}

impl ValidatedPackage {
    pub fn summary(&self) -> PackageSummary {
        PackageSummary {
            title: self.title.clone(),
            author: self.author.clone(),
            lang: self.lang.clone(),
            chapter_count: self.chapters.len(),
            word_count: self.chapters.iter().map(|chapter| chapter.word_count).sum(),
            has_cover: self.cover.is_some(),
            cover: None,
        }
    }
}

struct Outcome<T> {
    value: T,
    status: InspectStatus,
    detail: Option<String>,
}

impl<T> Outcome<T> {
    fn ok(value: T, detail: Option<String>) -> Self {
        Self {
            value,
            status: InspectStatus::Ok,
            detail,
        }
    }

    fn warn(value: T, detail: String) -> Self {
        Self {
            value,
            status: InspectStatus::Warn,
            detail: Some(detail),
        }
    }
}

pub struct PackageReader<R: Read + Seek> {
    archive: ZipArchive<R>,
}

impl<R: Read + Seek> PackageReader<R> {
    pub fn read_chapter_text(&mut self, file: &str) -> NovelResult<String> {
        let bytes = read_entry(&mut self.archive, file, MAX_ENTRY_BYTES)?;
        decode_chapter(file, bytes)
    }

    pub fn read_cover(&mut self, cover: &PackageCover) -> NovelResult<Vec<u8>> {
        let bytes = read_entry(&mut self.archive, &cover.entry, COVER_MAX_BYTES as u64)?;
        if !cover.kind.matches(&bytes) {
            return Err(NovelError::new(
                NovelErrorCode::CoverInvalid,
                format!("cover {} does not match its image type", cover.entry),
            ));
        }
        Ok(bytes)
    }
}

pub fn check_package_path(path: &Path) -> NovelResult<()> {
    let metadata = std::fs::metadata(path).map_err(|error| {
        NovelError::new(
            NovelErrorCode::PackageFormat,
            format!("cannot read {}: {error}", path.display()),
        )
    })?;
    if !metadata.is_file() {
        return Err(NovelError::new(
            NovelErrorCode::PackageFormat,
            format!("{} is not a file", path.display()),
        ));
    }
    if !has_package_extension(path) {
        return Err(NovelError::new(
            NovelErrorCode::PackageFormat,
            "package must be a .dsnovel or .zip file",
        ));
    }
    Ok(())
}

fn has_package_extension(path: &Path) -> bool {
    let extension = match path.extension().and_then(|value| value.to_str()) {
        Some(value) => value.to_ascii_lowercase(),
        None => return false,
    };
    PACKAGE_EXTENSIONS.contains(&extension.as_str())
}

pub fn inspect_path(
    path: &Path,
    sink: &dyn InspectSink,
) -> NovelResult<(PackageReader<File>, ValidatedPackage)> {
    begin(sink, InspectStep::Format);
    let checked = check_package_path(path).map(|()| Outcome::ok((), None));
    settle(sink, InspectStep::Format, checked)?;
    begin(sink, InspectStep::Open);
    let opened = open_file(path);
    let file = settle_open(sink, opened)?;
    inspect_reader(file, sink)
}

fn open_file(path: &Path) -> NovelResult<File> {
    File::open(path).map_err(|error| {
        NovelError::new(
            NovelErrorCode::PackageOpen,
            format!("cannot open {}: {error}", path.display()),
        )
    })
}

fn settle_open(sink: &dyn InspectSink, opened: NovelResult<File>) -> NovelResult<File> {
    match opened {
        Ok(file) => Ok(file),
        Err(error) => {
            report_failure(sink, InspectStep::Open, &error);
            Err(error)
        }
    }
}

pub fn inspect_reader<R: Read + Seek>(
    source: R,
    sink: &dyn InspectSink,
) -> NovelResult<(PackageReader<R>, ValidatedPackage)> {
    let mut archive = match open_archive(source) {
        Ok(archive) => archive,
        Err(error) => {
            report_failure(sink, InspectStep::Open, &error);
            return Err(error);
        }
    };
    let entries = archive_entries(&mut archive);
    settle(sink, InspectStep::Open, entries)?;

    begin(sink, InspectStep::Manifest);
    let parsed = read_manifest(&mut archive);
    let manifest = settle(sink, InspectStep::Manifest, parsed)?;

    begin(sink, InspectStep::Chapters);
    let present = check_chapter_files(&mut archive, &manifest);
    settle(sink, InspectStep::Chapters, present)?;

    begin(sink, InspectStep::List);
    let listed = read_chapter_list(&mut archive, &manifest);
    let chapters = settle(sink, InspectStep::List, listed)?;

    begin(sink, InspectStep::Cover);
    let found = find_cover(&mut archive, &manifest);
    let cover = settle(sink, InspectStep::Cover, found)?;

    let package = ValidatedPackage {
        title: manifest.title.trim().to_string(),
        author: manifest.author.trim().to_string(),
        lang: map_lang(&manifest.lang)?,
        chapters,
        cover,
    };
    Ok((PackageReader { archive }, package))
}

fn begin(sink: &dyn InspectSink, step: InspectStep) {
    sink.emit(InspectEvent::new(step, InspectStatus::Running, None));
}

fn report_failure(sink: &dyn InspectSink, step: InspectStep, error: &NovelError) {
    sink.emit(InspectEvent::new(
        step,
        InspectStatus::Fail,
        Some(error.detail.clone()),
    ));
}

fn settle<T>(
    sink: &dyn InspectSink,
    step: InspectStep,
    result: NovelResult<Outcome<T>>,
) -> NovelResult<T> {
    match result {
        Ok(outcome) => {
            sink.emit(InspectEvent::new(step, outcome.status, outcome.detail));
            Ok(outcome.value)
        }
        Err(error) => {
            report_failure(sink, step, &error);
            Err(error)
        }
    }
}

fn open_archive<R: Read + Seek>(source: R) -> NovelResult<ZipArchive<R>> {
    ZipArchive::new(source).map_err(|error| {
        NovelError::new(
            NovelErrorCode::PackageOpen,
            format!("not a readable zip archive: {error}"),
        )
    })
}

fn archive_entries<R: Read + Seek>(archive: &mut ZipArchive<R>) -> NovelResult<Outcome<()>> {
    let mut total: u64 = 0;
    for index in 0..archive.len() {
        let file = archive.by_index_raw(index).map_err(open_failure)?;
        let name = file.name().map_err(open_failure)?;
        if is_unsafe_name(&name) {
            return Err(NovelError::new(
                NovelErrorCode::PackageOpen,
                format!("unsafe entry name '{name}'"),
            ));
        }
        total = total.saturating_add(file.size());
    }
    check_total_size(total)?;
    Ok(Outcome::ok((), Some(format!("{} entries", archive.len()))))
}

fn check_total_size(total: u64) -> NovelResult<()> {
    if total > MAX_TOTAL_BYTES {
        return Err(NovelError::new(
            NovelErrorCode::PackageLimit,
            format!(
                "package expands to more than {} MiB",
                MAX_TOTAL_BYTES / (1024 * 1024)
            ),
        ));
    }
    Ok(())
}

fn open_failure(error: zip::result::ZipError) -> NovelError {
    NovelError::new(NovelErrorCode::PackageOpen, error.to_string())
}

fn is_unsafe_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with('/') || name.starts_with('\\') {
        return true;
    }
    if name.as_bytes().get(1) == Some(&b':') {
        return true;
    }
    name.split(['/', '\\']).any(is_parent_component)
}

fn is_parent_component(part: &str) -> bool {
    part == ".."
}

fn read_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
    limit: u64,
) -> NovelResult<Vec<u8>> {
    let file = match archive.by_name(name) {
        Ok(file) => file,
        Err(error) => {
            return Err(NovelError::new(
                NovelErrorCode::PackageChapters,
                format!("cannot read {name}: {error}"),
            ));
        }
    };
    if file.size() > limit {
        return Err(entry_too_large(name, limit));
    }
    let mut bytes = Vec::new();
    let read = file.take(limit + 1).read_to_end(&mut bytes);
    if let Err(error) = read {
        return Err(NovelError::new(
            NovelErrorCode::PackageChapters,
            format!("cannot read {name}: {error}"),
        ));
    }
    if bytes.len() as u64 > limit {
        return Err(entry_too_large(name, limit));
    }
    Ok(bytes)
}

fn entry_too_large(name: &str, limit: u64) -> NovelError {
    NovelError::new(
        NovelErrorCode::PackageLimit,
        format!("{name} is larger than {} MiB", limit / (1024 * 1024)),
    )
}

fn decode_chapter(file: &str, bytes: Vec<u8>) -> NovelResult<String> {
    match String::from_utf8(bytes) {
        Ok(text) => Ok(normalize_chapter_text(&text)),
        Err(_) => Err(NovelError::new(
            NovelErrorCode::PackageChapters,
            format!("{file} is not valid UTF-8"),
        )),
    }
}

fn manifest_error(detail: impl Into<String>) -> NovelError {
    NovelError::new(NovelErrorCode::PackageManifest, detail)
}

fn read_manifest<R: Read + Seek>(archive: &mut ZipArchive<R>) -> NovelResult<Outcome<Manifest>> {
    if archive.index_for_name(MANIFEST_ENTRY).is_none() {
        return Err(manifest_error(format!("{MANIFEST_ENTRY} is missing")));
    }
    let bytes = read_entry(archive, MANIFEST_ENTRY, MAX_ENTRY_BYTES)?;
    let manifest: Manifest = serde_json::from_slice(&bytes)
        .map_err(|error| manifest_error(format!("{MANIFEST_ENTRY} is invalid: {error}")))?;
    if manifest.format_version != FORMAT_VERSION {
        return Err(manifest_error(format!(
            "unsupported formatVersion {}",
            manifest.format_version
        )));
    }
    if manifest.title.trim().is_empty() {
        return Err(manifest_error("manifest title is empty"));
    }
    map_lang(&manifest.lang)?;
    check_chapter_count(manifest.chapters.len())?;
    Ok(Outcome::ok(manifest, None))
}

fn check_chapter_count(count: usize) -> NovelResult<()> {
    if count == 0 {
        return Err(manifest_error("manifest lists no chapters"));
    }
    if count > MAX_CHAPTERS {
        return Err(NovelError::new(
            NovelErrorCode::PackageLimit,
            format!("package has {count} chapters, the limit is {MAX_CHAPTERS}"),
        ));
    }
    Ok(())
}

pub fn map_lang(raw: &str) -> NovelResult<String> {
    let lowered = raw.trim().to_lowercase();
    let primary = lowered.split(['-', '_']).next().unwrap_or_default();
    for (code, mapped) in PACKAGE_LANGS {
        if primary == code {
            return Ok(mapped.to_string());
        }
    }
    Err(manifest_error(format!("unsupported lang '{raw}'")))
}

fn check_chapter_files<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &Manifest,
) -> NovelResult<Outcome<()>> {
    for chapter in &manifest.chapters {
        check_chapter_file(archive, &chapter.file)?;
    }
    let count = manifest.chapters.len();
    Ok(Outcome::ok((), Some(format!("{count} files"))))
}

fn chapters_error(detail: impl Into<String>) -> NovelError {
    NovelError::new(NovelErrorCode::PackageChapters, detail)
}

fn check_chapter_file<R: Read + Seek>(archive: &mut ZipArchive<R>, file: &str) -> NovelResult<()> {
    if is_unsafe_name(file) || !file.starts_with(CHAPTERS_PREFIX) || !has_chapter_extension(file) {
        return Err(chapters_error(format!(
            "chapter file '{file}' must be a .txt or .md file under {CHAPTERS_PREFIX}"
        )));
    }
    let size = match archive.by_name(file) {
        Ok(entry) => entry.size(),
        Err(_) => return Err(chapters_error(format!("chapter file '{file}' is missing"))),
    };
    if size > MAX_ENTRY_BYTES {
        return Err(entry_too_large(file, MAX_ENTRY_BYTES));
    }
    Ok(())
}

fn has_chapter_extension(file: &str) -> bool {
    match file.rsplit_once('.') {
        Some((_, extension)) => {
            CHAPTER_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        }
        None => false,
    }
}

fn read_chapter_list<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &Manifest,
) -> NovelResult<Outcome<Vec<PackageChapter>>> {
    let count = manifest.chapters.len();
    let mut chapters = Vec::with_capacity(count);
    let mut words: i64 = 0;
    for (index, entry) in manifest.chapters.iter().enumerate() {
        let chapter = read_chapter_info(archive, entry, index + 1)?;
        words += chapter.word_count;
        chapters.push(chapter);
    }
    Ok(Outcome::ok(
        chapters,
        Some(format!("{count} chapters, {words} words")),
    ))
}

fn read_chapter_info<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    entry: &ManifestChapter,
    number: usize,
) -> NovelResult<PackageChapter> {
    let title = entry.title.trim();
    if title.is_empty() {
        return Err(chapters_error(format!(
            "chapter {number} has an empty title"
        )));
    }
    let bytes = read_entry(archive, &entry.file, MAX_ENTRY_BYTES)?;
    let text = decode_chapter(&entry.file, bytes)?;
    Ok(PackageChapter {
        file: entry.file.clone(),
        title: title.to_string(),
        word_count: word_count(&text),
    })
}

fn find_cover<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &Manifest,
) -> NovelResult<Outcome<Option<PackageCover>>> {
    let Some(name) = manifest.cover.as_deref().map(str::trim) else {
        return Ok(Outcome::warn(None, "manifest names no cover".to_string()));
    };
    Ok(match inspect_cover(archive, name) {
        Ok(cover) => Outcome::ok(Some(cover), Some(name.to_string())),
        Err(reason) => Outcome::warn(None, reason),
    })
}

fn inspect_cover<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
) -> Result<PackageCover, String> {
    if is_unsafe_name(name) {
        return Err(format!("cover '{name}' has an unsafe name"));
    }
    let Some(kind) = CoverKind::from_extension(name) else {
        return Err(format!("cover '{name}' is not a JPEG or PNG image"));
    };
    let bytes = match read_entry(archive, name, COVER_MAX_BYTES as u64) {
        Ok(bytes) => bytes,
        Err(error) if error.code == NovelErrorCode::PackageLimit => return Err(error.detail),
        Err(_) => return Err(format!("cover '{name}' was not found")),
    };
    if !kind.matches(&bytes) {
        return Err(format!("cover '{name}' content is not a {}", kind.mime()));
    }
    Ok(PackageCover {
        entry: name.to_string(),
        kind,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    format_version: u32,
    title: String,
    author: String,
    lang: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cover: Option<String>,
    chapters: Vec<ExportChapter>,
}

#[derive(Debug, Serialize)]
struct ExportChapter {
    file: String,
    title: String,
}

pub fn package_destination(path: &Path) -> PathBuf {
    if has_package_extension(path) {
        return path.to_path_buf();
    }
    let mut name = OsString::from(path.as_os_str());
    name.push(format!(".{EXPORT_EXTENSION}"));
    PathBuf::from(name)
}

pub fn write_package(
    files: &NovelFiles,
    novel: &NovelRow,
    chapters: &[ChapterRow],
    dest: &Path,
) -> NovelResult<()> {
    let part = part_path(dest);
    let written = write_entries(files, novel, chapters, &part);
    if written.is_err() {
        let _ = fs::remove_file(&part);
        return written;
    }
    let renamed = fs::rename(&part, dest).map_err(NovelError::from);
    if renamed.is_err() {
        let _ = fs::remove_file(&part);
    }
    renamed
}

fn part_path(dest: &Path) -> PathBuf {
    let mut name = OsString::from(dest.as_os_str());
    name.push(PART_SUFFIX);
    PathBuf::from(name)
}

fn write_entries(
    files: &NovelFiles,
    novel: &NovelRow,
    chapters: &[ChapterRow],
    path: &Path,
) -> NovelResult<()> {
    let cover = files.read_cover(novel.id)?;
    let names = chapter_names(chapters.len());
    let manifest = build_manifest(novel, chapters, &names, cover.as_ref().map(|c| c.0));
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(manifest_failure)?;
    let mut writer = ZipWriter::new(File::create(path)?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    add_entry(&mut writer, options, MANIFEST_ENTRY, &manifest_bytes)?;
    if let Some((kind, bytes)) = &cover {
        add_entry(&mut writer, options, &cover_entry(*kind), bytes)?;
    }
    for (chapter, name) in chapters.iter().zip(&names) {
        let text = files.read_chapter(novel.id, &chapter.id)?;
        add_entry(&mut writer, options, name, text.as_bytes())?;
    }
    writer.finish().map_err(zip_failure)?;
    Ok(())
}

fn build_manifest(
    novel: &NovelRow,
    chapters: &[ChapterRow],
    names: &[String],
    cover: Option<CoverKind>,
) -> ExportManifest {
    let mut entries = Vec::with_capacity(chapters.len());
    for (chapter, name) in chapters.iter().zip(names) {
        entries.push(ExportChapter {
            file: name.clone(),
            title: chapter.title.clone(),
        });
    }
    ExportManifest {
        format_version: FORMAT_VERSION,
        title: novel.title.clone(),
        author: novel.author.clone(),
        lang: novel.lang.to_lowercase(),
        cover: cover.map(cover_entry),
        chapters: entries,
    }
}

fn chapter_names(count: usize) -> Vec<String> {
    let width = count.to_string().len().max(MIN_NUMBER_WIDTH);
    (1..=count)
        .map(|number| format!("{CHAPTERS_PREFIX}{number:0width$}.txt"))
        .collect()
}

fn cover_entry(kind: CoverKind) -> String {
    format!("cover.{}", kind.extension())
}

fn add_entry(
    writer: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    name: &str,
    bytes: &[u8],
) -> NovelResult<()> {
    writer.start_file(name, options).map_err(zip_failure)?;
    writer.write_all(bytes)?;
    Ok(())
}

fn zip_failure(error: zip::result::ZipError) -> NovelError {
    NovelError::new(NovelErrorCode::Io, format!("cannot write package: {error}"))
}

fn manifest_failure(error: serde_json::Error) -> NovelError {
    NovelError::new(
        NovelErrorCode::Io,
        format!("cannot write manifest: {error}"),
    )
}

#[cfg(test)]
pub mod fixtures {
    use std::io::Cursor;
    use std::io::Write;
    use zip::CompressionMethod;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    pub const JPEG_BYTES: [u8; 8] = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46];

    pub fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, bytes) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    pub fn manifest_json(files: &[&str]) -> String {
        let mut chapters = Vec::new();
        for (index, file) in files.iter().enumerate() {
            chapters.push(format!(
                "{{\"file\":\"{file}\",\"title\":\"Chapter {}\"}}",
                index + 1
            ));
        }
        format!(
            "{{\"formatVersion\":1,\"title\":\"Sample\",\"author\":\"Someone\",\"lang\":\"zh\",\
             \"cover\":\"cover.jpg\",\"chapters\":[{}]}}",
            chapters.join(",")
        )
    }

    pub fn sample_package(chapter_count: usize) -> Vec<u8> {
        let names: Vec<String> = (1..=chapter_count)
            .map(|index| format!("chapters/{index:03}.txt"))
            .collect();
        let files: Vec<&str> = names.iter().map(String::as_str).collect();
        let manifest = manifest_json(&files);
        let text = "\u{534E}\u{706F}\u{521D}\u{4E0A}\r\n\r\nSecond line here\n \n\u{7B2C}\u{4E09}\u{6BB5}\r\n";
        let mut entries: Vec<(&str, &[u8])> = vec![
            ("manifest.json", manifest.as_bytes()),
            ("cover.jpg", &JPEG_BYTES),
        ];
        for name in &names {
            entries.push((name.as_str(), text.as_bytes()));
        }
        zip_bytes(&entries)
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::JPEG_BYTES;
    use super::fixtures::manifest_json;
    use super::fixtures::sample_package;
    use super::fixtures::zip_bytes;
    use super::*;
    use crate::features::novel::models::NullSink;
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
        assert_eq!(summary.word_count, 3 * (4 + 3 + 3 + 0 + 0));
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
}
