use crate::features::novel::files::COVER_MAX_BYTES;
use crate::features::novel::files::CoverKind;
use crate::features::novel::files::NovelFiles;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::ExportSummary;
use crate::features::novel::models::NovelError;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::models::NovelInput;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelResult;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::NullSink;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::package::PackageReader;
use crate::features::novel::package::ValidatedPackage;
use crate::features::novel::package::inspect_path;
use crate::features::novel::package::package_destination;
use crate::features::novel::package::write_package;
use crate::features::novel::repository::NewChapter;
use crate::features::novel::repository::NewNovel;
use crate::features::novel::repository::NovelRepository;
use crate::features::novel::repository::NovelRow;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
pub use crate::shared::tags::MAX_TAGS;
use crate::shared::tags::normalize_tags as normalize_shared_tags;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::Utc;
use rusqlite::TransactionBehavior;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use uuid::Uuid;

pub const LANGS: [&str; 5] = ["EN", "VI", "ZH", "JA", "KO"];

const ORIGIN_CREATED: &str = "created";
const ORIGIN_IMPORTED: &str = "imported";
const BASE64_RATIO_NUM: usize = 4;
const BASE64_RATIO_DEN: usize = 3;

pub fn normalize_tags(raw: &[String]) -> NovelResult<Vec<String>> {
    normalize_shared_tags(raw).map_err(|_| {
        NovelError::new(
            NovelErrorCode::TagLimit,
            format!("a novel can have at most {MAX_TAGS} tags"),
        )
    })
}

pub fn normalize_lang(raw: &str) -> NovelResult<String> {
    let upper = raw.trim().to_uppercase();
    if LANGS.contains(&upper.as_str()) {
        Ok(upper)
    } else {
        Err(NovelError::invalid(format!("unsupported language '{raw}'")))
    }
}

pub fn is_cjk(character: char) -> bool {
    matches!(
        character,
        '\u{3040}'..='\u{30FF}'
            | '\u{31F0}'..='\u{31FF}'
            | '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2FA1F}'
            | '\u{30000}'..='\u{3134F}'
    )
}

pub fn word_count(text: &str) -> i64 {
    let mut words = 0;
    let mut in_token = false;
    for character in text.chars() {
        if is_cjk(character) {
            words += 1;
            in_token = false;
        } else if character.is_whitespace() {
            in_token = false;
        } else if character.is_alphanumeric() && !in_token {
            words += 1;
            in_token = true;
        }
    }
    words
}

pub fn split_paragraphs(text: &str) -> Vec<String> {
    let unified = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    unified
        .split(['\n', '\r'])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn join_paragraphs(paragraphs: &[String]) -> String {
    if paragraphs.is_empty() {
        return String::new();
    }
    let mut text = paragraphs.join("\n");
    text.push('\n');
    text
}

pub fn normalize_chapter_text(text: &str) -> String {
    join_paragraphs(&split_paragraphs(text))
}

pub fn normalize_paragraph(text: &str) -> NovelResult<String> {
    let single_line = split_paragraphs(text).join(" ");
    if single_line.is_empty() {
        return Err(NovelError::invalid("paragraph text must not be empty"));
    }
    Ok(single_line)
}

pub fn paragraph_rows(text: &str) -> Vec<ParagraphRow> {
    let paragraphs = split_paragraphs(text);
    let mut rows = Vec::with_capacity(paragraphs.len());
    for (index, paragraph) in paragraphs.into_iter().enumerate() {
        rows.push(ParagraphRow {
            n: index + 1,
            text: paragraph,
        });
    }
    rows
}

pub fn replace_paragraph(text: &str, n: usize, replacement: &str) -> NovelResult<String> {
    let replacement = normalize_paragraph(replacement)?;
    let mut paragraphs = split_paragraphs(text);
    if n == 0 || n > paragraphs.len() {
        return Err(NovelError::new(
            NovelErrorCode::ParagraphOutOfRange,
            format!(
                "paragraph {n} does not exist, the chapter has {}",
                paragraphs.len()
            ),
        ));
    }
    paragraphs[n - 1] = replacement;
    Ok(join_paragraphs(&paragraphs))
}

pub fn new_chapter_id() -> String {
    Uuid::new_v4().simple().to_string()
}

pub fn cover_data_url(kind: CoverKind, bytes: &[u8]) -> String {
    format!("data:{};base64,{}", kind.mime(), STANDARD.encode(bytes))
}

pub fn parse_cover_data_url(data_url: &str) -> NovelResult<(CoverKind, Vec<u8>)> {
    let invalid = || {
        NovelError::new(
            NovelErrorCode::CoverInvalid,
            "cover must be a base64 data URL",
        )
    };
    let rest = data_url.strip_prefix("data:").ok_or_else(invalid)?;
    let (mime, payload) = rest.split_once(";base64,").ok_or_else(invalid)?;
    let kind = CoverKind::from_mime(mime).ok_or_else(|| {
        NovelError::new(
            NovelErrorCode::CoverInvalid,
            "cover must be a JPEG or PNG image",
        )
    })?;
    if payload.len() > max_encoded_len() {
        return Err(cover_too_large());
    }
    let bytes = STANDARD.decode(payload).map_err(|_| invalid())?;
    check_cover_bytes(kind, &bytes)?;
    Ok((kind, bytes))
}

pub fn check_cover_bytes(kind: CoverKind, bytes: &[u8]) -> NovelResult<()> {
    if bytes.len() > COVER_MAX_BYTES {
        return Err(cover_too_large());
    }
    if !kind.matches(bytes) {
        return Err(NovelError::new(
            NovelErrorCode::CoverInvalid,
            "cover content does not match its image type",
        ));
    }
    Ok(())
}

fn max_encoded_len() -> usize {
    COVER_MAX_BYTES * BASE64_RATIO_NUM / BASE64_RATIO_DEN + BASE64_RATIO_NUM
}

fn cover_too_large() -> NovelError {
    NovelError::new(
        NovelErrorCode::CoverTooLarge,
        format!(
            "cover must be at most {} MiB",
            COVER_MAX_BYTES / (1024 * 1024)
        ),
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CleanInput {
    title: String,
    name: String,
    author: String,
    lang: String,
    description: String,
    tags: Vec<String>,
}

fn clean_input(input: NovelInput) -> NovelResult<CleanInput> {
    let title = require_title(&input.title)?;
    Ok(CleanInput {
        title,
        name: input.name.trim().to_string(),
        author: input.author.trim().to_string(),
        lang: normalize_lang(&input.lang)?,
        description: input.description.trim().to_string(),
        tags: normalize_tags(&input.tags)?,
    })
}

fn require_title(raw: &str) -> NovelResult<String> {
    let title = raw.trim();
    if title.is_empty() {
        return Err(NovelError::invalid("title must not be empty"));
    }
    Ok(title.to_string())
}

fn apply_patch(mut row: NovelRow, patch: &NovelPatch) -> NovelResult<NovelRow> {
    if let Some(title) = &patch.title {
        row.title = require_title(title)?;
    }
    if let Some(name) = &patch.name {
        row.name = name.trim().to_string();
    }
    if let Some(author) = &patch.author {
        row.author = author.trim().to_string();
    }
    if let Some(lang) = &patch.lang {
        row.lang = normalize_lang(lang)?;
    }
    if let Some(description) = &patch.description {
        row.description = description.trim().to_string();
    }
    Ok(row)
}

fn now_text() -> String {
    format_timestamp(Utc::now())
}

fn lock(mutex: &Mutex<()>) -> MutexGuard<'_, ()> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn require_novel(repo: &NovelRepository, id: i64) -> NovelResult<NovelRow> {
    match repo.find_novel(id)? {
        Some(row) => Ok(row),
        None => Err(NovelError::not_found(format!("novel {id} does not exist"))),
    }
}

fn require_chapter(
    repo: &NovelRepository,
    novel_id: i64,
    chapter_id: &str,
) -> NovelResult<ChapterRow> {
    match repo.find_chapter(novel_id, chapter_id)? {
        Some(row) => Ok(row),
        None => Err(NovelError::not_found(format!(
            "chapter {chapter_id} does not exist in novel {novel_id}"
        ))),
    }
}

fn require_summary(repo: &NovelRepository, id: i64) -> NovelResult<NovelSummary> {
    match repo.find_summary(id)? {
        Some(summary) => Ok(summary),
        None => Err(NovelError::not_found(format!("novel {id} does not exist"))),
    }
}

#[derive(Debug, Clone, Default)]
pub struct NovelService {
    gate: Arc<Mutex<()>>,
}

impl NovelService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&self, session: &WorkspaceSession) -> NovelResult<NovelWorkspace> {
        match session.current() {
            Some(current) => Ok(NovelWorkspace::with_gate(
                PathBuf::from(current.path),
                self.gate.clone(),
            )),
            None => Err(NovelError::new(
                NovelErrorCode::NoWorkspace,
                "no workspace is open",
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NovelWorkspace {
    dir: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl NovelWorkspace {
    #[cfg(test)]
    pub fn new(dir: PathBuf) -> Self {
        Self::with_gate(dir, Arc::new(Mutex::new(())))
    }

    pub fn with_gate(dir: PathBuf, gate: Arc<Mutex<()>>) -> Self {
        Self { dir, gate }
    }

    pub fn list(&self) -> NovelResult<Vec<NovelSummary>> {
        let db = self.database()?;
        Ok(NovelRepository::new(db.connection()).list_summaries()?)
    }

    pub fn create(&self, input: NovelInput) -> NovelResult<NovelSummary> {
        let input = clean_input(input)?;
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let id = insert_novel(&tx, &input, ORIGIN_CREATED, &now_text())?;
        let summary = require_summary(&NovelRepository::new(&tx), id)?;
        tx.commit()?;
        Ok(summary)
    }

    pub fn update(&self, id: i64, patch: NovelPatch) -> NovelResult<NovelSummary> {
        let tags = match &patch.tags {
            Some(raw) => Some(normalize_tags(raw)?),
            None => None,
        };
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let repo = NovelRepository::new(&tx);
        let row = apply_patch(require_novel(&repo, id)?, &patch)?;
        repo.update_novel(&row, &now_text())?;
        if let Some(tags) = &tags {
            repo.replace_tags(id, tags)?;
        }
        let summary = require_summary(&repo, id)?;
        tx.commit()?;
        Ok(summary)
    }

    pub fn delete(&self, ids: &[i64]) -> NovelResult<usize> {
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let removed = delete_rows(&NovelRepository::new(&tx), ids)?;
        tx.commit()?;
        let files = self.files();
        for id in &removed {
            let _ = files.remove_novel_dir(*id);
        }
        Ok(removed.len())
    }

    pub fn cover_get(&self, id: i64) -> NovelResult<Option<String>> {
        let db = self.database()?;
        require_novel(&NovelRepository::new(db.connection()), id)?;
        let cover = self.files().read_cover(id)?;
        Ok(cover.map(encode_cover))
    }

    pub fn cover_set(&self, id: i64, data_url: &str) -> NovelResult<NovelSummary> {
        let (kind, bytes) = parse_cover_data_url(data_url)?;
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_novel(&repo, id)?;
        self.files().write_cover(id, kind, &bytes)?;
        repo.touch_novel(id, &now_text())?;
        require_summary(&repo, id)
    }

    pub fn cover_clear(&self, id: i64) -> NovelResult<NovelSummary> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_novel(&repo, id)?;
        self.files().clear_cover(id)?;
        repo.touch_novel(id, &now_text())?;
        require_summary(&repo, id)
    }

    pub fn chapters(&self, novel_id: i64) -> NovelResult<Vec<ChapterRow>> {
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_novel(&repo, novel_id)?;
        Ok(repo.list_chapters(novel_id)?)
    }

    pub fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> NovelResult<Vec<ParagraphRow>> {
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_chapter(&repo, novel_id, chapter_id)?;
        let text = self.files().read_chapter(novel_id, chapter_id)?;
        Ok(paragraph_rows(&text))
    }

    pub fn paragraph_update(
        &self,
        novel_id: i64,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> NovelResult<ChapterRow> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_chapter(&repo, novel_id, chapter_id)?;
        let files = self.files();
        let current = files.read_chapter(novel_id, chapter_id)?;
        let updated = replace_paragraph(&current, n, text)?;
        files.write_chapter(novel_id, chapter_id, &updated)?;
        let now = now_text();
        repo.update_chapter_text(chapter_id, word_count(&updated), &now)?;
        repo.touch_novel(novel_id, &now)?;
        require_chapter(&repo, novel_id, chapter_id)
    }

    pub fn import_package(&self, path: &Path, meta: NovelInput) -> NovelResult<NovelSummary> {
        let input = clean_input(meta)?;
        let (mut reader, package) = inspect_path(path, &NullSink)?;
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let id = insert_novel(&tx, &input, ORIGIN_IMPORTED, &now_text())?;
        match self.write_package(&tx, &mut reader, &package, id) {
            Ok(()) => self.finish_import(tx, id),
            Err(error) => {
                drop(tx);
                let _ = self.files().remove_novel_dir(id);
                Err(error)
            }
        }
    }

    pub fn export_package(&self, id: i64, dest: &Path) -> NovelResult<ExportSummary> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        let novel = require_novel(&repo, id)?;
        let chapters = repo.list_chapters(id)?;
        if chapters.is_empty() {
            return Err(NovelError::invalid("the novel has no chapters to export"));
        }
        let dest = package_destination(dest);
        write_package(&self.files(), &novel, &chapters, &dest)?;
        Ok(ExportSummary {
            path: dest.to_string_lossy().into_owned(),
            chapter_count: chapters.len(),
        })
    }

    fn finish_import(&self, tx: rusqlite::Transaction, id: i64) -> NovelResult<NovelSummary> {
        let result = commit_import(tx, id);
        if result.is_err() {
            let _ = self.files().remove_novel_dir(id);
        }
        result
    }

    fn write_package<R: Read + std::io::Seek>(
        &self,
        tx: &rusqlite::Transaction,
        reader: &mut PackageReader<R>,
        package: &ValidatedPackage,
        novel_id: i64,
    ) -> NovelResult<()> {
        let files = self.files();
        files.reset_dir(novel_id)?;
        if let Some(cover) = &package.cover {
            let bytes = reader.read_cover(cover)?;
            files.write_cover(novel_id, cover.kind, &bytes)?;
        }
        let repo = NovelRepository::new(tx);
        let now = now_text();
        for (index, chapter) in package.chapters.iter().enumerate() {
            let id = new_chapter_id();
            let text = reader.read_chapter_text(&chapter.file)?;
            files.write_chapter(novel_id, &id, &text)?;
            repo.insert_chapter(&NewChapter {
                id: &id,
                novel_id,
                seq: index as i64 + 1,
                title: &chapter.title,
                word_count: chapter.word_count,
                now: &now,
            })?;
        }
        Ok(())
    }

    fn database(&self) -> NovelResult<Database> {
        Ok(Database::open_read_write(
            &self.dir.join(WORKSPACE_DB_FILE),
        )?)
    }

    fn files(&self) -> NovelFiles {
        NovelFiles::new(self.dir.clone())
    }
}

fn commit_import(tx: rusqlite::Transaction, id: i64) -> NovelResult<NovelSummary> {
    let summary = require_summary(&NovelRepository::new(&tx), id)?;
    tx.commit()?;
    Ok(summary)
}

fn encode_cover(cover: (CoverKind, Vec<u8>)) -> String {
    cover_data_url(cover.0, &cover.1)
}

fn insert_novel(
    conn: &rusqlite::Connection,
    input: &CleanInput,
    origin: &str,
    now: &str,
) -> NovelResult<i64> {
    let repo = NovelRepository::new(conn);
    let id = repo.insert_novel(&NewNovel {
        title: &input.title,
        name: &input.name,
        author: &input.author,
        lang: &input.lang,
        description: &input.description,
        origin,
        now,
    })?;
    repo.replace_tags(id, &input.tags)?;
    Ok(id)
}

fn delete_rows(repo: &NovelRepository, ids: &[i64]) -> NovelResult<Vec<i64>> {
    let mut removed: Vec<i64> = Vec::new();
    for id in ids {
        if !removed.contains(id) && repo.delete_novel(*id)? {
            removed.push(*id);
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::novel::package::fixtures::manifest_json;
    use crate::features::novel::package::fixtures::sample_package;
    use crate::features::novel::package::fixtures::zip_bytes;
    use crate::infra::storage::migrator::Migrator;
    use crate::infra::storage::migrator::workspace_scripts;
    use crate::shared::tags::normalize_tag;
    use std::fs;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    const JPEG: [u8; 6] = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    const PNG: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    struct Fixture {
        dir: TempDir,
        workspace: NovelWorkspace,
    }

    fn fixture() -> Fixture {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join(WORKSPACE_DB_FILE);
        let mut db = Database::create(&db_path).unwrap();
        let cancel = AtomicBool::new(false);
        Migrator::migrate(db.connection_mut(), &workspace_scripts().unwrap(), &cancel).unwrap();
        drop(db);
        let workspace = NovelWorkspace::new(dir.path().to_path_buf());
        Fixture { dir, workspace }
    }

    fn input(title: &str) -> NovelInput {
        NovelInput {
            title: title.to_string(),
            name: String::new(),
            author: "Author".to_string(),
            lang: "zh".to_string(),
            description: String::new(),
            tags: Vec::new(),
        }
    }

    fn tags(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    fn write_package_file(fixture: &Fixture, name: &str, bytes: &[u8]) -> PathBuf {
        let path = fixture.dir.path().join(name);
        fs::write(&path, bytes).unwrap();
        path
    }

    fn imported(fixture: &Fixture, chapters: usize) -> NovelSummary {
        let path = write_package_file(fixture, "book.dsnovel", &sample_package(chapters));
        fixture
            .workspace
            .import_package(&path, input("Imported"))
            .unwrap()
    }

    fn data_url(mime: &str, bytes: &[u8]) -> String {
        format!("data:{mime};base64,{}", STANDARD.encode(bytes))
    }

    #[test]
    fn normalizes_tags_like_the_prototype() {
        assert_eq!(
            normalize_tag("  Slow Burn, #Romance  "),
            "slow-burn-romance"
        );
        assert_eq!(normalize_tag("A,B"), "a-b");
        assert_eq!(normalize_tag("#"), "");
        assert_eq!(normalize_tag(&"x".repeat(40)), "x".repeat(24));
        assert_eq!(
            normalize_tag("\u{4F60}\u{597D} World"),
            "\u{4F60}\u{597D}-world"
        );
    }

    #[test]
    fn dedupes_tags_and_enforces_the_cap() {
        let tags_in = tags(&["B", "a", "b", " ", "#"]);
        assert_eq!(normalize_tags(&tags_in).unwrap(), vec!["b", "a"]);

        let many: Vec<String> = (0..13).map(|index| format!("tag{index}")).collect();
        let error = normalize_tags(&many).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::TagLimit);
        assert_eq!(normalize_tags(&many[..12]).unwrap().len(), 12);
    }

    #[test]
    fn counts_cjk_characters_and_whitespace_tokens() {
        assert_eq!(
            word_count("\u{4F60}\u{597D}\u{FF0C}\u{4E16}\u{754C}\u{3002}"),
            4
        );
        assert_eq!(word_count("Hello brave  new\nworld"), 4);
        assert_eq!(word_count("Hello\u{4E16}\u{754C}"), 3);
        assert_eq!(word_count("\u{3053}\u{3093}\u{306B}\u{3061}\u{306F}"), 5);
        assert_eq!(word_count("\u{D55C}\u{AE00} \u{D14C}\u{C2A4}\u{D2B8}"), 2);
        assert_eq!(word_count("-- ... \u{201C}\u{201D}"), 0);
        assert_eq!(word_count(""), 0);
    }

    #[test]
    fn splits_paragraphs_trimming_and_dropping_empty_lines() {
        let text = "\u{feff} one \r\n\r\n two\r\n\r\n  \n three\r";
        assert_eq!(split_paragraphs(text), vec!["one", "two", "three"]);
        assert_eq!(normalize_chapter_text(text), "one\ntwo\nthree\n");
        assert_eq!(normalize_chapter_text("  \n"), "");
    }

    #[test]
    fn paragraph_rows_are_one_based() {
        let rows = paragraph_rows("a\nb\n");
        assert_eq!(
            rows[0],
            ParagraphRow {
                n: 1,
                text: "a".to_string()
            }
        );
        assert_eq!(
            rows[1],
            ParagraphRow {
                n: 2,
                text: "b".to_string()
            }
        );
    }

    #[test]
    fn paragraph_edit_keeps_numbering_stable() {
        assert_eq!(normalize_paragraph("  a\n\nb \r\n c ").unwrap(), "a b c");
        assert_eq!(
            normalize_paragraph(" \n ").unwrap_err().code,
            NovelErrorCode::InvalidInput
        );
        assert_eq!(
            replace_paragraph("a\nb\nc\n", 2, "x\ny").unwrap(),
            "a\nx y\nc\n"
        );
        assert_eq!(
            replace_paragraph("a\n", 2, "x").unwrap_err().code,
            NovelErrorCode::ParagraphOutOfRange
        );
        assert_eq!(
            replace_paragraph("a\n", 0, "x").unwrap_err().code,
            NovelErrorCode::ParagraphOutOfRange
        );
    }

    #[test]
    fn chapter_ids_are_32_lowercase_hex_chars() {
        let id = new_chapter_id();
        assert_eq!(id.len(), 32);
        assert!(
            id.bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        );
        assert_ne!(id, new_chapter_id());
    }

    #[test]
    fn parses_cover_data_urls() {
        let (kind, bytes) = parse_cover_data_url(&data_url("image/jpeg", &JPEG)).unwrap();
        assert_eq!(kind, CoverKind::Jpeg);
        assert_eq!(bytes, JPEG);
        let (kind, _) = parse_cover_data_url(&data_url("image/png", &PNG)).unwrap();
        assert_eq!(kind, CoverKind::Png);

        let gif = parse_cover_data_url(&data_url("image/gif", b"GIF89a")).unwrap_err();
        assert_eq!(gif.code, NovelErrorCode::CoverInvalid);
        let mismatch = parse_cover_data_url(&data_url("image/png", &JPEG)).unwrap_err();
        assert_eq!(mismatch.code, NovelErrorCode::CoverInvalid);
        let plain = parse_cover_data_url("not a data url").unwrap_err();
        assert_eq!(plain.code, NovelErrorCode::CoverInvalid);
        let broken = parse_cover_data_url("data:image/png;base64,@@@").unwrap_err();
        assert_eq!(broken.code, NovelErrorCode::CoverInvalid);
    }

    #[test]
    fn rejects_covers_over_eight_mib() {
        let mut big = PNG.to_vec();
        big.resize(COVER_MAX_BYTES + 1, 0);

        let error = parse_cover_data_url(&data_url("image/png", &big)).unwrap_err();

        assert_eq!(error.code, NovelErrorCode::CoverTooLarge);
    }

    #[test]
    fn opening_without_a_workspace_is_a_typed_error() {
        let session = WorkspaceSession::new();

        let error = NovelService::new().open(&session).unwrap_err();

        assert_eq!(error.code, NovelErrorCode::NoWorkspace);
    }

    #[test]
    fn creates_and_lists_novels_with_duplicates_allowed() {
        let fixture = fixture();
        let mut first = input("  Same Title ");
        first.tags = tags(&["Zeta", "alpha"]);

        let created = fixture.workspace.create(first).unwrap();
        let again = fixture.workspace.create(input("Same Title")).unwrap();

        assert_eq!(created.title, "Same Title");
        assert_eq!(created.lang, "ZH");
        assert_eq!(created.origin, "created");
        assert_eq!(created.tags, vec!["alpha", "zeta"]);
        assert_eq!(created.chapter_count, 0);
        assert_eq!(created.created_at, created.updated_at);
        assert_ne!(created.id, again.id);
        let listed = fixture.workspace.list().unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0], created);
    }

    #[test]
    fn create_rejects_bad_input_and_too_many_tags() {
        let fixture = fixture();
        let mut bad_title = input("  ");
        let error = fixture.workspace.create(bad_title.clone()).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::InvalidInput);
        bad_title.title = "ok".to_string();
        bad_title.lang = "FR".to_string();
        let error = fixture.workspace.create(bad_title).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::InvalidInput);
        let mut crowded = input("ok");
        crowded.tags = (0..13).map(|index| format!("t{index}")).collect();
        let error = fixture.workspace.create(crowded).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::TagLimit);
        assert!(fixture.workspace.list().unwrap().is_empty());
    }

    #[test]
    fn updates_only_the_patched_fields_and_replaces_tags() {
        let fixture = fixture();
        let mut seed = input("Title");
        seed.tags = tags(&["one", "two"]);
        let created = fixture.workspace.create(seed).unwrap();

        let patch = NovelPatch {
            name: Some(" Display ".to_string()),
            lang: Some("vi".to_string()),
            tags: Some(tags(&["Three"])),
            ..NovelPatch::default()
        };
        let updated = fixture.workspace.update(created.id, patch).unwrap();

        assert_eq!(updated.title, "Title");
        assert_eq!(updated.name, "Display");
        assert_eq!(updated.lang, "VI");
        assert_eq!(updated.author, "Author");
        assert_eq!(updated.tags, vec!["three"]);
        assert!(updated.updated_at >= created.updated_at);

        let untouched = fixture
            .workspace
            .update(created.id, NovelPatch::default())
            .unwrap();
        assert_eq!(untouched.tags, vec!["three"]);
    }

    #[test]
    fn update_validates_and_reports_missing_novels() {
        let fixture = fixture();
        let created = fixture.workspace.create(input("Title")).unwrap();

        let empty_title = NovelPatch {
            title: Some(" ".to_string()),
            ..NovelPatch::default()
        };
        let error = fixture
            .workspace
            .update(created.id, empty_title)
            .unwrap_err();
        assert_eq!(error.code, NovelErrorCode::InvalidInput);
        let error = fixture
            .workspace
            .update(999, NovelPatch::default())
            .unwrap_err();
        assert_eq!(error.code, NovelErrorCode::NotFound);
        let crowded = NovelPatch {
            tags: Some((0..13).map(|index| format!("t{index}")).collect()),
            ..NovelPatch::default()
        };
        let error = fixture.workspace.update(created.id, crowded).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::TagLimit);
    }

    #[test]
    fn sets_replaces_and_clears_the_cover() {
        let fixture = fixture();
        let created = fixture.workspace.create(input("Title")).unwrap();
        assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), None);

        let jpeg = data_url("image/jpeg", &JPEG);
        let after_set = fixture.workspace.cover_set(created.id, &jpeg).unwrap();
        assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), Some(jpeg));
        assert!(after_set.updated_at >= created.updated_at);

        let png = data_url("image/png", &PNG);
        fixture.workspace.cover_set(created.id, &png).unwrap();
        assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), Some(png));
        let novel_dir = fixture
            .dir
            .path()
            .join("novels")
            .join(created.id.to_string());
        assert!(!novel_dir.join("cover.jpg").exists());
        assert!(novel_dir.join("cover.png").is_file());

        fixture.workspace.cover_clear(created.id).unwrap();
        assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), None);
        let error = fixture.workspace.cover_get(404).unwrap_err();
        assert_eq!(error.code, NovelErrorCode::NotFound);
    }

    #[test]
    fn delete_cascades_chapters_tags_and_folders() {
        let fixture = fixture();
        let mut tagged = input("Tagged");
        tagged.tags = tags(&["keep"]);
        let kept = fixture.workspace.create(tagged).unwrap();
        let book = imported(&fixture, 3);
        let novel_dir = fixture.dir.path().join("novels").join(book.id.to_string());
        assert!(novel_dir.is_dir());

        let removed = fixture
            .workspace
            .delete(&[book.id, book.id, 12345])
            .unwrap();

        assert_eq!(removed, 1);
        assert!(!novel_dir.exists());
        let ids: Vec<i64> = fixture
            .workspace
            .list()
            .unwrap()
            .iter()
            .map(|n| n.id)
            .collect();
        assert_eq!(ids, vec![kept.id]);
        let conn = Database::open_read_write(&fixture.dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        let chapters: i64 = conn
            .connection()
            .query_row("SELECT COUNT(*) FROM ws_novel_chapters", [], |row| {
                row.get(0)
            })
            .unwrap();
        let tag_rows: i64 = conn
            .connection()
            .query_row("SELECT COUNT(*) FROM ws_tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(chapters, 0);
        assert_eq!(tag_rows, 1);
    }

    #[test]
    fn reads_chapters_and_edits_a_paragraph() {
        let fixture = fixture();
        let book = imported(&fixture, 2);
        let chapters = fixture.workspace.chapters(book.id).unwrap();
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].seq, 1);
        assert_eq!(chapters[0].translation_status, "none");
        let first = &chapters[0];

        let paragraphs = fixture.workspace.chapter_read(book.id, &first.id).unwrap();
        assert_eq!(paragraphs.len(), 3);
        assert_eq!(paragraphs[0].n, 1);

        let edited = fixture
            .workspace
            .paragraph_update(book.id, &first.id, 2, "  brand new\n line  ")
            .unwrap();

        let reread = fixture.workspace.chapter_read(book.id, &first.id).unwrap();
        assert_eq!(reread.len(), 3);
        assert_eq!(reread[1].text, "brand new line");
        assert_eq!(reread[0], paragraphs[0]);
        assert_eq!(reread[2], paragraphs[2]);
        assert_eq!(
            edited.word_count,
            word_count(&join_paragraphs(&[
                reread[0].text.clone(),
                reread[1].text.clone(),
                reread[2].text.clone(),
            ]))
        );
        assert!(edited.updated_at >= first.updated_at);
        let novel = fixture.workspace.list().unwrap().remove(0);
        assert!(novel.updated_at >= book.updated_at);
        assert_eq!(novel.word_count, edited.word_count + chapters[1].word_count);
    }

    #[test]
    fn paragraph_edit_rejects_bad_requests() {
        let fixture = fixture();
        let book = imported(&fixture, 1);
        let chapter = fixture.workspace.chapters(book.id).unwrap().remove(0);

        let empty = fixture
            .workspace
            .paragraph_update(book.id, &chapter.id, 1, "  ")
            .unwrap_err();
        let range = fixture
            .workspace
            .paragraph_update(book.id, &chapter.id, 99, "x")
            .unwrap_err();
        let unknown = fixture
            .workspace
            .paragraph_update(book.id, "ffffffffffffffffffffffffffffffff", 1, "x")
            .unwrap_err();
        let missing = fixture.workspace.chapters(404).unwrap_err();

        assert_eq!(empty.code, NovelErrorCode::InvalidInput);
        assert_eq!(range.code, NovelErrorCode::ParagraphOutOfRange);
        assert_eq!(unknown.code, NovelErrorCode::NotFound);
        assert_eq!(missing.code, NovelErrorCode::NotFound);
    }

    #[test]
    fn missing_chapter_file_is_reported_for_that_chapter() {
        let fixture = fixture();
        let book = imported(&fixture, 2);
        let chapters = fixture.workspace.chapters(book.id).unwrap();
        let path = fixture
            .dir
            .path()
            .join("novels")
            .join(book.id.to_string())
            .join(format!("chapter_{}.txt", chapters[0].id));
        fs::remove_file(path).unwrap();

        let read = fixture
            .workspace
            .chapter_read(book.id, &chapters[0].id)
            .unwrap_err();
        let edit = fixture
            .workspace
            .paragraph_update(book.id, &chapters[0].id, 1, "x")
            .unwrap_err();

        assert_eq!(read.code, NovelErrorCode::ChapterFileMissing);
        assert_eq!(edit.code, NovelErrorCode::ChapterFileMissing);
        assert!(
            fixture
                .workspace
                .chapter_read(book.id, &chapters[1].id)
                .is_ok()
        );
    }

    #[test]
    fn imports_a_package_with_edited_metadata() {
        let fixture = fixture();
        let path = write_package_file(&fixture, "book.zip", &sample_package(3));
        let mut meta = input("My Title");
        meta.lang = "en".to_string();
        meta.tags = tags(&["Imported"]);

        let summary = fixture.workspace.import_package(&path, meta).unwrap();

        assert_eq!(summary.title, "My Title");
        assert_eq!(summary.lang, "EN");
        assert_eq!(summary.origin, "imported");
        assert_eq!(summary.chapter_count, 3);
        assert_eq!(summary.tags, vec!["imported"]);
        assert!(summary.word_count > 0);
        let cover = fixture.workspace.cover_get(summary.id).unwrap().unwrap();
        assert!(cover.starts_with("data:image/jpeg;base64,"));
        let chapters = fixture.workspace.chapters(summary.id).unwrap();
        assert_eq!(chapters[2].title, "Chapter 3");
        assert_eq!(chapters[0].created_at, chapters[0].updated_at);
        let paragraphs = fixture
            .workspace
            .chapter_read(summary.id, &chapters[0].id)
            .unwrap();
        assert_eq!(paragraphs.len(), 3);
        assert_eq!(
            chapters[0].word_count,
            word_count(&join_paragraphs(&[
                paragraphs[0].text.clone(),
                paragraphs[1].text.clone(),
                paragraphs[2].text.clone(),
            ]))
        );
    }

    #[test]
    fn imports_several_hundred_chapters() {
        let fixture = fixture();

        let summary = imported(&fixture, 600);

        assert_eq!(summary.chapter_count, 600);
        let chapters = fixture.workspace.chapters(summary.id).unwrap();
        assert_eq!(chapters.len(), 600);
        assert_eq!(chapters[599].seq, 600);
        let files = fs::read_dir(
            fixture
                .dir
                .path()
                .join("novels")
                .join(summary.id.to_string()),
        )
        .unwrap()
        .count();
        assert_eq!(files, 601);
    }

    #[test]
    fn failed_validation_imports_nothing() {
        let fixture = fixture();
        let manifest = manifest_json(&["chapters/001.txt", "chapters/002.txt"]);
        let bytes = zip_bytes(&[
            ("manifest.json", manifest.as_bytes()),
            ("chapters/001.txt", b"a"),
        ]);
        let path = write_package_file(&fixture, "bad.dsnovel", &bytes);

        let error = fixture
            .workspace
            .import_package(&path, input("Bad"))
            .unwrap_err();

        assert_eq!(error.code, NovelErrorCode::PackageChapters);
        assert!(fixture.workspace.list().unwrap().is_empty());
        assert!(!fixture.dir.path().join("novels").exists());
    }

    #[test]
    fn mid_import_failure_rolls_back_rows_and_removes_the_folder() {
        let fixture = fixture();
        let path = write_package_file(&fixture, "book.dsnovel", &sample_package(4));
        let (mut reader, package) = inspect_path(&path, &NullSink).unwrap();
        let mut broken = package.clone();
        broken.chapters[2].file = "chapters/gone.txt".to_string();
        let mut db = fixture.workspace.database().unwrap();
        let tx = db.connection_mut().transaction().unwrap();
        let id = insert_novel(
            &tx,
            &clean_input(input("Half")).unwrap(),
            "imported",
            &now_text(),
        )
        .unwrap();

        let result = fixture
            .workspace
            .write_package(&tx, &mut reader, &broken, id);
        drop(tx);
        let _ = fixture.workspace.files().remove_novel_dir(id);

        assert_eq!(result.unwrap_err().code, NovelErrorCode::PackageChapters);
        assert!(fixture.workspace.list().unwrap().is_empty());
        assert!(
            !fixture
                .dir
                .path()
                .join("novels")
                .join(id.to_string())
                .exists()
        );
    }

    #[test]
    fn invalid_utf8_chapter_fails_validation_and_imports_nothing() {
        let fixture = fixture();
        let manifest = manifest_json(&["chapters/001.txt", "chapters/002.txt"]);
        let bytes = zip_bytes(&[
            ("manifest.json", manifest.as_bytes()),
            ("chapters/001.txt", b"a\nb"),
            ("chapters/002.txt", &[0xFF, 0xFE, 0xFD]),
        ]);
        let path = write_package_file(&fixture, "bad-utf8.dsnovel", &bytes);

        let error = fixture
            .workspace
            .import_package(&path, input("Bad"))
            .unwrap_err();

        assert_eq!(error.code, NovelErrorCode::PackageChapters);
        assert!(fixture.workspace.list().unwrap().is_empty());
    }

    #[test]
    fn export_round_trips_through_import() {
        let fixture = fixture();
        let book = imported(&fixture, 3);
        fixture
            .workspace
            .paragraph_update(
                book.id,
                &fixture.workspace.chapters(book.id).unwrap()[1].id,
                1,
                "edited line",
            )
            .unwrap();
        let dest = fixture.dir.path().join("out").join("Exported");
        fs::create_dir(dest.parent().unwrap()).unwrap();

        let summary = fixture.workspace.export_package(book.id, &dest).unwrap();

        let written = fixture.dir.path().join("out").join("Exported.dsnovel");
        assert_eq!(summary.chapter_count, 3);
        assert_eq!(PathBuf::from(&summary.path), written);
        assert!(!fixture.dir.path().join("out").join("Exported.dsnovel.part").exists());
        let mut meta = input("Copy");
        meta.lang = "zh".to_string();
        let copy = fixture.workspace.import_package(&written, meta).unwrap();
        assert_eq!(copy.chapter_count, 3);
        let original = fixture.workspace.list().unwrap().remove(0);
        assert_eq!(original.id, book.id);
        assert_eq!(copy.word_count, original.word_count);
        let source = fixture.workspace.chapters(book.id).unwrap();
        let target = fixture.workspace.chapters(copy.id).unwrap();
        for (before, after) in source.iter().zip(&target) {
            assert_eq!(before.title, after.title);
            let old = fixture.workspace.chapter_read(book.id, &before.id).unwrap();
            let new = fixture.workspace.chapter_read(copy.id, &after.id).unwrap();
            assert_eq!(old, new);
        }
        assert_eq!(
            fixture.workspace.cover_get(copy.id).unwrap(),
            fixture.workspace.cover_get(book.id).unwrap()
        );
    }

    #[test]
    fn export_without_chapters_or_novel_is_rejected() {
        let fixture = fixture();
        let empty = fixture.workspace.create(input("Empty")).unwrap();
        let dest = fixture.dir.path().join("empty.dsnovel");

        let none = fixture.workspace.export_package(empty.id, &dest).unwrap_err();
        let missing = fixture.workspace.export_package(404, &dest).unwrap_err();

        assert_eq!(none.code, NovelErrorCode::InvalidInput);
        assert_eq!(missing.code, NovelErrorCode::NotFound);
        assert!(!dest.exists());
    }

    #[test]
    fn failed_export_leaves_no_partial_file() {
        let fixture = fixture();
        let book = imported(&fixture, 2);
        let chapters = fixture.workspace.chapters(book.id).unwrap();
        fs::remove_file(
            fixture
                .dir
                .path()
                .join("novels")
                .join(book.id.to_string())
                .join(format!("chapter_{}.txt", chapters[1].id)),
        )
        .unwrap();
        let dest = fixture.dir.path().join("broken.dsnovel");

        let error = fixture.workspace.export_package(book.id, &dest).unwrap_err();

        assert_eq!(error.code, NovelErrorCode::ChapterFileMissing);
        assert!(!dest.exists());
        assert!(!fixture.dir.path().join("broken.dsnovel.part").exists());
    }

    #[test]
    fn export_replaces_an_existing_file() {
        let fixture = fixture();
        let book = imported(&fixture, 1);
        let dest = fixture.dir.path().join("again.dsnovel");
        fs::write(&dest, b"old").unwrap();

        fixture.workspace.export_package(book.id, &dest).unwrap();

        assert!(fs::metadata(&dest).unwrap().len() > 3);
        assert!(fixture.workspace.import_package(&dest, input("Back")).is_ok());
    }

    #[test]
    #[ignore = "measures the real samples in _output, run with --ignored --nocapture"]
    fn measures_import_time_of_the_sample_packages() {
        let samples = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("_output");
        let fixture = fixture();
        for name in ["shuse-wushuang", "wanmei-nvpei", "xiayan-shenyi"] {
            let path = samples.join(format!("{name}.dsnovel"));
            let started = std::time::Instant::now();
            let summary = fixture
                .workspace
                .import_package(&path, input(name))
                .unwrap();
            println!(
                "import {name}: {:?} chapters={} words={}",
                started.elapsed(),
                summary.chapter_count,
                summary.word_count
            );
            assert!(fixture.workspace.cover_get(summary.id).unwrap().is_some());
        }
    }
}
