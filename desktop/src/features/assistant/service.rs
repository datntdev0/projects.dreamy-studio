use crate::features::assistant::grants::Grant;
use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantCitation;
use crate::features::assistant::models::AssistantContext;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::AssistantEventSink;
use crate::features::assistant::models::AssistantMessage;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::AssistantSession;
use crate::features::assistant::models::AssistantSessionSummary;
use crate::features::assistant::models::Role;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::models::SessionRecord;
use crate::features::assistant::prompt;
use crate::features::assistant::reply;
use crate::features::assistant::repository::AssistantRepository;
use crate::features::assistant::skills;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::Sources;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::pipeline::llm::ClientError;
use crate::features::pipeline::llm::Extras;
use crate::features::pipeline::llm::LlmClient;
use crate::features::pipeline::llm::Turn;
use crate::features::pipeline::log::RunLog;
use crate::features::pipeline::log::TaskLog;
use crate::features::settings::home;
use crate::features::settings::llm::spec;
use crate::features::settings::repository::SettingsRepository;
use crate::features::translation::models::TranslationTarget;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use chrono::Local;
use chrono::Utc;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use uuid::Uuid;

const FEATURE: &str = "assistant";
const HISTORY_LIMIT: usize = 10;
const TITLE_LIMIT: usize = 48;
const PREVIEW_LIMIT: usize = 120;
const SERVER_DOWN: &str = "assistant server is not running";

pub type McpEndpoint = Arc<Mutex<Option<String>>>;

pub trait AssistantLlm: Send + Sync {
    fn provider(&self) -> Result<String, String>;
    fn start(&self, prompt: String, token: &str) -> Result<Turn, String>;
    fn resume(&self, session: &str, prompt: String, token: &str) -> Result<Turn, String>;
    fn forget(&self, session: &str);
}

pub struct CliAssistantLlm {
    client: LlmClient,
    data_dir: PathBuf,
    logs: Option<PathBuf>,
    endpoint: McpEndpoint,
}

impl CliAssistantLlm {
    pub fn new(
        repository: SettingsRepository,
        logs: Option<PathBuf>,
        endpoint: McpEndpoint,
    ) -> Self {
        let data_dir = repository
            .path()
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        Self {
            client: LlmClient::new(repository, FEATURE, FEATURE),
            data_dir,
            logs,
            endpoint,
        }
    }

    fn extras(&self, token: &str) -> Result<Extras, String> {
        let endpoint = lock(&self.endpoint)
            .clone()
            .ok_or_else(|| SERVER_DOWN.to_string())?;
        let provider = self.provider()?;
        let cli = spec(&provider).ok_or_else(|| format!("unknown CLI {provider}"))?;
        home::provision(cli, &self.data_dir, &endpoint)?;
        Ok(Extras {
            args: home::assistant_args(cli, &self.data_dir),
            env: vec![(home::MCP_TOKEN_ENV.to_string(), token.to_string())],
        })
    }

    fn task_log(&self) -> TaskLog {
        match &self.logs {
            Some(root) => RunLog::create(root, Local::now(), FEATURE, 0).task(0, FEATURE),
            None => RunLog::none().task(0, FEATURE),
        }
    }
}

impl AssistantLlm for CliAssistantLlm {
    fn provider(&self) -> Result<String, String> {
        self.client.provider().map_err(client_message)
    }

    fn start(&self, prompt: String, token: &str) -> Result<Turn, String> {
        let extras = self.extras(token)?;
        self.client
            .start_with(
                FEATURE,
                prompt,
                &self.task_log(),
                &ignore_progress,
                &AtomicBool::new(false),
                &extras,
            )
            .map_err(client_message)
    }

    fn resume(&self, session: &str, prompt: String, token: &str) -> Result<Turn, String> {
        let extras = self.extras(token)?;
        self.client
            .resume_with(
                FEATURE,
                session,
                prompt,
                &self.task_log(),
                &ignore_progress,
                &AtomicBool::new(false),
                &extras,
            )
            .map_err(client_message)
    }

    fn forget(&self, session: &str) {
        self.client.forget(session);
    }
}

#[derive(Clone)]
pub struct AssistantService {
    llm: Arc<dyn AssistantLlm>,
    grants: McpGrants,
    busy: Arc<Mutex<HashSet<String>>>,
    gate: Arc<Mutex<()>>,
}

impl AssistantService {
    pub fn new(llm: Arc<dyn AssistantLlm>, grants: McpGrants) -> Self {
        Self {
            llm,
            grants,
            busy: Arc::new(Mutex::new(HashSet::new())),
            gate: Arc::new(Mutex::new(())),
        }
    }

    pub fn open(&self, session: &WorkspaceSession) -> AssistantResult<AssistantWorkspace> {
        match session.current() {
            Some(current) => Ok(self.workspace(PathBuf::from(current.path))),
            None => Err(AssistantError::no_workspace("no workspace is open")),
        }
    }

    pub fn workspace(&self, dir: PathBuf) -> AssistantWorkspace {
        AssistantWorkspace {
            dir,
            service: self.clone(),
        }
    }
}

#[derive(Clone)]
pub struct AssistantWorkspace {
    dir: PathBuf,
    service: AssistantService,
}

impl AssistantWorkspace {
    pub fn list(&self) -> AssistantResult<Vec<AssistantSessionSummary>> {
        let db = self.database()?;
        Ok(AssistantRepository::new(db.connection()).list()?)
    }

    pub fn get(&self, id: &str) -> AssistantResult<AssistantSession> {
        let db = self.database()?;
        let repo = AssistantRepository::new(db.connection());
        let record = find(&repo, id)?;
        Ok(AssistantSession {
            summary: record.summary,
            messages: repo.messages(id)?,
        })
    }

    pub fn create(
        &self,
        scope: AssistantScope,
        novels: &dyn NovelSource,
    ) -> AssistantResult<AssistantSession> {
        let scope = checked_scope(scope, novels)?;
        let now = now();
        let record = SessionRecord {
            summary: AssistantSessionSummary {
                id: Uuid::new_v4().to_string(),
                title: String::new(),
                scope,
                created_at: now.clone(),
                updated_at: now,
                message_count: 0,
                preview: String::new(),
                edit_granted: false,
            },
            provider: None,
            cli_session: None,
        };
        let _gate = lock(&self.service.gate);
        let db = self.database()?;
        AssistantRepository::new(db.connection()).insert_session(&record)?;
        Ok(AssistantSession {
            summary: record.summary,
            messages: Vec::new(),
        })
    }

    pub fn permit(&self, id: &str, granted: bool) -> AssistantResult<AssistantSession> {
        let _gate = lock(&self.service.gate);
        let db = self.database()?;
        let repo = AssistantRepository::new(db.connection());
        let mut record = find(&repo, id)?;
        record.summary.edit_granted = granted;
        repo.update_session(&record)?;
        Ok(AssistantSession {
            summary: record.summary,
            messages: repo.messages(id)?,
        })
    }

    pub fn delete(&self, id: &str) -> AssistantResult<()> {
        let _guard = self.claim(id)?;
        let _gate = lock(&self.service.gate);
        let db = self.database()?;
        let repo = AssistantRepository::new(db.connection());
        let record = find(&repo, id)?;
        repo.delete(id)?;
        if let Some(cli_session) = &record.cli_session {
            let current = self.service.llm.provider().ok();
            if current.is_some() && current == record.provider {
                self.service.llm.forget(cli_session);
            }
        }
        Ok(())
    }

    pub fn send(
        &self,
        session_id: &str,
        text: &str,
        context: Option<AssistantContext>,
        sink: Arc<dyn AssistantEventSink>,
        sources: &Sources,
    ) -> AssistantResult<AssistantSession> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AssistantError::invalid("message is empty"));
        }
        let _guard = self.claim(session_id)?;
        let record = self.load(session_id)?;
        let skill = match context {
            Some(context) => Some(skill_of(context, &record.summary.scope, sources)?),
            None => None,
        };
        let history = self.history(session_id)?;
        let user = new_message(Role::User, text, Vec::new(), Vec::new());
        self.append(session_id, &user)?;
        let exchange = self.exchange(&record, &history, text, skill.as_ref(), sink, sources);
        match exchange {
            Ok(done) => self.finish(record, user, done),
            Err(error) => {
                self.discard(&user.id);
                Err(error)
            }
        }
    }

    fn exchange(
        &self,
        record: &SessionRecord,
        history: &[AssistantMessage],
        text: &str,
        skill: Option<&Skill>,
        sink: Arc<dyn AssistantEventSink>,
        sources: &Sources,
    ) -> AssistantResult<Exchange> {
        let llm = &self.service.llm;
        let provider = llm.provider().map_err(AssistantError::llm)?;
        let collector = Arc::new(Collector {
            labels: Mutex::new(Vec::new()),
            attachments: Mutex::new(Vec::new()),
            sink,
        });
        let token = self.service.grants.issue(Grant {
            workspace: self.dir.to_string_lossy().into_owned(),
            scope: record.summary.scope.clone(),
            can_edit: record.summary.edit_granted,
            sink: collector.clone(),
        });
        let resumable = match (&record.cli_session, &record.provider) {
            (Some(session), Some(owner)) if *owner == provider => Some(session),
            _ => None,
        };
        let turn = match resumable {
            Some(session) => llm.resume(session, resume_prompt(text, skill), &token),
            None => {
                let start = history.len().saturating_sub(HISTORY_LIMIT);
                let novels = sources.novels.list().unwrap_or_default();
                let opening =
                    prompt::opening(&record.summary.scope, &history[start..], text, &novels);
                llm.start(start_prompt(opening, skill), &token)
            }
        };
        self.service.grants.revoke(&token);
        let turn = turn.map_err(AssistantError::llm)?;
        let (answer, citations) = reply::parse(&turn.text);
        Ok(Exchange {
            provider,
            session: turn.session,
            text: answer,
            citations: reply::verify(citations, sources.novels.as_ref()),
            activities: collector.labels(),
            attachments: collector.attachments(),
        })
    }

    fn finish(
        &self,
        mut record: SessionRecord,
        user: AssistantMessage,
        done: Exchange,
    ) -> AssistantResult<AssistantSession> {
        let mut assistant =
            new_message(Role::Assistant, &done.text, done.activities, done.citations);
        assistant.attachments = done.attachments;
        let id = record.summary.id.clone();
        let _gate = lock(&self.service.gate);
        let db = self.database()?;
        let repo = AssistantRepository::new(db.connection());
        record.summary.edit_granted = find(&repo, &id)?.summary.edit_granted;
        repo.append(&id, &assistant)?;
        let messages = repo.messages(&id)?;
        if record.summary.title.is_empty() {
            record.summary.title = clip(&user.text, TITLE_LIMIT);
        }
        record.provider = Some(done.provider);
        record.cli_session = Some(done.session);
        record.summary.message_count = messages.len() as i64;
        record.summary.preview = clip(&assistant.text, PREVIEW_LIMIT);
        record.summary.updated_at = now();
        repo.update_session(&record)?;
        Ok(AssistantSession {
            summary: record.summary,
            messages,
        })
    }

    fn load(&self, id: &str) -> AssistantResult<SessionRecord> {
        let db = self.database()?;
        find(&AssistantRepository::new(db.connection()), id)
    }

    fn history(&self, id: &str) -> AssistantResult<Vec<AssistantMessage>> {
        let db = self.database()?;
        Ok(AssistantRepository::new(db.connection()).messages(id)?)
    }

    fn append(&self, session_id: &str, message: &AssistantMessage) -> AssistantResult<()> {
        let _gate = lock(&self.service.gate);
        let db = self.database()?;
        AssistantRepository::new(db.connection()).append(session_id, message)?;
        Ok(())
    }

    fn discard(&self, message_id: &str) {
        let _gate = lock(&self.service.gate);
        if let Ok(db) = self.database() {
            let _ = AssistantRepository::new(db.connection()).remove_message(message_id);
        }
    }

    fn claim(&self, id: &str) -> AssistantResult<BusyGuard> {
        let mut busy = lock(&self.service.busy);
        if !busy.insert(id.to_string()) {
            return Err(AssistantError::busy("the session is already answering"));
        }
        Ok(BusyGuard {
            busy: self.service.busy.clone(),
            id: id.to_string(),
        })
    }

    fn database(&self) -> AssistantResult<Database> {
        Database::open_read_write(&self.dir.join(WORKSPACE_DB_FILE))
            .map_err(|error| AssistantError::storage(error.to_string()))
    }
}

struct Exchange {
    provider: String,
    session: String,
    text: String,
    citations: Vec<AssistantCitation>,
    activities: Vec<String>,
    attachments: Vec<Value>,
}

struct Skill {
    novel: NovelSummary,
    chapter: ChapterRow,
    target: String,
}

struct BusyGuard {
    busy: Arc<Mutex<HashSet<String>>>,
    id: String,
}

impl Drop for BusyGuard {
    fn drop(&mut self) {
        lock(&self.busy).remove(&self.id);
    }
}

struct Collector {
    labels: Mutex<Vec<String>>,
    attachments: Mutex<Vec<Value>>,
    sink: Arc<dyn AssistantEventSink>,
}

impl Collector {
    fn labels(&self) -> Vec<String> {
        lock(&self.labels).clone()
    }

    fn attachments(&self) -> Vec<Value> {
        lock(&self.attachments).clone()
    }
}

impl TurnSink for Collector {
    fn record(&self, label: String) {
        lock(&self.labels).push(label.clone());
        self.sink.emit(AssistantEvent::Activity { label });
    }

    fn changed(&self, change: AssistantChange) {
        self.sink.emit(AssistantEvent::Changed(change));
    }

    fn attach(&self, attachment: Value) {
        let mut stored = lock(&self.attachments);
        let kind = attachment.get("kind").cloned();
        match stored
            .iter_mut()
            .find(|item| item.get("kind") == kind.as_ref())
        {
            Some(slot) => *slot = attachment,
            None => stored.push(attachment),
        }
    }
}

fn skill_of(
    context: AssistantContext,
    scope: &AssistantScope,
    sources: &Sources,
) -> AssistantResult<Skill> {
    let AssistantContext::TranslationReview { chapter_id, target } = context;
    let novel_id = match (scope.kind, scope.novel_id) {
        (ScopeKind::Novel, Some(id)) => id,
        _ => {
            return Err(AssistantError::invalid(
                "a translation review needs a novel scope",
            ));
        }
    };
    let target = TranslationTarget::parse(&target)
        .ok_or_else(|| AssistantError::invalid(format!("unsupported target '{target}'")))?;
    let chapter = sources
        .novels
        .chapters(novel_id)
        .map_err(AssistantError::storage)?
        .into_iter()
        .find(|row| row.id == chapter_id)
        .ok_or_else(|| {
            AssistantError::invalid(format!("chapter {chapter_id} is not in novel {novel_id}"))
        })?;
    let book = sources
        .translation
        .get(novel_id, target.as_str())
        .map_err(AssistantError::storage)?;
    if !book.chapters.contains_key(&chapter.id) {
        return Err(AssistantError::invalid(format!(
            "chapter {} has no {} translation yet",
            chapter.seq,
            target.as_str()
        )));
    }
    let novel = sources
        .novels
        .list()
        .map_err(AssistantError::storage)?
        .into_iter()
        .find(|row| row.id == novel_id)
        .ok_or_else(|| AssistantError::invalid(format!("novel {novel_id} not found")))?;
    Ok(Skill {
        novel,
        chapter,
        target: target.as_str().to_string(),
    })
}

fn start_prompt(opening: String, skill: Option<&Skill>) -> String {
    match skill {
        Some(skill) => {
            skills::review_translation(&skill.novel, &skill.chapter, &skill.target, Some(opening))
        }
        None => opening,
    }
}

fn resume_prompt(text: &str, skill: Option<&Skill>) -> String {
    match skill {
        Some(skill) => {
            skills::review_translation(&skill.novel, &skill.chapter, &skill.target, None)
        }
        None => prompt::follow_up(text),
    }
}

fn checked_scope(
    scope: AssistantScope,
    novels: &dyn NovelSource,
) -> AssistantResult<AssistantScope> {
    match scope.kind {
        ScopeKind::Workspace => Ok(AssistantScope {
            kind: ScopeKind::Workspace,
            novel_id: None,
        }),
        ScopeKind::Novel => {
            let id = scope
                .novel_id
                .ok_or_else(|| AssistantError::invalid("a novel scope needs a novelId"))?;
            let known = novels.list().map_err(AssistantError::storage)?;
            if known.iter().any(|novel| novel.id == id) {
                Ok(AssistantScope {
                    kind: ScopeKind::Novel,
                    novel_id: Some(id),
                })
            } else {
                Err(AssistantError::invalid(format!("novel {id} not found")))
            }
        }
    }
}

fn find(repo: &AssistantRepository<'_>, id: &str) -> AssistantResult<SessionRecord> {
    repo.find(id)?
        .ok_or_else(|| AssistantError::not_found(format!("session {id} not found")))
}

fn new_message(
    role: Role,
    text: &str,
    activities: Vec<String>,
    citations: Vec<AssistantCitation>,
) -> AssistantMessage {
    AssistantMessage {
        id: Uuid::new_v4().to_string(),
        role,
        text: text.to_string(),
        created_at: now(),
        activities,
        citations,
        attachments: Vec::new(),
    }
}

fn clip(text: &str, limit: usize) -> String {
    let line = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    if line.chars().count() <= limit {
        return line.to_string();
    }
    let head: String = line.chars().take(limit - 1).collect();
    format!("{}…", head.trim_end())
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn ignore_progress(_percent: u8) {}

fn client_message(error: ClientError) -> String {
    match error {
        ClientError::Cancelled => "the assistant run was cancelled".to_string(),
        ClientError::Failed(message) => message,
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

#[cfg(test)]
#[path = "../../../test/features/assistant/service.test.rs"]
mod tests;
