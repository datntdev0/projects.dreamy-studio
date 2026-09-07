use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::grants::next_card_number;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::AssistantEventSink;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::service::AssistantLlm;
use crate::features::assistant::sources::AudiobookSource;
use crate::features::assistant::sources::KnowledgeSource;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::PipelineSource;
use crate::features::assistant::sources::ProjectSource;
use crate::features::assistant::sources::ScriptSource;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::sources::TranslationSource;
use crate::features::assistant::sources::VoiceSource;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::call;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::audiobook::models::UnitAudio;
use crate::features::knowledge::models::AnalyzedChapter;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeEvidence;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::ontology::Ontology;
use crate::features::library::models::AssetRights;
use crate::features::library::models::LibraryVoice;
use crate::features::library::models::VoiceEngineKind;
use crate::features::library::models::VoiceGender;
use crate::features::library::models::VoiceSource as VoiceOrigin;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::pipeline::llm::Turn;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskStatus;
use crate::features::project::models::ProjectModuleState;
use crate::features::project::models::ProjectPatch;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::models::UnitMeta;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::service::ChapterTranslation;
use crate::features::translation::service::DictChange;
use crate::features::translation::service::NovelTranslation;
use crate::features::translation::service::PassageTranslation;
use crate::features::translation::warnings::TranslationWarning;
use crate::testing::script::chapter;
use crate::testing::script::linked_unit;
use crate::testing::script::script;
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
    analyzed: BTreeMap<i64, AnalyzedChapter>,
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
                analyzed: BTreeMap::new(),
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

    pub fn with_analyzed(self, seq: i64, stale: bool) -> Self {
        guard(&self.state).analyzed.insert(
            seq,
            AnalyzedChapter {
                at: "2026-01-01T00:00:00Z".to_string(),
                entities: 4,
                facts: 6,
                stale,
            },
        );
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
        let items = guard(&self.state).items.clone();
        self.snapshot_of(lang, items)
    }

    fn snapshot_of(&self, lang: &str, items: Vec<KnowledgeItem>) -> WireKnowledge {
        WireKnowledge {
            lang: lang.to_string(),
            ontology: Ontology::get().view(),
            items,
            analyzed: guard(&self.state).analyzed.clone(),
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
    sources_with_project_data(
        novels,
        knowledge,
        translation,
        projects,
        &FakeScripts::default(),
        &FakeAudiobooks::default(),
    )
}

pub fn sources_with_project_data(
    novels: &FakeNovels,
    knowledge: &FakeKnowledge,
    translation: &FakeTranslation,
    projects: &FakeProjects,
    scripts: &FakeScripts,
    audiobooks: &FakeAudiobooks,
) -> Sources {
    sources_with_pipelines(
        novels,
        knowledge,
        translation,
        projects,
        (scripts, audiobooks),
        (&FakePipelines::default(), &FakeVoices::default()),
    )
}

pub fn sources_with_pipelines(
    novels: &FakeNovels,
    knowledge: &FakeKnowledge,
    translation: &FakeTranslation,
    projects: &FakeProjects,
    project_data: (&FakeScripts, &FakeAudiobooks),
    extras: (&FakePipelines, &FakeVoices),
) -> Sources {
    Sources {
        novels: Box::new(novels.clone()),
        knowledge: Box::new(knowledge.clone()),
        translation: Box::new(translation.clone()),
        projects: Box::new(projects.clone()),
        scripts: Box::new(project_data.0.clone()),
        audiobooks: Box::new(project_data.1.clone()),
        voices: Box::new(extras.1.clone()),
        pipelines: Box::new(extras.0.clone()),
    }
}

#[derive(Default)]
struct PipelineState {
    runs: Vec<PipelineSnapshot>,
    cancelled: Vec<i64>,
}

#[derive(Clone, Default)]
pub struct FakePipelines {
    state: Arc<Mutex<PipelineState>>,
}

impl FakePipelines {
    pub fn with_runs(runs: Vec<PipelineSnapshot>) -> Self {
        let pipelines = Self::default();
        guard(&pipelines.state).runs = runs;
        pipelines
    }

    pub fn cancelled(&self) -> Vec<i64> {
        guard(&self.state).cancelled.clone()
    }
}

impl PipelineSource for FakePipelines {
    fn history(
        &self,
        owner: Option<JobOwner>,
        limit: i64,
    ) -> Result<Vec<PipelineSnapshot>, String> {
        let mut runs: Vec<PipelineSnapshot> = guard(&self.state)
            .runs
            .iter()
            .filter(|run| owner.is_none_or(|owner| owner_of(run) == Some(owner)))
            .cloned()
            .collect();
        runs.sort_by(|left, right| right.id.cmp(&left.id));
        runs.truncate(usize::try_from(limit).unwrap_or_default());
        Ok(runs)
    }

    fn snapshot(&self, pipeline_id: i64) -> Result<Option<PipelineSnapshot>, String> {
        Ok(guard(&self.state)
            .runs
            .iter()
            .find(|run| run.id == pipeline_id)
            .cloned())
    }

    fn cancel(&self, pipeline_id: i64) -> bool {
        guard(&self.state).cancelled.push(pipeline_id);
        true
    }
}

fn owner_of(run: &PipelineSnapshot) -> Option<JobOwner> {
    match (run.novel_id, run.project_id) {
        (Some(id), None) => Some(JobOwner::Novel(id)),
        (None, Some(id)) => Some(JobOwner::Project(id)),
        _ => None,
    }
}

pub fn pipeline_run(
    id: i64,
    owner: JobOwner,
    kind: &str,
    status: PipelineStatus,
) -> PipelineSnapshot {
    PipelineSnapshot {
        id,
        novel_id: match owner {
            JobOwner::Novel(novel_id) => Some(novel_id),
            JobOwner::Project(_) => None,
        },
        project_id: match owner {
            JobOwner::Project(project_id) => Some(project_id),
            JobOwner::Novel(_) => None,
        },
        kind: kind.to_string(),
        target: "VI".to_string(),
        status,
        total: 2,
        done: 1,
        failed: 0,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        started_at: None,
        finished_at: None,
        tasks: vec![PipelineTask {
            id: id * 10,
            chapter_id: "chapter-1-1".to_string(),
            segment_id: None,
            passage: None,
            status: TaskStatus::Running,
            progress: 40,
            error: String::new(),
            started_at: None,
            finished_at: None,
        }],
    }
}

#[derive(Default)]
struct ScriptWrites {
    units: Vec<(ScriptUnit, i64)>,
    casts: Vec<Vec<CastMember>>,
    order: Vec<&'static str>,
    fail_units: bool,
}

#[derive(Clone, Default)]
pub struct FakeScripts {
    pub chapters: Vec<ProjectChapter>,
    pub script: Option<Script>,
    pub modules: Vec<ProjectModuleState>,
    writes: Arc<Mutex<ScriptWrites>>,
}

impl FakeScripts {
    pub fn with_script(script: Script, chapters: Vec<ProjectChapter>) -> Self {
        Self {
            chapters,
            script: Some(script),
            modules: Vec::new(),
            writes: Arc::default(),
        }
    }

    pub fn with_chapters(chapters: Vec<ProjectChapter>) -> Self {
        Self {
            chapters,
            ..Self::default()
        }
    }

    pub fn failing_unit_saves(self) -> Self {
        guard(&self.writes).fail_units = true;
        self
    }

    pub fn saved_units(&self) -> Vec<(ScriptUnit, i64)> {
        guard(&self.writes).units.clone()
    }

    pub fn saved_casts(&self) -> Vec<Vec<CastMember>> {
        guard(&self.writes).casts.clone()
    }

    pub fn write_order(&self) -> Vec<&'static str> {
        guard(&self.writes).order.clone()
    }
}

impl ScriptSource for FakeScripts {
    fn chapters(&self, _project_id: i64) -> Result<Vec<ProjectChapter>, String> {
        Ok(self.chapters.clone())
    }

    fn script(&self, _project_id: i64) -> Result<Option<Script>, String> {
        Ok(self.script.clone())
    }

    fn modules(&self, _project_id: i64) -> Result<Vec<ProjectModuleState>, String> {
        Ok(self.modules.clone())
    }

    fn unit_save(&self, _project_id: i64, unit: ScriptUnit, seq: i64) -> Result<(), String> {
        let mut writes = guard(&self.writes);
        if writes.fail_units {
            return Err("disk is full".to_string());
        }
        writes.order.push("unit");
        writes.units.push((unit, seq));
        Ok(())
    }

    fn cast_save(&self, _project_id: i64, extra_cast: Vec<CastMember>) -> Result<(), String> {
        let mut writes = guard(&self.writes);
        writes.order.push("cast");
        writes.casts.push(extra_cast);
        Ok(())
    }
}

#[derive(Default)]
struct AudioWrites {
    configs: Vec<AudiobookConfig>,
    mixes: Vec<MixSettings>,
    flags: Vec<(String, String, String)>,
}

#[derive(Clone, Default)]
pub struct FakeAudiobooks {
    pub book: Option<Audiobook>,
    writes: Arc<Mutex<AudioWrites>>,
}

impl FakeAudiobooks {
    pub fn with_book(book: Audiobook) -> Self {
        Self {
            book: Some(book),
            writes: Arc::default(),
        }
    }

    pub fn saved_configs(&self) -> Vec<AudiobookConfig> {
        guard(&self.writes).configs.clone()
    }

    pub fn saved_mixes(&self) -> Vec<MixSettings> {
        guard(&self.writes).mixes.clone()
    }

    pub fn flag_calls(&self) -> Vec<(String, String, String)> {
        guard(&self.writes).flags.clone()
    }
}

impl AudiobookSource for FakeAudiobooks {
    fn book(&self, _project_id: i64) -> Result<Option<Audiobook>, String> {
        Ok(self.book.clone())
    }

    fn config_save(&self, _project_id: i64, config: AudiobookConfig) -> Result<(), String> {
        guard(&self.writes).configs.push(config);
        Ok(())
    }

    fn mix_save(&self, _project_id: i64, mix: MixSettings) -> Result<MixSettings, String> {
        let mix = mix.clamped();
        guard(&self.writes).mixes.push(mix);
        Ok(mix)
    }

    fn flag_set(
        &self,
        _project_id: i64,
        unit_id: &str,
        block_id: &str,
        flag: &str,
    ) -> Result<AudioRecord, String> {
        let record = self
            .book
            .as_ref()
            .and_then(|book| book.unit(unit_id))
            .and_then(|unit| unit.audio.get(block_id))
            .ok_or_else(|| format!("block {block_id} has no audio record"))?;
        guard(&self.writes).flags.push((
            unit_id.to_string(),
            block_id.to_string(),
            flag.trim().to_string(),
        ));
        Ok(AudioRecord {
            flag: flag.trim().to_string(),
            ..record.clone()
        })
    }
}

#[derive(Clone, Default)]
pub struct FakeVoices {
    voices: Vec<LibraryVoice>,
}

impl FakeVoices {
    pub fn with(voices: Vec<LibraryVoice>) -> Self {
        Self { voices }
    }
}

impl VoiceSource for FakeVoices {
    fn list(&self) -> Result<Vec<LibraryVoice>, String> {
        Ok(self.voices.clone())
    }
}

pub fn voice_fixture(id: i64, name: &str, gender: VoiceGender) -> LibraryVoice {
    LibraryVoice {
        id,
        name: name.to_string(),
        description: String::new(),
        engine: "edge-read-aloud".to_string(),
        engine_kind: VoiceEngineKind::Cloud,
        source: VoiceOrigin::Preset,
        language: "vi".to_string(),
        gender,
        preset: Some(format!("preset-{id}")),
        reference_kind: None,
        reference_sound_id: None,
        reference_name: String::new(),
        prompt: String::new(),
        sample_text: String::new(),
        rights: AssetRights::Own,
        collection_id: None,
        tags: Vec::new(),
        created_at: "2026-11-01T00:00:00+00:00".to_string(),
        updated_at: "2026-11-01T00:00:00+00:00".to_string(),
    }
}

pub fn project_chapter_fixture() -> ProjectChapter {
    chapter("c1", 1)
}

pub fn script_block(id: &str, kind: &str, text: &str, who: &str) -> ScriptBlock {
    ScriptBlock {
        id: id.to_string(),
        kind: kind.to_string(),
        text: text.to_string(),
        who: who.to_string(),
        ..ScriptBlock::default()
    }
}

pub fn script_fixture() -> Script {
    let blocks = vec![
        script_block("b1", "narration", "The gate opened at dawn.", ""),
        script_block("b2", "dialogue", "Who goes there?", "kb-1"),
        script_block("b3", "dialogue", "A friend.", "x1"),
    ];
    let unit = ScriptUnit {
        no: 1,
        ch: Some(1),
        title: "Title 1".to_string(),
        meta: Some(UnitMeta {
            blocks: 3,
            words: 9,
        }),
        blocks: Some(blocks),
        updated: "2026-01-01T00:00:00Z".to_string(),
        ..linked_unit("c1")
    };
    script(vec![unit])
}

pub fn audiobook_fixture() -> Audiobook {
    let record = AudioRecord {
        text: "Who goes there?".to_string(),
        speaker: Some("kb-1".to_string()),
        voice: Some(7),
        speed: 1.0,
        paren: String::new(),
        dur: 1.5,
        at: "2026-01-01T00:00:00Z".to_string(),
        flag: String::new(),
    };
    Audiobook {
        voices: BTreeMap::from([(
            "kb-1".to_string(),
            SpeakerVoice {
                voice: Some(7),
                speed: 1.0,
            },
        )]),
        mix: MixSettings::default(),
        units: BTreeMap::from([(
            "c1".to_string(),
            UnitAudio {
                audio: BTreeMap::from([("b2".to_string(), record)]),
                meta: None,
            },
        )]),
    }
}

#[derive(Clone, Default)]
pub struct FakeProjects {
    projects: Arc<Mutex<Vec<ProjectSummary>>>,
    updates: Arc<Mutex<Vec<(i64, ProjectPatch)>>>,
}

impl FakeProjects {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with(projects: Vec<ProjectSummary>) -> Self {
        Self {
            projects: Arc::new(Mutex::new(projects)),
            updates: Arc::default(),
        }
    }

    pub fn updates(&self) -> Vec<(i64, ProjectPatch)> {
        guard(&self.updates).clone()
    }
}

impl ProjectSource for FakeProjects {
    fn list(&self) -> Result<Vec<ProjectSummary>, String> {
        Ok(guard(&self.projects).clone())
    }

    fn update(&self, project_id: i64, patch: ProjectPatch) -> Result<ProjectSummary, String> {
        let mut projects = guard(&self.projects);
        let project = projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| format!("project {project_id} does not exist"))?;
        if let Some(name) = patch.name.as_deref() {
            project.name = name.trim().to_string();
        }
        if let Some(description) = patch.description.as_deref() {
            project.description = description.trim().to_string();
        }
        let updated = project.clone();
        guard(&self.updates).push((project_id, patch));
        Ok(updated)
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

    fn attached(&self, kind: &str) -> usize {
        guard(&self.attachments)
            .iter()
            .filter(|item| item["kind"] == kind)
            .count()
    }

    fn next_card(&self, kind: &str) -> usize {
        next_card_number(&guard(&self.attachments), kind)
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

pub struct ToolWorld {
    pub novels: FakeNovels,
    pub knowledge: FakeKnowledge,
    pub translation: FakeTranslation,
    pub projects: FakeProjects,
    pub scripts: FakeScripts,
    pub audiobooks: FakeAudiobooks,
    pub pipelines: FakePipelines,
    pub voices: FakeVoices,
    pub linked_novel: Option<i64>,
}

impl ToolWorld {
    pub fn new() -> Self {
        Self {
            novels: FakeNovels::new()
                .with_novel(1, "First")
                .with_chapter(1, 1, "One", &["a one", "a two", "a three"])
                .with_chapter(1, 2, "Two", &["b one", "b two"])
                .with_chapter(1, 3, "Three", &[])
                .with_novel(2, "Second")
                .with_chapter(2, 1, "Other", &["c one"]),
            knowledge: FakeKnowledge::new()
                .with_entity("kb-1", "character", "Lin Mo", &[], &[], &[1])
                .with_analyzed(1, false)
                .with_analyzed(2, true),
            translation: FakeTranslation::new().with_translated_chapter(
                1,
                "VI",
                "chapter-1-1",
                "Một",
                &["một", "hai"],
            ),
            projects: FakeProjects::with(vec![
                project_summary(5, Some(1)),
                project_summary(6, None),
            ]),
            scripts: FakeScripts::with_script(script_fixture(), vec![project_chapter_fixture()]),
            audiobooks: FakeAudiobooks::with_book(audiobook_fixture()),
            pipelines: FakePipelines::default(),
            voices: FakeVoices::with(vec![
                voice_fixture(7, "Mai Anh", VoiceGender::Female),
                voice_fixture(8, "Hai Dang", VoiceGender::Male),
            ]),
            linked_novel: Some(1),
        }
    }

    pub fn sources(&self) -> Sources {
        sources_with_pipelines(
            &self.novels,
            &self.knowledge,
            &self.translation,
            &self.projects,
            (&self.scripts, &self.audiobooks),
            (&self.pipelines, &self.voices),
        )
    }

    pub fn run(
        &self,
        name: &str,
        args: serde_json::Value,
        scope: &AssistantScope,
    ) -> (Result<serde_json::Value, String>, RecordingSink) {
        let sink = RecordingSink::new();
        let result = self.run_in(&sink, name, args, scope);
        (result, sink)
    }

    pub fn run_editing(
        &self,
        name: &str,
        args: serde_json::Value,
        scope: &AssistantScope,
    ) -> (Result<serde_json::Value, String>, RecordingSink) {
        let sink = RecordingSink::new();
        let result = self.run_with(&sink, true, name, args, scope);
        (result, sink)
    }

    pub fn run_in(
        &self,
        sink: &RecordingSink,
        name: &str,
        args: serde_json::Value,
        scope: &AssistantScope,
    ) -> Result<serde_json::Value, String> {
        self.run_with(sink, false, name, args, scope)
    }

    fn run_with(
        &self,
        sink: &RecordingSink,
        can_edit: bool,
        name: &str,
        args: serde_json::Value,
        scope: &AssistantScope,
    ) -> Result<serde_json::Value, String> {
        let ctx = ToolContext {
            scope,
            linked_novel: self.linked_novel,
            can_edit,
            sink,
        };
        let output = call(name, &args, &ctx, &self.sources())?;
        Ok(serde_json::from_str(&output.text).unwrap())
    }
}

impl Default for ToolWorld {
    fn default() -> Self {
        Self::new()
    }
}
