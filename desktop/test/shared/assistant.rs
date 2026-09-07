use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::AssistantEventSink;
use crate::features::assistant::service::AssistantLlm;
use crate::features::assistant::sources::KnowledgeSource;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::ProjectSource;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::sources::TranslationSource;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeEvidence;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::ontology::Ontology;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::pipeline::llm::Turn;
use crate::features::project::models::ProjectSummary;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::service::ChapterTranslation;
use crate::features::translation::service::DictChange;
use crate::features::translation::service::NovelTranslation;
use crate::features::translation::service::PassageTranslation;
use crate::features::translation::warnings::TranslationWarning;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NovelWrite {
    Update {
        novel_id: i64,
        patch: NovelPatch,
    },
    Paragraph {
        novel_id: i64,
        chapter_id: String,
        n: usize,
        text: String,
    },
    Rename {
        novel_id: i64,
        chapter_id: String,
        title: String,
    },
}

#[derive(Default)]
struct NovelState {
    novels: Vec<NovelSummary>,
    chapters: HashMap<i64, Vec<ChapterRow>>,
    paragraphs: HashMap<String, Vec<String>>,
    writes: Vec<NovelWrite>,
}

#[derive(Clone, Default)]
pub struct FakeNovels {
    state: Arc<Mutex<NovelState>>,
}

impl FakeNovels {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn writes(&self) -> Vec<NovelWrite> {
        guard(&self.state).writes.clone()
    }

    pub fn paragraph_texts(&self, chapter_id: &str) -> Vec<String> {
        guard(&self.state)
            .paragraphs
            .get(chapter_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn with_novel(self, id: i64, title: &str) -> Self {
        {
            let mut state = guard(&self.state);
            state.novels.push(NovelSummary {
                id,
                title: title.to_string(),
                name: format!("{title} name"),
                author: "Author".to_string(),
                lang: "zh".to_string(),
                description: format!("About {title}"),
                origin: "created".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
                chapter_count: 0,
                word_count: 0,
                translated_count: 0,
                analyzed_count: 0,
                tags: vec!["tag".to_string()],
            });
            state.chapters.entry(id).or_default();
        }
        self
    }

    pub fn with_chapter(self, novel_id: i64, seq: i64, title: &str, paragraphs: &[&str]) -> Self {
        {
            let state = &mut *guard(&self.state);
            let id = format!("chapter-{novel_id}-{seq}");
            let words: i64 = paragraphs
                .iter()
                .map(|text| text.split_whitespace().count() as i64)
                .sum();
            let rows = state.chapters.entry(novel_id).or_default();
            rows.push(ChapterRow {
                id: id.clone(),
                novel_id,
                seq,
                title: title.to_string(),
                word_count: words,
                translation_status: "none".to_string(),
                analysis_status: "none".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            });
            let count = rows.len() as i64;
            if let Some(novel) = state.novels.iter_mut().find(|novel| novel.id == novel_id) {
                novel.chapter_count = count;
                novel.word_count += words;
            }
            state
                .paragraphs
                .insert(id, paragraphs.iter().map(|text| text.to_string()).collect());
        }
        self
    }

    pub fn with_statuses(self, novel_id: i64, seq: i64, translation: &str, analysis: &str) -> Self {
        {
            let state = &mut *guard(&self.state);
            if let Some(chapter) = state
                .chapters
                .get_mut(&novel_id)
                .and_then(|rows| rows.iter_mut().find(|row| row.seq == seq))
            {
                chapter.translation_status = translation.to_string();
                chapter.analysis_status = analysis.to_string();
            }
            if let Some(novel) = state.novels.iter_mut().find(|novel| novel.id == novel_id) {
                let rows = &state.chapters[&novel_id];
                novel.translated_count = rows
                    .iter()
                    .filter(|row| row.translation_status != "none")
                    .count() as i64;
                novel.analyzed_count = rows
                    .iter()
                    .filter(|row| row.analysis_status != "none")
                    .count() as i64;
            }
        }
        self
    }
}

impl NovelSource for FakeNovels {
    fn list(&self) -> Result<Vec<NovelSummary>, String> {
        Ok(guard(&self.state).novels.clone())
    }

    fn chapters(&self, novel_id: i64) -> Result<Vec<ChapterRow>, String> {
        guard(&self.state)
            .chapters
            .get(&novel_id)
            .cloned()
            .ok_or_else(|| format!("novel {novel_id} not found"))
    }

    fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> Result<Vec<ParagraphRow>, String> {
        let state = guard(&self.state);
        let known = state
            .chapters
            .get(&novel_id)
            .is_some_and(|rows| rows.iter().any(|row| row.id == chapter_id));
        let texts = match state.paragraphs.get(chapter_id) {
            Some(texts) if known => texts,
            _ => return Err(format!("chapter {chapter_id} not found")),
        };
        Ok(texts
            .iter()
            .enumerate()
            .map(|(index, text)| ParagraphRow {
                n: index + 1,
                text: text.clone(),
                hashcheck: format!("hash-{}", index + 1),
            })
            .collect())
    }

    fn update(&self, novel_id: i64, patch: NovelPatch) -> Result<NovelSummary, String> {
        let mut state = guard(&self.state);
        let novel = state
            .novels
            .iter_mut()
            .find(|novel| novel.id == novel_id)
            .ok_or_else(|| format!("novel {novel_id} not found"))?;
        if let Some(title) = &patch.title {
            novel.title = title.clone();
        }
        if let Some(name) = &patch.name {
            novel.name = name.clone();
        }
        if let Some(author) = &patch.author {
            novel.author = author.clone();
        }
        if let Some(description) = &patch.description {
            novel.description = description.clone();
        }
        if let Some(tags) = &patch.tags {
            novel.tags = tags.clone();
        }
        let updated = novel.clone();
        state.writes.push(NovelWrite::Update { novel_id, patch });
        Ok(updated)
    }

    fn paragraph_update(
        &self,
        novel_id: i64,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> Result<ChapterRow, String> {
        let state = &mut *guard(&self.state);
        let row = find_chapter(&state.chapters, novel_id, chapter_id)?;
        let texts = state
            .paragraphs
            .get_mut(chapter_id)
            .ok_or_else(|| format!("chapter {chapter_id} not found"))?;
        let slot = n
            .checked_sub(1)
            .and_then(|index| texts.get_mut(index))
            .ok_or_else(|| format!("paragraph {n} not found"))?;
        *slot = text.to_string();
        state.writes.push(NovelWrite::Paragraph {
            novel_id,
            chapter_id: chapter_id.to_string(),
            n,
            text: text.to_string(),
        });
        Ok(row)
    }

    fn chapter_rename(
        &self,
        novel_id: i64,
        chapter_id: &str,
        title: &str,
    ) -> Result<ChapterRow, String> {
        let state = &mut *guard(&self.state);
        find_chapter(&state.chapters, novel_id, chapter_id)?;
        let row = state
            .chapters
            .get_mut(&novel_id)
            .and_then(|rows| rows.iter_mut().find(|row| row.id == chapter_id))
            .ok_or_else(|| format!("chapter {chapter_id} not found"))?;
        row.title = title.to_string();
        let renamed = row.clone();
        state.writes.push(NovelWrite::Rename {
            novel_id,
            chapter_id: chapter_id.to_string(),
            title: title.to_string(),
        });
        Ok(renamed)
    }
}

fn find_chapter(
    chapters: &HashMap<i64, Vec<ChapterRow>>,
    novel_id: i64,
    chapter_id: &str,
) -> Result<ChapterRow, String> {
    chapters
        .get(&novel_id)
        .and_then(|rows| rows.iter().find(|row| row.id == chapter_id))
        .cloned()
        .ok_or_else(|| format!("chapter {chapter_id} not found"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeCall {
    pub novel_id: i64,
    pub lang: String,
    pub edits: Vec<KnowledgeEdit>,
}

struct KnowledgeState {
    items: Vec<KnowledgeItem>,
    calls: Vec<KnowledgeCall>,
    previews: Vec<KnowledgeCall>,
    preview_items: Option<Vec<KnowledgeItem>>,
    preview_failure: Option<String>,
    failure: Option<String>,
}

#[derive(Clone)]
pub struct FakeKnowledge {
    state: Arc<Mutex<KnowledgeState>>,
}

impl FakeKnowledge {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(KnowledgeState {
                items: Vec::new(),
                calls: Vec::new(),
                previews: Vec::new(),
                preview_items: None,
                preview_failure: None,
                failure: None,
            })),
        }
    }

    pub fn with_entity(
        self,
        id: &str,
        kind: &str,
        name: &str,
        titles: &[&str],
        aliases: &[&str],
        chapters: &[i64],
    ) -> Self {
        guard(&self.state)
            .items
            .push(KnowledgeItem::Entity(KnowledgeEntity {
                id: id.to_string(),
                entity_type: kind.to_string(),
                name: name.to_string(),
                titles: strings(titles),
                aliases: strings(aliases),
                ev: evidence(chapters),
                stale: Vec::new(),
            }));
        self
    }

    pub fn with_fact(
        self,
        id: &str,
        pred: &str,
        subject: &str,
        object: Option<&str>,
        chapters: &[i64],
    ) -> Self {
        guard(&self.state)
            .items
            .push(KnowledgeItem::Fact(KnowledgeFact {
                id: id.to_string(),
                pred: pred.to_string(),
                subject: subject.to_string(),
                object: object.map(str::to_string),
                ev: evidence(chapters),
                stale: Vec::new(),
            }));
        self
    }

    pub fn with_knowledge(self, knowledge: WireKnowledge) -> Self {
        guard(&self.state).items = knowledge.items;
        self
    }

    pub fn failing(self, message: &str) -> Self {
        guard(&self.state).failure = Some(message.to_string());
        self
    }

    pub fn with_preview(self, items: Vec<KnowledgeItem>) -> Self {
        guard(&self.state).preview_items = Some(items);
        self
    }

    pub fn with_preview_failure(self, message: &str) -> Self {
        guard(&self.state).preview_failure = Some(message.to_string());
        self
    }

    pub fn calls(&self) -> Vec<KnowledgeCall> {
        guard(&self.state).calls.clone()
    }

    pub fn previews(&self) -> Vec<KnowledgeCall> {
        guard(&self.state).previews.clone()
    }

    fn snapshot(&self, lang: &str) -> WireKnowledge {
        self.snapshot_of(lang, guard(&self.state).items.clone())
    }

    fn snapshot_of(&self, lang: &str, items: Vec<KnowledgeItem>) -> WireKnowledge {
        WireKnowledge {
            lang: lang.to_string(),
            ontology: Ontology::get().view(),
            items,
            analyzed: BTreeMap::new(),
        }
    }
}

impl Default for FakeKnowledge {
    fn default() -> Self {
        Self::new()
    }
}

impl KnowledgeSource for FakeKnowledge {
    fn get(&self, _novel_id: i64, lang: &str) -> Result<WireKnowledge, String> {
        let failure = guard(&self.state).failure.clone();
        match failure {
            Some(message) => Err(message),
            None => Ok(self.snapshot(lang)),
        }
    }

    fn edit(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> Result<KnowledgeEditResult, String> {
        let failure = guard(&self.state).failure.clone();
        if let Some(message) = failure {
            return Err(message);
        }
        guard(&self.state).calls.push(KnowledgeCall {
            novel_id,
            lang: lang.to_string(),
            edits,
        });
        Ok(KnowledgeEditResult {
            knowledge: self.snapshot(lang),
            remap: BTreeMap::new(),
        })
    }

    fn preview(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> Result<WireKnowledge, String> {
        let failure = {
            let state = guard(&self.state);
            state.preview_failure.clone().or(state.failure.clone())
        };
        if let Some(message) = failure {
            return Err(message);
        }
        let configured = guard(&self.state).preview_items.clone();
        let items = configured.unwrap_or_else(|| simple_edits(self.snapshot(lang).items, &edits));
        guard(&self.state).previews.push(KnowledgeCall {
            novel_id,
            lang: lang.to_string(),
            edits,
        });
        Ok(self.snapshot_of(lang, items))
    }
}

fn simple_edits(mut items: Vec<KnowledgeItem>, edits: &[KnowledgeEdit]) -> Vec<KnowledgeItem> {
    for edit in edits {
        match edit {
            KnowledgeEdit::Del { id } => items.retain(|item| item_id(item) != id),
            KnowledgeEdit::Rename { id, name } => {
                for item in &mut items {
                    if let KnowledgeItem::Entity(entity) = item
                        && entity.id == *id
                    {
                        entity.name = name.clone();
                    }
                }
            }
            _ => {}
        }
    }
    items
}

fn item_id(item: &KnowledgeItem) -> &str {
    match item {
        KnowledgeItem::Entity(entity) => &entity.id,
        KnowledgeItem::Fact(fact) => &fact.id,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranslationWrite {
    Passage {
        novel_id: i64,
        target: String,
        chapter_id: String,
        n: usize,
        text: String,
    },
    DictAdd {
        novel_id: i64,
        target: String,
        input: DictInput,
    },
    DictUpdate {
        novel_id: i64,
        id: i64,
        patch: DictPatch,
    },
    DictDelete {
        novel_id: i64,
        id: i64,
    },
}

#[derive(Default)]
struct TranslationState {
    books: HashMap<(i64, String), NovelTranslation>,
    next_id: i64,
    writes: Vec<TranslationWrite>,
    failure: Option<String>,
}

#[derive(Clone, Default)]
pub struct FakeTranslation {
    state: Arc<Mutex<TranslationState>>,
}

impl FakeTranslation {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn writes(&self) -> Vec<TranslationWrite> {
        guard(&self.state).writes.clone()
    }

    pub fn book(&self, novel_id: i64, target: &str) -> NovelTranslation {
        let state = guard(&self.state);
        state
            .books
            .get(&book_key(novel_id, target))
            .cloned()
            .unwrap_or_else(empty_book)
    }

    pub fn passage_text(&self, novel_id: i64, target: &str, chapter_id: &str, n: usize) -> String {
        self.book(novel_id, target)
            .chapters
            .get(chapter_id)
            .and_then(|chapter| chapter.paragraphs.get(n - 1))
            .map(|passage| passage.text.clone())
            .unwrap_or_default()
    }

    pub fn with_guidelines(self, novel_id: i64, target: &str, text: &str) -> Self {
        self.edit_book(novel_id, target, |book, _| {
            book.guidelines = text.to_string();
        })
    }

    pub fn with_translated_chapter(
        self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        title: &str,
        texts: &[&str],
    ) -> Self {
        self.edit_book(novel_id, target, |book, _| {
            let paragraphs = texts
                .iter()
                .enumerate()
                .map(|(index, text)| PassageTranslation {
                    n: index + 1,
                    original_hashcheck: format!("hash-{}", index + 1),
                    text: text.to_string(),
                    note: String::new(),
                })
                .collect();
            book.chapters.insert(
                chapter_id.to_string(),
                ChapterTranslation {
                    title: title.to_string(),
                    paragraphs,
                },
            );
        })
    }

    pub fn with_note(
        self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        n: usize,
        note: &str,
    ) -> Self {
        self.edit_book(novel_id, target, |book, _| {
            if let Some(passage) = book
                .chapters
                .get_mut(chapter_id)
                .and_then(|chapter| chapter.paragraphs.get_mut(n - 1))
            {
                passage.note = note.to_string();
            }
        })
    }

    pub fn with_entry(
        self,
        novel_id: i64,
        target: &str,
        src: &str,
        dst: &str,
        kind: &str,
        note: &str,
    ) -> Self {
        self.edit_book(novel_id, target, |book, next| {
            *next += 1;
            book.dict.push(DictEntry {
                id: *next,
                src: src.to_string(),
                dst: dst.to_string(),
                kind: kind.to_string(),
                note: note.to_string(),
            });
        })
    }

    pub fn with_warning(self, novel_id: i64, target: &str, warning: TranslationWarning) -> Self {
        self.edit_book(novel_id, target, |book, _| book.warnings.push(warning))
    }

    pub fn failing(self, message: &str) -> Self {
        guard(&self.state).failure = Some(message.to_string());
        self
    }

    fn edit_book(
        self,
        novel_id: i64,
        target: &str,
        change: impl FnOnce(&mut NovelTranslation, &mut i64),
    ) -> Self {
        {
            let state = &mut *guard(&self.state);
            let book = state
                .books
                .entry(book_key(novel_id, target))
                .or_insert_with(empty_book);
            change(book, &mut state.next_id);
        }
        self
    }
}

impl TranslationSource for FakeTranslation {
    fn get(&self, novel_id: i64, target: &str) -> Result<NovelTranslation, String> {
        check_target(target)?;
        if let Some(message) = guard(&self.state).failure.clone() {
            return Err(message);
        }
        Ok(self.book(novel_id, target))
    }

    fn passage_save(
        &self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> Result<ChapterTranslation, String> {
        check_target(target)?;
        let state = &mut *guard(&self.state);
        if let Some(message) = state.failure.clone() {
            return Err(message);
        }
        let book = state
            .books
            .get_mut(&book_key(novel_id, target))
            .ok_or_else(|| format!("translation for chapter {chapter_id} does not exist"))?;
        let chapter = book
            .chapters
            .get_mut(chapter_id)
            .ok_or_else(|| format!("translation for chapter {chapter_id} does not exist"))?;
        let passage = n
            .checked_sub(1)
            .and_then(|index| chapter.paragraphs.get_mut(index))
            .ok_or_else(|| format!("paragraph {n} is out of range"))?;
        passage.text = text.trim().to_string();
        let saved = chapter.clone();
        state.writes.push(TranslationWrite::Passage {
            novel_id,
            target: target.to_string(),
            chapter_id: chapter_id.to_string(),
            n,
            text: text.to_string(),
        });
        Ok(saved)
    }

    fn dict_add(
        &self,
        novel_id: i64,
        target: &str,
        input: DictInput,
    ) -> Result<DictChange, String> {
        check_target(target)?;
        let state = &mut *guard(&self.state);
        if let Some(message) = state.failure.clone() {
            return Err(message);
        }
        let src = input.src.trim().to_string();
        let dst = input.dst.trim().to_string();
        if src.is_empty() || dst.is_empty() {
            return Err("dictionary source and destination must not be empty".to_string());
        }
        let book = state
            .books
            .entry(book_key(novel_id, target))
            .or_insert_with(empty_book);
        if book.dict.iter().any(|entry| entry.src == src) {
            return Err("a dictionary entry with this source already exists".to_string());
        }
        state.next_id += 1;
        let entry = DictEntry {
            id: state.next_id,
            src,
            dst,
            kind: input.kind.trim().to_string(),
            note: input.note.trim().to_string(),
        };
        book.dict.push(entry.clone());
        state.writes.push(TranslationWrite::DictAdd {
            novel_id,
            target: target.to_string(),
            input,
        });
        Ok(DictChange { entry, flagged: 0 })
    }

    fn dict_update(&self, novel_id: i64, id: i64, patch: DictPatch) -> Result<DictChange, String> {
        let state = &mut *guard(&self.state);
        if let Some(message) = state.failure.clone() {
            return Err(message);
        }
        let book = state
            .books
            .iter_mut()
            .filter(|(key, _)| key.0 == novel_id)
            .map(|(_, book)| book)
            .find(|book| book.dict.iter().any(|entry| entry.id == id))
            .ok_or_else(|| format!("dictionary entry {id} does not exist"))?;
        let clash = patch.src.as_deref().map(str::trim).is_some_and(|src| {
            book.dict
                .iter()
                .any(|entry| entry.id != id && entry.src == src)
        });
        if clash {
            return Err("a dictionary entry with this source already exists".to_string());
        }
        let entry = book
            .dict
            .iter_mut()
            .find(|entry| entry.id == id)
            .ok_or_else(|| format!("dictionary entry {id} does not exist"))?;
        if let Some(src) = &patch.src {
            entry.src = src.trim().to_string();
        }
        if let Some(dst) = &patch.dst {
            entry.dst = dst.trim().to_string();
        }
        if let Some(kind) = &patch.kind {
            entry.kind = kind.trim().to_string();
        }
        if let Some(note) = &patch.note {
            entry.note = note.trim().to_string();
        }
        let entry = entry.clone();
        state.writes.push(TranslationWrite::DictUpdate {
            novel_id,
            id,
            patch,
        });
        Ok(DictChange { entry, flagged: 0 })
    }

    fn dict_delete(&self, novel_id: i64, id: i64) -> Result<(), String> {
        let state = &mut *guard(&self.state);
        if let Some(message) = state.failure.clone() {
            return Err(message);
        }
        let book = state
            .books
            .iter_mut()
            .filter(|(key, _)| key.0 == novel_id)
            .map(|(_, book)| book)
            .find(|book| book.dict.iter().any(|entry| entry.id == id))
            .ok_or_else(|| format!("dictionary entry {id} does not exist"))?;
        book.dict.retain(|entry| entry.id != id);
        state
            .writes
            .push(TranslationWrite::DictDelete { novel_id, id });
        Ok(())
    }
}

fn book_key(novel_id: i64, target: &str) -> (i64, String) {
    (novel_id, target.trim().to_ascii_uppercase())
}

fn empty_book() -> NovelTranslation {
    NovelTranslation {
        guidelines: String::new(),
        dict: Vec::new(),
        chapters: BTreeMap::new(),
        warnings: Vec::new(),
    }
}

fn check_target(target: &str) -> Result<(), String> {
    match target.trim().to_ascii_uppercase().as_str() {
        "VI" | "EN" => Ok(()),
        _ => Err(format!("unsupported target '{target}'")),
    }
}

pub fn sources_of(novels: &FakeNovels, knowledge: &FakeKnowledge) -> Sources {
    sources_with(novels, knowledge, &FakeTranslation::new())
}

pub fn sources_with(
    novels: &FakeNovels,
    knowledge: &FakeKnowledge,
    translation: &FakeTranslation,
) -> Sources {
    sources_with_projects(novels, knowledge, translation, &FakeProjects::new())
}

pub fn sources_with_projects(
    novels: &FakeNovels,
    knowledge: &FakeKnowledge,
    translation: &FakeTranslation,
    projects: &FakeProjects,
) -> Sources {
    Sources {
        novels: Box::new(novels.clone()),
        knowledge: Box::new(knowledge.clone()),
        translation: Box::new(translation.clone()),
        projects: Box::new(projects.clone()),
    }
}

#[derive(Clone, Default)]
pub struct FakeProjects {
    projects: Vec<ProjectSummary>,
}

impl FakeProjects {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with(projects: Vec<ProjectSummary>) -> Self {
        Self { projects }
    }
}

impl ProjectSource for FakeProjects {
    fn list(&self) -> Result<Vec<ProjectSummary>, String> {
        Ok(self.projects.clone())
    }
}

pub fn project_summary(id: i64, novel_id: Option<i64>) -> ProjectSummary {
    ProjectSummary {
        id,
        name: format!("Project {id}"),
        folder: format!("project-{id}"),
        template: "audiobook".to_string(),
        description: String::new(),
        novel_id,
        novel_missing: false,
        src_kind: None,
        src_lang: None,
        archived: false,
        modules: Vec::new(),
        created_at: "2026-11-01T00:00:00+00:00".to_string(),
        updated_at: "2026-11-01T00:00:00+00:00".to_string(),
        opened_at: "2026-11-01T00:00:00+00:00".to_string(),
    }
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn evidence(chapters: &[i64]) -> Vec<KnowledgeEvidence> {
    chapters
        .iter()
        .map(|chapter| KnowledgeEvidence {
            chapter: *chapter,
            p: 1,
            q: "quote".to_string(),
            verified: true,
        })
        .collect()
}

#[derive(Default)]
pub struct RecordingSink {
    labels: Mutex<Vec<String>>,
    changes: Mutex<Vec<AssistantChange>>,
    attachments: Mutex<Vec<serde_json::Value>>,
}

impl RecordingSink {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn labels(&self) -> Vec<String> {
        guard(&self.labels).clone()
    }

    pub fn changes(&self) -> Vec<AssistantChange> {
        guard(&self.changes).clone()
    }

    pub fn attachments(&self) -> Vec<serde_json::Value> {
        guard(&self.attachments).clone()
    }
}

impl TurnSink for RecordingSink {
    fn record(&self, label: String) {
        guard(&self.labels).push(label);
    }

    fn changed(&self, change: AssistantChange) {
        guard(&self.changes).push(change);
    }

    fn attach(&self, attachment: serde_json::Value) {
        guard(&self.attachments).push(attachment);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallKind {
    Start,
    Resume,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmCall {
    pub kind: CallKind,
    pub cli_session: Option<String>,
    pub prompt: String,
    pub token: String,
}

type Hook = Box<dyn Fn(&str) + Send + Sync>;

pub struct FakeLlm {
    provider: Mutex<Result<String, String>>,
    replies: Mutex<VecDeque<Result<String, String>>>,
    calls: Mutex<Vec<LlmCall>>,
    forgotten: Mutex<Vec<String>>,
    hook: Mutex<Option<Hook>>,
    started: Mutex<usize>,
}

impl FakeLlm {
    pub fn new() -> Self {
        Self {
            provider: Mutex::new(Ok("claude".to_string())),
            replies: Mutex::new(VecDeque::new()),
            calls: Mutex::new(Vec::new()),
            forgotten: Mutex::new(Vec::new()),
            hook: Mutex::new(None),
            started: Mutex::new(0),
        }
    }

    pub fn set_provider(&self, id: &str) {
        *guard(&self.provider) = Ok(id.to_string());
    }

    pub fn fail_provider(&self, message: &str) {
        *guard(&self.provider) = Err(message.to_string());
    }

    pub fn push_reply(&self, text: &str) {
        guard(&self.replies).push_back(Ok(text.to_string()));
    }

    pub fn push_error(&self, message: &str) {
        guard(&self.replies).push_back(Err(message.to_string()));
    }

    pub fn set_hook(&self, hook: impl Fn(&str) + Send + Sync + 'static) {
        *guard(&self.hook) = Some(Box::new(hook));
    }

    pub fn record_activities(&self, grants: McpGrants, labels: &[&str]) {
        let labels: Vec<String> = labels.iter().map(|label| label.to_string()).collect();
        self.set_hook(move |token| {
            if let Some(grant) = grants.get(token) {
                for label in &labels {
                    grant.sink.record(label.clone());
                }
            }
        });
    }

    pub fn calls(&self) -> Vec<LlmCall> {
        guard(&self.calls).clone()
    }

    pub fn forgotten(&self) -> Vec<String> {
        guard(&self.forgotten).clone()
    }

    fn run(
        &self,
        kind: CallKind,
        cli_session: Option<&str>,
        prompt: String,
        token: &str,
    ) -> Result<String, String> {
        guard(&self.calls).push(LlmCall {
            kind,
            cli_session: cli_session.map(str::to_string),
            prompt,
            token: token.to_string(),
        });
        if let Some(hook) = guard(&self.hook).as_ref() {
            hook(token);
        }
        guard(&self.replies)
            .pop_front()
            .unwrap_or_else(|| Ok("ok".to_string()))
    }
}

impl Default for FakeLlm {
    fn default() -> Self {
        Self::new()
    }
}

impl AssistantLlm for FakeLlm {
    fn provider(&self) -> Result<String, String> {
        guard(&self.provider).clone()
    }

    fn start(&self, prompt: String, token: &str) -> Result<Turn, String> {
        let text = self.run(CallKind::Start, None, prompt, token)?;
        let mut started = guard(&self.started);
        *started += 1;
        Ok(Turn {
            text,
            session: format!("cli-{}", *started),
        })
    }

    fn resume(&self, session: &str, prompt: String, token: &str) -> Result<Turn, String> {
        let text = self.run(CallKind::Resume, Some(session), prompt, token)?;
        Ok(Turn {
            text,
            session: session.to_string(),
        })
    }

    fn forget(&self, session: &str) {
        guard(&self.forgotten).push(session.to_string());
    }
}

#[derive(Default)]
pub struct RecordingEvents {
    events: Mutex<Vec<AssistantEvent>>,
}

impl RecordingEvents {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn events(&self) -> Vec<AssistantEvent> {
        guard(&self.events).clone()
    }
}

impl AssistantEventSink for RecordingEvents {
    fn emit(&self, event: AssistantEvent) {
        guard(&self.events).push(event);
    }
}

fn guard<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}
