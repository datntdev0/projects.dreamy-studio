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
use crate::features::novel::models::Paragraph;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::package::PackageReader;
use crate::features::novel::package::ValidatedPackage;
use crate::features::novel::package::inspect_path;
use crate::features::novel::package::package_destination;
use crate::features::novel::package::write_package;
use crate::features::novel::progress::attach_progress;
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
use sha2::Digest;
use sha2::Sha256;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use uuid::Uuid;

pub const LANGS: [&str; 5] = ["EN", "VI", "ZH", "JA", "KO"];
pub const MAX_TITLE_CHARS: usize = 200;

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

pub fn paragraph_hash(text: &str) -> String {
    Sha256::digest(text.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn make_paragraph(text: String) -> Paragraph {
    let hashcheck = paragraph_hash(&text);
    Paragraph { text, hashcheck }
}

pub fn paragraphs_from_text(text: &str) -> Vec<Paragraph> {
    split_paragraphs(text)
        .into_iter()
        .map(make_paragraph)
        .collect()
}

pub fn paragraphs_text(paragraphs: &[Paragraph]) -> String {
    let texts: Vec<String> = paragraphs
        .iter()
        .map(|paragraph| paragraph.text.clone())
        .collect();
    join_paragraphs(&texts)
}

pub fn paragraph_rows(paragraphs: &[Paragraph]) -> Vec<ParagraphRow> {
    let mut rows = Vec::with_capacity(paragraphs.len());
    for (index, paragraph) in paragraphs.iter().enumerate() {
        rows.push(ParagraphRow {
            n: index + 1,
            text: paragraph.text.clone(),
            hashcheck: paragraph.hashcheck.clone(),
        });
    }
    rows
}

pub fn replace_paragraph(
    paragraphs: &mut [Paragraph],
    n: usize,
    replacement: &str,
) -> NovelResult<()> {
    let replacement = normalize_paragraph(replacement)?;
    if n == 0 || n > paragraphs.len() {
        return Err(NovelError::new(
            NovelErrorCode::ParagraphOutOfRange,
            format!(
                "paragraph {n} does not exist, the chapter has {}",
                paragraphs.len()
            ),
        ));
    }
    paragraphs[n - 1] = make_paragraph(replacement);
    Ok(())
}

pub fn new_chapter_id() -> String {
    Uuid::new_v4().simple().to_string()
}

pub fn cover_data_url(kind: CoverKind, bytes: &[u8]) -> String {
    format!("data:{};base64,{}", kind.mime(), STANDARD.encode(bytes))
}

fn invalid_cover() -> NovelError {
    NovelError::new(
        NovelErrorCode::CoverInvalid,
        "cover must be a base64 data URL",
    )
}

pub fn parse_cover_data_url(data_url: &str) -> NovelResult<(CoverKind, Vec<u8>)> {
    let rest = data_url.strip_prefix("data:").ok_or_else(invalid_cover)?;
    let (mime, payload) = rest.split_once(";base64,").ok_or_else(invalid_cover)?;
    let kind = CoverKind::from_mime(mime).ok_or_else(|| {
        NovelError::new(
            NovelErrorCode::CoverInvalid,
            "cover must be a JPEG or PNG image",
        )
    })?;
    if payload.len() > max_encoded_len() {
        return Err(cover_too_large());
    }
    let bytes = STANDARD.decode(payload).map_err(|_| invalid_cover())?;
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
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(NovelError::invalid(format!(
            "title must be at most {MAX_TITLE_CHARS} characters"
        )));
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

fn require_summary(repo: &NovelRepository, root: &Path, id: i64) -> NovelResult<NovelSummary> {
    let Some(mut summary) = repo.find_summary(id)? else {
        return Err(NovelError::not_found(format!("novel {id} does not exist")));
    };
    attach_progress(root, &mut summary, &repo.list_chapters(id)?)?;
    Ok(summary)
}

fn resequence_chapters(
    repo: &NovelRepository,
    chapters: &[ChapterRow],
    now: &str,
) -> NovelResult<()> {
    for chapter in chapters {
        repo.set_chapter_seq(&chapter.id, -chapter.seq, now)?;
    }
    for (index, chapter) in chapters.iter().enumerate() {
        repo.set_chapter_seq(&chapter.id, index as i64 + 1, now)?;
    }
    Ok(())
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
        let repo = NovelRepository::new(db.connection());
        let mut summaries = repo.list_summaries()?;
        for summary in &mut summaries {
            attach_progress(&self.dir, summary, &repo.list_chapters(summary.id)?)?;
        }
        Ok(summaries)
    }

    pub fn create(&self, input: NovelInput) -> NovelResult<NovelSummary> {
        let input = clean_input(input)?;
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let id = insert_novel(&tx, &input, ORIGIN_CREATED, &now_text())?;
        let summary = require_summary(&NovelRepository::new(&tx), &self.dir, id)?;
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
        let summary = require_summary(&repo, &self.dir, id)?;
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
        require_summary(&repo, &self.dir, id)
    }

    pub fn cover_clear(&self, id: i64) -> NovelResult<NovelSummary> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_novel(&repo, id)?;
        self.files().clear_cover(id)?;
        repo.touch_novel(id, &now_text())?;
        require_summary(&repo, &self.dir, id)
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
        let paragraphs = self.files().read_chapter(novel_id, chapter_id)?;
        Ok(paragraph_rows(&paragraphs))
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
        let mut paragraphs = files.read_chapter(novel_id, chapter_id)?;
        replace_paragraph(&mut paragraphs, n, text)?;
        self.save_chapter(&repo, novel_id, chapter_id, &paragraphs)
    }

    pub fn chapter_write(
        &self,
        novel_id: i64,
        chapter_id: &str,
        text: &str,
    ) -> NovelResult<ChapterRow> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_chapter(&repo, novel_id, chapter_id)?;
        let paragraphs: Vec<Paragraph> = split_paragraphs(text)
            .into_iter()
            .map(make_paragraph)
            .collect();
        if paragraphs.is_empty() {
            return Err(NovelError::invalid("chapter text must not be empty"));
        }
        self.save_chapter(&repo, novel_id, chapter_id, &paragraphs)
    }

    pub fn chapter_add(&self, novel_id: i64, title: &str) -> NovelResult<ChapterRow> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_novel(&repo, novel_id)?;
        let seq = repo.max_seq(novel_id)? + 1;
        let title = if title.trim().is_empty() {
            format!("Chapter {seq}")
        } else {
            require_title(title)?
        };
        let id = new_chapter_id();
        let now = now_text();
        self.files().write_chapter(novel_id, &id, &[])?;
        repo.insert_chapter(&NewChapter {
            id: &id,
            novel_id,
            seq,
            title: &title,
            word_count: 0,
            now: &now,
        })?;
        repo.touch_novel(novel_id, &now)?;
        require_chapter(&repo, novel_id, &id)
    }

    pub fn chapter_rename(
        &self,
        novel_id: i64,
        chapter_id: &str,
        title: &str,
    ) -> NovelResult<ChapterRow> {
        let _gate = lock(&self.gate);
        let title = require_title(title)?;
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_chapter(&repo, novel_id, chapter_id)?;
        let now = now_text();
        repo.rename_chapter(chapter_id, &title, &now)?;
        repo.touch_novel(novel_id, &now)?;
        require_chapter(&repo, novel_id, chapter_id)
    }

    pub fn chapter_delete(&self, novel_id: i64, chapter_id: &str) -> NovelResult<Vec<ChapterRow>> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_chapter(&repo, novel_id, chapter_id)?;
        let now = now_text();
        repo.delete_chapter(chapter_id)?;
        let chapters = repo.list_chapters(novel_id)?;
        resequence_chapters(&repo, &chapters, &now)?;
        self.files().remove_chapter(novel_id, chapter_id)?;
        repo.touch_novel(novel_id, &now)?;
        Ok(repo.list_chapters(novel_id)?)
    }

    pub fn chapter_move(
        &self,
        novel_id: i64,
        chapter_id: &str,
        to_seq: i64,
    ) -> NovelResult<Vec<ChapterRow>> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        let chapter = require_chapter(&repo, novel_id, chapter_id)?;
        let mut chapters = repo.list_chapters(novel_id)?;
        if to_seq < 1 || to_seq > chapters.len() as i64 {
            return Err(NovelError::invalid("chapter position is out of range"));
        }
        let now = now_text();
        if chapter.seq == to_seq {
            repo.touch_novel(novel_id, &now)?;
            return Ok(chapters);
        }
        let from = chapters
            .iter()
            .position(|row| row.id == chapter_id)
            .ok_or_else(|| NovelError::not_found(format!("chapter {chapter_id} does not exist")))?;
        let moving = chapters.remove(from);
        chapters.insert(to_seq as usize - 1, moving);
        resequence_chapters(&repo, &chapters, &now)?;
        repo.touch_novel(novel_id, &now)?;
        Ok(repo.list_chapters(novel_id)?)
    }

    pub fn paragraph_add(
        &self,
        novel_id: i64,
        chapter_id: &str,
        text: &str,
    ) -> NovelResult<ChapterRow> {
        let _gate = lock(&self.gate);
        let text = normalize_paragraph(text)?;
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        require_chapter(&repo, novel_id, chapter_id)?;
        let files = self.files();
        let mut paragraphs = files.read_chapter(novel_id, chapter_id)?;
        paragraphs.push(make_paragraph(text));
        self.save_chapter(&repo, novel_id, chapter_id, &paragraphs)
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
        let result = commit_import(tx, &self.dir, id);
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
            files.write_chapter(novel_id, &id, &paragraphs_from_text(&text))?;
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

    fn save_chapter(
        &self,
        repo: &NovelRepository,
        novel_id: i64,
        chapter_id: &str,
        paragraphs: &[Paragraph],
    ) -> NovelResult<ChapterRow> {
        self.files()
            .write_chapter(novel_id, chapter_id, paragraphs)?;
        let now = now_text();
        repo.update_chapter_text(chapter_id, word_count(&paragraphs_text(paragraphs)), &now)?;
        repo.touch_novel(novel_id, &now)?;
        require_chapter(repo, novel_id, chapter_id)
    }

    fn files(&self) -> NovelFiles {
        NovelFiles::new(self.dir.clone())
    }
}

fn commit_import(tx: rusqlite::Transaction, root: &Path, id: i64) -> NovelResult<NovelSummary> {
    let summary = require_summary(&NovelRepository::new(&tx), root, id)?;
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
#[path = "../../../test/features/novel/service.test.rs"]
mod tests;
