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
use crate::features::assistant::models::Decision;
use crate::features::assistant::models::Role;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::models::SessionRecord;
use crate::features::assistant::prompt;
use crate::features::assistant::proposals;
use crate::features::assistant::reply;
use crate::features::assistant::repository::AssistantRepository;
use crate::features::assistant::runs;
use crate::features::assistant::runs::RUN_KIND;
use crate::features::assistant::skills;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::ProjectSource;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::sources::linked_novel;
use crate::features::knowledge::check::KnowledgeIssue;
use crate::features::knowledge::check::check;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::service::parse_lang;
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
        projects: &dyn ProjectSource,
    ) -> AssistantResult<AssistantSession> {
        let scope = checked_scope(scope, novels, projects)?;
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

    pub fn resolve(
        &self,
        session_id: &str,
        message_id: &str,
        item_ids: &[String],
        status: Decision,
        pipeline_id: Option<i64>,
        sources: &Sources,
    ) -> AssistantResult<AssistantSession> {
        let _guard = self.claim(session_id)?;
        let record = self.load(session_id)?;
        let mut message = self
            .message(session_id, message_id)?
            .ok_or_else(|| AssistantError::not_found(format!("message {message_id} not found")))?;
        let outcome = resolve_attachments(
            &record.summary.scope,
            &mut message.attachments,
            Resolution {
                item_ids,
                status,
                pipeline_id,
            },
            sources,
        );
        let _gate = lock(&self.service.gate);
        let db = self.database()?;
        let repo = AssistantRepository::new(db.connection());
        repo.update_attachments(message_id, &message.attachments)?;
        outcome?;
        Ok(AssistantSession {
            summary: record.summary,
            messages: repo.messages(session_id)?,
        })
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
                let scope = &record.summary.scope;
                let linked = linked_novel(scope, sources.projects.as_ref())
                    .map_err(AssistantError::not_found)?;
                let opening = prompt::opening(scope, &history[start..], text, &novels, linked);
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

    fn message(&self, session_id: &str, id: &str) -> AssistantResult<Option<AssistantMessage>> {
        let db = self.database()?;
        Ok(AssistantRepository::new(db.connection()).find_message(session_id, id)?)
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

enum Skill {
    Translation {
        novel: NovelSummary,
        chapter: ChapterRow,
        target: String,
    },
    Knowledge {
        novel: NovelSummary,
        lang: String,
        issues: Vec<KnowledgeIssue>,
    },
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
        let repeatable = kind.as_ref().and_then(Value::as_str) == Some(RUN_KIND);
        let existing = stored
            .iter_mut()
            .find(|item| !repeatable && item.get("kind") == kind.as_ref());
        match existing {
            Some(slot) => *slot = attachment,
            None => stored.push(attachment),
        }
    }

    fn attached(&self, kind: &str) -> usize {
        lock(&self.attachments)
            .iter()
            .filter(|item| item.get("kind").and_then(Value::as_str) == Some(kind))
            .count()
    }
}

struct Resolution<'a> {
    item_ids: &'a [String],
    status: Decision,
    pipeline_id: Option<i64>,
}

fn resolve_attachments(
    scope: &AssistantScope,
    attachments: &mut [Value],
    resolution: Resolution,
    sources: &Sources,
) -> AssistantResult<Vec<AssistantChange>> {
    let Resolution {
        item_ids,
        status,
        pipeline_id,
    } = resolution;
    match (scope.kind, scope.novel_id) {
        (ScopeKind::Novel, Some(novel_id)) => {
            runs::resolve(attachments, item_ids, status, pipeline_id)?;
            proposals::resolve(attachments, item_ids, status, sources, novel_id)
        }
        _ => {
            runs::require_cards(attachments, item_ids)?;
            runs::resolve(attachments, item_ids, status, pipeline_id)?;
            Ok(Vec::new())
        }
    }
}

fn skill_of(
    context: AssistantContext,
    scope: &AssistantScope,
    sources: &Sources,
) -> AssistantResult<Skill> {
    match context {
        AssistantContext::TranslationReview { chapter_id, target } => {
            translation_skill(&chapter_id, &target, scope, sources)
        }
        AssistantContext::KnowledgeReview { lang, issue_ids } => {
            knowledge_skill(&lang, &issue_ids, scope, sources)
        }
    }
}

fn novel_of(scope: &AssistantScope, what: &str) -> AssistantResult<i64> {
    match (scope.kind, scope.novel_id) {
        (ScopeKind::Novel, Some(id)) => Ok(id),
        _ => Err(AssistantError::invalid(format!(
            "{what} needs a novel scope"
        ))),
    }
}

fn summary_of(sources: &Sources, novel_id: i64) -> AssistantResult<NovelSummary> {
    sources
        .novels
        .list()
        .map_err(AssistantError::storage)?
        .into_iter()
        .find(|row| row.id == novel_id)
        .ok_or_else(|| AssistantError::invalid(format!("novel {novel_id} not found")))
}

fn translation_skill(
    chapter_id: &str,
    target: &str,
    scope: &AssistantScope,
    sources: &Sources,
) -> AssistantResult<Skill> {
    let novel_id = novel_of(scope, "a translation review")?;
    let target = TranslationTarget::parse(target)
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
    Ok(Skill::Translation {
        novel: summary_of(sources, novel_id)?,
        chapter,
        target: target.as_str().to_string(),
    })
}

fn knowledge_skill(
    lang: &str,
    issue_ids: &[String],
    scope: &AssistantScope,
    sources: &Sources,
) -> AssistantResult<Skill> {
    let novel_id = novel_of(scope, "a knowledge review")?;
    let lang = parse_lang(lang).map_err(|error| AssistantError::invalid(error.to_string()))?;
    let knowledge = sources
        .knowledge
        .get(novel_id, lang.as_str())
        .map_err(AssistantError::storage)?;
    let issues: Vec<KnowledgeIssue> = check(Ontology::get(), &knowledge.items)
        .into_iter()
        .filter(|issue| issue_ids.contains(&issue.id))
        .collect();
    if issues.is_empty() {
        return Err(AssistantError::invalid(
            "none of the selected issues exist in the knowledge base",
        ));
    }
    Ok(Skill::Knowledge {
        novel: summary_of(sources, novel_id)?,
        lang: lang.as_str().to_string(),
        issues,
    })
}

fn start_prompt(opening: String, skill: Option<&Skill>) -> String {
    match skill {
        Some(skill) => skill_prompt(skill, Some(opening)),
        None => opening,
    }
}

fn resume_prompt(text: &str, skill: Option<&Skill>) -> String {
    match skill {
        Some(skill) => skill_prompt(skill, None),
        None => prompt::follow_up(text),
    }
}

fn skill_prompt(skill: &Skill, opening: Option<String>) -> String {
    match skill {
        Skill::Translation {
            novel,
            chapter,
            target,
        } => skills::review_translation(novel, chapter, target, opening),
        Skill::Knowledge {
            novel,
            lang,
            issues,
        } => skills::review_knowledgebase(novel, lang, issues, opening),
    }
}

fn checked_scope(
    scope: AssistantScope,
    novels: &dyn NovelSource,
    projects: &dyn ProjectSource,
) -> AssistantResult<AssistantScope> {
    match scope.kind {
        ScopeKind::Workspace => Ok(AssistantScope::workspace()),
        ScopeKind::Novel => {
            let id = scope
                .novel_id
                .ok_or_else(|| AssistantError::invalid("a novel scope needs a novelId"))?;
            let known = novels.list().map_err(AssistantError::storage)?;
            if known.iter().any(|novel| novel.id == id) {
                Ok(AssistantScope::novel(id))
            } else {
                Err(AssistantError::invalid(format!("novel {id} not found")))
            }
        }
        ScopeKind::Project => {
            let id = scope
                .project_id
                .ok_or_else(|| AssistantError::invalid("a project scope needs a projectId"))?;
            match projects.get(id).map_err(AssistantError::storage)? {
                Some(_) => Ok(AssistantScope::project(id)),
                None => Err(AssistantError::invalid(format!("project {id} not found"))),
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
