use super::*;
use crate::features::assistant::models::AssistantErrorCode;
use crate::features::assistant::models::AssistantEvent;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::assistant::CallKind;
use crate::testing::assistant::FakeLlm;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::RecordingEvents;
use serde_json::json;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    llm: Arc<FakeLlm>,
    grants: McpGrants,
    workspace: AssistantWorkspace,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let mut database = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        database.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    drop(database);
    let llm = Arc::new(FakeLlm::new());
    let grants = McpGrants::new();
    let service = AssistantService::new(llm.clone(), grants.clone());
    let workspace = service.workspace(dir.path().to_path_buf());
    Fixture {
        _dir: dir,
        llm,
        grants,
        workspace,
    }
}

fn workspace_scope() -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: None,
    }
}

fn novels() -> FakeNovels {
    FakeNovels::new().with_novel(1, "Alpha").with_chapter(
        1,
        1,
        "One",
        &["The hero drew his sword.", "Rain fell."],
    )
}

fn events() -> Arc<RecordingEvents> {
    Arc::new(RecordingEvents::new())
}

fn send(
    fixture: &Fixture,
    id: &str,
    text: &str,
    source: &FakeNovels,
) -> AssistantResult<AssistantSession> {
    fixture.workspace.send(id, text, None, events(), source)
}

fn code(result: AssistantResult<AssistantSession>) -> AssistantErrorCode {
    result.unwrap_err().code
}

#[test]
fn open_without_a_workspace_is_no_workspace() {
    let service = AssistantService::new(Arc::new(FakeLlm::new()), McpGrants::new());
    let error = service.open(&WorkspaceSession::new()).err().unwrap();
    assert_eq!(error.code, AssistantErrorCode::NoWorkspace);
}

#[test]
fn create_rejects_a_novel_scope() {
    let fixture = fixture();
    let scope = AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(1),
    };
    let error = fixture.workspace.create(scope).unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::Invalid);
    assert!(fixture.workspace.list().unwrap().is_empty());
}

#[test]
fn create_makes_an_empty_session_hidden_from_the_list() {
    let fixture = fixture();
    let session = fixture.workspace.create(workspace_scope()).unwrap();
    assert!(session.summary.title.is_empty());
    assert_eq!(session.summary.message_count, 0);
    assert!(session.messages.is_empty());
    assert!(fixture.workspace.list().unwrap().is_empty());
    let loaded = fixture.workspace.get(&session.summary.id).unwrap();
    assert_eq!(loaded, session);
}

#[test]
fn get_unknown_session_is_not_found() {
    let fixture = fixture();
    let error = fixture.workspace.get("missing").unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::NotFound);
}

#[test]
fn send_sets_title_and_preview_and_starts_then_resumes() {
    let fixture = fixture();
    let source = novels();
    fixture.llm.push_reply("First answer\nmore detail");
    fixture.llm.push_reply("Second answer");
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    let first = send(
        &fixture,
        &id,
        "  Which novels exist?\nPlease list.",
        &source,
    )
    .unwrap();
    assert_eq!(first.summary.title, "Which novels exist?");
    assert_eq!(first.summary.preview, "First answer");
    assert_eq!(first.summary.message_count, 2);
    assert_eq!(first.messages[0].role, Role::User);
    assert_eq!(first.messages[1].role, Role::Assistant);
    assert_eq!(first.messages[1].text, "First answer\nmore detail");
    let second = send(&fixture, &id, "And chapters?", &source).unwrap();
    assert_eq!(second.summary.title, "Which novels exist?");
    assert_eq!(second.summary.preview, "Second answer");
    assert_eq!(second.summary.message_count, 4);
    let calls = fixture.llm.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].kind, CallKind::Start);
    assert!(calls[0].prompt.contains("Alpha"));
    assert!(calls[0].prompt.contains("Which novels exist?"));
    assert_eq!(calls[1].kind, CallKind::Resume);
    assert_eq!(calls[1].cli_session.as_deref(), Some("cli-1"));
    assert!(calls[1].prompt.contains("And chapters?"));
    assert!(!calls[1].prompt.contains("Alpha"));
    let listed = fixture.workspace.list().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].message_count, 4);
}

#[test]
fn long_title_and_preview_are_trimmed_with_an_ellipsis() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    fixture.llm.push_reply(&"b".repeat(300));
    let session = send(&fixture, &id, &"a".repeat(100), &novels()).unwrap();
    assert_eq!(session.summary.title.chars().count(), TITLE_LIMIT);
    assert!(session.summary.title.ends_with('…'));
    assert_eq!(session.summary.preview.chars().count(), PREVIEW_LIMIT);
    assert!(session.summary.preview.ends_with('…'));
    assert_eq!(session.messages[0].text, "a".repeat(100));
}

#[test]
fn provider_switch_starts_a_new_cli_session_with_history() {
    let fixture = fixture();
    let source = novels();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    send(&fixture, &id, "question one", &source).unwrap();
    send(&fixture, &id, "question two", &source).unwrap();
    fixture.llm.set_provider("codex");
    send(&fixture, &id, "question three", &source).unwrap();
    send(&fixture, &id, "question four", &source).unwrap();
    let calls = fixture.llm.calls();
    assert_eq!(calls[1].kind, CallKind::Resume);
    assert_eq!(calls[2].kind, CallKind::Start);
    assert!(calls[2].prompt.contains("question one"));
    assert!(calls[2].prompt.contains("question two"));
    assert!(calls[2].prompt.contains("question three"));
    assert_eq!(calls[3].kind, CallKind::Resume);
    assert_eq!(calls[3].cli_session.as_deref(), Some("cli-2"));
}

#[test]
fn history_in_the_opening_prompt_is_limited_to_the_last_ten_messages() {
    let fixture = fixture();
    let source = novels();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    for index in 1..=7 {
        send(&fixture, &id, &format!("ask-{index}"), &source).unwrap();
    }
    fixture.llm.set_provider("codex");
    send(&fixture, &id, "latest", &source).unwrap();
    let prompt = fixture.llm.calls().pop().unwrap().prompt;
    assert!(!prompt.contains("ask-2"));
    assert!(prompt.contains("ask-3"));
    assert!(prompt.contains("ask-7"));
}

#[test]
fn non_null_context_is_invalid() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    let result = fixture.workspace.send(
        &id,
        "hello",
        Some(json!({ "kind": "review" })),
        events(),
        &novels(),
    );
    assert_eq!(code(result), AssistantErrorCode::Invalid);
    let null = fixture
        .workspace
        .send(&id, "hello", Some(json!(null)), events(), &novels());
    assert!(null.is_ok());
}

#[test]
fn empty_text_is_invalid_and_calls_nothing() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    assert_eq!(
        code(send(&fixture, &id, "  \n ", &novels())),
        AssistantErrorCode::Invalid
    );
    assert!(fixture.llm.calls().is_empty());
}

#[test]
fn unknown_session_is_not_found() {
    let fixture = fixture();
    assert_eq!(
        code(send(&fixture, "missing", "hello", &novels())),
        AssistantErrorCode::NotFound
    );
    assert!(fixture.llm.calls().is_empty());
}

#[test]
fn concurrent_send_is_busy_and_releases_afterwards() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    let inner = Arc::new(Mutex::new(None));
    let workspace = fixture.workspace.clone();
    let session_id = id.clone();
    let seen = inner.clone();
    fixture.llm.set_hook(move |_token| {
        let source = FakeNovels::new();
        let result = workspace.send(&session_id, "again", None, events(), &source);
        *seen.lock().unwrap() = Some(code(result));
    });
    send(&fixture, &id, "first", &novels()).unwrap();
    assert_eq!(*inner.lock().unwrap(), Some(AssistantErrorCode::Busy));
    let session = send(&fixture, &id, "second", &novels()).unwrap();
    assert_eq!(session.summary.message_count, 4);
}

#[test]
fn busy_guard_is_released_after_a_failure() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    fixture.llm.push_error("boom");
    assert!(send(&fixture, &id, "first", &novels()).is_err());
    assert!(send(&fixture, &id, "second", &novels()).is_ok());
}

#[test]
fn llm_failure_removes_the_user_message_and_keeps_the_record() {
    let fixture = fixture();
    let source = novels();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    send(&fixture, &id, "first", &source).unwrap();
    let before = fixture.workspace.get(&id).unwrap();
    fixture.llm.push_error("CLI exploded");
    let error = send(&fixture, &id, "second", &source).unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::Llm);
    assert!(error.detail.contains("CLI exploded"));
    let after = fixture.workspace.get(&id).unwrap();
    assert_eq!(after, before);
    assert_eq!(after.messages.len(), 2);
    send(&fixture, &id, "second", &source).unwrap();
    assert_eq!(fixture.workspace.get(&id).unwrap().messages.len(), 4);
}

#[test]
fn llm_failure_on_the_first_turn_leaves_an_empty_unstarted_session() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    fixture.llm.push_error("no provider");
    assert_eq!(
        code(send(&fixture, &id, "first", &novels())),
        AssistantErrorCode::Llm
    );
    let session = fixture.workspace.get(&id).unwrap();
    assert!(session.messages.is_empty());
    assert!(session.summary.title.is_empty());
    send(&fixture, &id, "retry", &novels()).unwrap();
    assert_eq!(fixture.llm.calls()[1].kind, CallKind::Start);
}

#[test]
fn provider_failure_is_an_llm_error_and_rolls_back() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    fixture.llm.fail_provider("no provider is set");
    let error = send(&fixture, &id, "first", &novels()).unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::Llm);
    assert_eq!(error.detail, "no provider is set");
    assert!(fixture.workspace.get(&id).unwrap().messages.is_empty());
}

#[test]
fn activities_are_stored_on_the_reply_and_emitted_to_the_sink() {
    let fixture = fixture();
    fixture.llm.record_activities(
        fixture.grants.clone(),
        &["list_novel() → 1", "read_novel(1)"],
    );
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    let sink = events();
    let session = fixture
        .workspace
        .send(&id, "what is here?", None, sink.clone(), &novels())
        .unwrap();
    let expected = vec!["list_novel() → 1".to_string(), "read_novel(1)".to_string()];
    assert!(session.messages[0].activities.is_empty());
    assert_eq!(session.messages[1].activities, expected);
    let emitted: Vec<String> = sink
        .events()
        .into_iter()
        .map(|event| match event {
            AssistantEvent::Activity { label } => label,
        })
        .collect();
    assert_eq!(emitted, expected);
    let stored = fixture.workspace.get(&id).unwrap();
    assert_eq!(stored.messages[1].activities, expected);
}

#[test]
fn the_grant_carries_the_workspace_and_scope_only_during_the_turn() {
    let fixture = fixture();
    let seen = Arc::new(Mutex::new(None));
    let grants = fixture.grants.clone();
    let slot = seen.clone();
    fixture.llm.set_hook(move |token| {
        *slot.lock().unwrap() = grants.get(token);
    });
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    send(&fixture, &id, "hello", &novels()).unwrap();
    let grant = seen.lock().unwrap().clone().unwrap();
    assert_eq!(
        grant.workspace,
        fixture._dir.path().to_string_lossy().into_owned()
    );
    assert_eq!(grant.scope, workspace_scope());
}

#[test]
fn the_token_is_revoked_after_success_and_after_failure() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    let live = Arc::new(Mutex::new(false));
    let grants = fixture.grants.clone();
    let flag = live.clone();
    fixture.llm.set_hook(move |token| {
        *flag.lock().unwrap() = grants.get(token).is_some();
    });
    send(&fixture, &id, "ok", &novels()).unwrap();
    assert!(*live.lock().unwrap());
    fixture.llm.push_error("boom");
    assert!(send(&fixture, &id, "fail", &novels()).is_err());
    let tokens: Vec<String> = fixture
        .llm
        .calls()
        .into_iter()
        .map(|call| call.token)
        .collect();
    assert_eq!(tokens.len(), 2);
    assert_ne!(tokens[0], tokens[1]);
    for token in tokens {
        assert!(fixture.grants.get(&token).is_none());
    }
}

#[test]
fn invalid_citations_are_dropped_and_the_block_is_stripped() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    let block = json!([
        { "novelId": 1, "chapter": 1, "p": 1, "quote": "drew his sword" },
        { "novelId": 1, "chapter": 1, "p": 2, "quote": "drew his sword" },
        { "novelId": 1, "chapter": 9, "p": 1, "quote": "drew his sword" },
        { "novelId": 1, "chapter": 1, "p": 1, "quote": "invented words" }
    ]);
    fixture
        .llm
        .push_reply(&format!("The hero fights.\n<citations>{block}</citations>"));
    let session = send(&fixture, &id, "what happens?", &novels()).unwrap();
    let reply = &session.messages[1];
    assert_eq!(reply.text.trim(), "The hero fights.");
    assert_eq!(reply.citations.len(), 1);
    assert_eq!(reply.citations[0].quote, "drew his sword");
    assert_eq!(reply.citations[0].p, 1);
    let stored = fixture.workspace.get(&id).unwrap();
    assert_eq!(stored.messages[1].citations, reply.citations);
}

#[test]
fn delete_forgets_the_cli_session_only_for_the_same_provider() {
    let fixture = fixture();
    let source = novels();
    let same = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    send(&fixture, &same, "hello", &source).unwrap();
    fixture.workspace.delete(&same).unwrap();
    assert_eq!(fixture.llm.forgotten(), vec!["cli-1".to_string()]);
    assert_eq!(
        fixture.workspace.get(&same).unwrap_err().code,
        AssistantErrorCode::NotFound
    );
    let other = fixture
        .workspace
        .create(workspace_scope())
        .unwrap()
        .summary
        .id;
    send(&fixture, &other, "hello", &source).unwrap();
    fixture.llm.set_provider("codex");
    fixture.workspace.delete(&other).unwrap();
    assert_eq!(fixture.llm.forgotten(), vec!["cli-1".to_string()]);
    assert!(fixture.workspace.list().unwrap().is_empty());
}

#[test]
fn delete_of_an_unknown_session_is_not_found() {
    let fixture = fixture();
    let error = fixture.workspace.delete("missing").unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::NotFound);
}

#[test]
fn clip_takes_the_first_non_empty_line() {
    assert_eq!(clip("\n\n  hello  \nworld", 10), "hello");
    assert_eq!(clip("", 10), "");
    assert_eq!(clip("abcdefghij", 10), "abcdefghij");
    assert_eq!(clip("abcdefghijk", 10), "abcdefghi…");
}
