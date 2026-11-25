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
use crate::features::novel::service::paragraphs_text;
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
    name: String,
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
    pub name: String,
    pub author: String,
    pub lang: String,
    pub chapters: Vec<PackageChapter>,
    pub cover: Option<PackageCover>,
}

impl ValidatedPackage {
    pub fn summary(&self) -> PackageSummary {
        PackageSummary {
            title: self.title.clone(),
            name: self.name.clone(),
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
        name: manifest.name.trim().to_string(),
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
    name: String,
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
        let paragraphs = files.read_chapter(novel.id, &chapter.id)?;
        add_entry(
            &mut writer,
            options,
            name,
            paragraphs_text(&paragraphs).as_bytes(),
        )?;
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
        name: novel.name.clone(),
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
