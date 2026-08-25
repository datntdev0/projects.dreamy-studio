use crate::features::assistant::grants::ActivitySink;
use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::AssistantEventSink;
use crate::features::assistant::service::AssistantLlm;
use crate::features::assistant::tools::NovelSource;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::pipeline::llm::Turn;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::MutexGuard;

#[derive(Default)]
pub struct FakeNovels {
    novels: Vec<NovelSummary>,
    chapters: HashMap<i64, Vec<ChapterRow>>,
    paragraphs: HashMap<String, Vec<String>>,
}

impl FakeNovels {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_novel(mut self, id: i64, title: &str) -> Self {
        self.novels.push(NovelSummary {
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
        self.chapters.entry(id).or_default();
        self
    }

    pub fn with_chapter(
        mut self,
        novel_id: i64,
        seq: i64,
        title: &str,
        paragraphs: &[&str],
    ) -> Self {
        let id = format!("chapter-{novel_id}-{seq}");
        let words: i64 = paragraphs
            .iter()
            .map(|text| text.split_whitespace().count() as i64)
            .sum();
        let rows = self.chapters.entry(novel_id).or_default();
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
        if let Some(novel) = self.novels.iter_mut().find(|novel| novel.id == novel_id) {
            novel.chapter_count = count;
            novel.word_count += words;
        }
        self.paragraphs
            .insert(id, paragraphs.iter().map(|text| text.to_string()).collect());
        self
    }

    pub fn with_statuses(
        mut self,
        novel_id: i64,
        seq: i64,
        translation: &str,
        analysis: &str,
    ) -> Self {
        if let Some(chapter) = self
            .chapters
            .get_mut(&novel_id)
            .and_then(|rows| rows.iter_mut().find(|row| row.seq == seq))
        {
            chapter.translation_status = translation.to_string();
            chapter.analysis_status = analysis.to_string();
        }
        if let Some(novel) = self.novels.iter_mut().find(|novel| novel.id == novel_id) {
            let rows = &self.chapters[&novel_id];
            novel.translated_count = rows
                .iter()
                .filter(|row| row.translation_status != "none")
                .count() as i64;
            novel.analyzed_count = rows
                .iter()
                .filter(|row| row.analysis_status != "none")
                .count() as i64;
        }
        self
    }
}

impl NovelSource for FakeNovels {
    fn list(&self) -> Result<Vec<NovelSummary>, String> {
        Ok(self.novels.clone())
    }

    fn chapters(&self, novel_id: i64) -> Result<Vec<ChapterRow>, String> {
        self.chapters
            .get(&novel_id)
            .cloned()
            .ok_or_else(|| format!("novel {novel_id} not found"))
    }

    fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> Result<Vec<ParagraphRow>, String> {
        let known = self
            .chapters
            .get(&novel_id)
            .is_some_and(|rows| rows.iter().any(|row| row.id == chapter_id));
        let texts = match self.paragraphs.get(chapter_id) {
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
}

#[derive(Default)]
pub struct RecordingActivities {
    labels: Mutex<Vec<String>>,
}

impl RecordingActivities {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn labels(&self) -> Vec<String> {
        self.labels
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }
}

impl ActivitySink for RecordingActivities {
    fn record(&self, label: String) {
        self.labels
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(label);
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
                    grant.activities.record(label.clone());
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
