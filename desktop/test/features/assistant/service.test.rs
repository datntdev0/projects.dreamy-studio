use super::*;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantErrorCode;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::ChangeTarget;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::assistant::CallKind;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeLlm;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::RecordingEvents;
use crate::testing::assistant::sources_of;
use crate::testing::assistant::sources_with;
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

fn sources(novels: &FakeNovels) -> Sources {
    sources_of(novels, &FakeKnowledge::new())
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
    fixture
        .workspace
        .send(id, text, None, events(), &sources(source))
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

fn novel_scope(novel_id: Option<i64>) -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Novel,
        novel_id,
    }
}

#[test]
fn create_accepts_a_novel_scope_for_an_existing_novel() {
    let fixture = fixture();
    let session = fixture
        .workspace
        .create(novel_scope(Some(1)), &novels())
        .unwrap();
    assert_eq!(session.summary.scope, novel_scope(Some(1)));
    let stored = fixture.workspace.get(&session.summary.id).unwrap();
    assert_eq!(stored.summary.scope, novel_scope(Some(1)));
}

#[test]
fn create_rejects_a_novel_scope_for_an_unknown_novel() {
    let fixture = fixture();
    let error = fixture
        .workspace
        .create(novel_scope(Some(9)), &novels())
        .unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::Invalid);
    assert!(fixture.workspace.list().unwrap().is_empty());
}

#[test]
fn create_rejects_a_novel_scope_without_a_novel_id() {
    let fixture = fixture();
    let error = fixture
        .workspace
        .create(novel_scope(None), &novels())
        .unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::Invalid);
}

#[test]
fn create_drops_the_novel_id_of_a_workspace_scope() {
    let fixture = fixture();
    let scope = AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: Some(1),
    };
    let session = fixture.workspace.create(scope, &novels()).unwrap();
    assert_eq!(session.summary.scope, workspace_scope());
}

#[test]
fn create_makes_an_empty_session_hidden_from_the_list() {
    let fixture = fixture();
    let session = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap();
    assert!(session.summary.title.is_empty());
    assert_eq!(session.summary.message_count, 0);
    assert!(session.messages.is_empty());
    assert!(fixture.workspace.list().unwrap().is_empty());
    let loaded = fixture.workspace.get(&session.summary.id).unwrap();
    assert_eq!(loaded, session);
}

#[test]
fn create_stores_editing_as_not_granted() {
    let fixture = fixture();
    let session = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap();
    assert!(!session.summary.edit_granted);
}

#[test]
fn permit_turns_editing_on_and_off_without_touching_updated_at() {
    let fixture = fixture();
    let created = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap();
    let id = created.summary.id.clone();
    let on = fixture.workspace.permit(&id, true).unwrap();
    assert!(on.summary.edit_granted);
    assert_eq!(on.summary.updated_at, created.summary.updated_at);
    assert!(fixture.workspace.get(&id).unwrap().summary.edit_granted);
    let off = fixture.workspace.permit(&id, false).unwrap();
    assert!(!off.summary.edit_granted);
    assert_eq!(off.summary.updated_at, created.summary.updated_at);
    assert!(!fixture.workspace.get(&id).unwrap().summary.edit_granted);
}

#[test]
fn permit_unknown_session_is_not_found() {
    let fixture = fixture();
    let error = fixture.workspace.permit("missing", true).unwrap_err();
    assert_eq!(error.code, AssistantErrorCode::NotFound);
}

#[test]
fn send_keeps_the_edit_grant_set_before_the_turn() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap()
        .summary
        .id;
    fixture.workspace.permit(&id, true).unwrap();
    let answered = send(&fixture, &id, "Hello", &novels()).unwrap();
    assert!(answered.summary.edit_granted);
    assert!(fixture.workspace.list().unwrap()[0].edit_granted);
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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

fn review_context(chapter_id: &str, target: &str) -> Option<AssistantContext> {
    Some(AssistantContext::TranslationReview {
        chapter_id: chapter_id.to_string(),
        target: target.to_string(),
    })
}

fn review_novels() -> FakeNovels {
    novels()
        .with_novel(2, "Beta")
        .with_chapter(2, 1, "Other", &["Elsewhere."])
        .with_statuses(1, 1, "done", "none")
}

fn review_translation() -> FakeTranslation {
    FakeTranslation::new()
        .with_translated_chapter(
            1,
            "VI",
            "chapter-1-1",
            "Một",
            &["Anh rút kiếm.", "Mưa rơi."],
        )
        .with_translated_chapter(2, "VI", "chapter-2-1", "Khác", &["Nơi khác."])
}

fn send_review(
    fixture: &Fixture,
    id: &str,
    context: Option<AssistantContext>,
) -> AssistantResult<AssistantSession> {
    let sources = sources_with(
        &review_novels(),
        &FakeKnowledge::new(),
        &review_translation(),
    );
    fixture
        .workspace
        .send(id, "Review it", context, events(), &sources)
}

fn novel_session(fixture: &Fixture, novel_id: i64) -> String {
    fixture
        .workspace
        .create(novel_scope(Some(novel_id)), &review_novels())
        .unwrap()
        .summary
        .id
}

#[test]
fn a_review_context_in_workspace_scope_is_invalid() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap()
        .summary
        .id;
    let result = send_review(&fixture, &id, review_context("chapter-1-1", "VI"));
    assert_eq!(code(result), AssistantErrorCode::Invalid);
    assert!(fixture.llm.calls().is_empty());
    assert!(fixture.workspace.get(&id).unwrap().messages.is_empty());
}

#[test]
fn a_review_context_for_a_chapter_of_another_novel_is_invalid() {
    let fixture = fixture();
    let id = novel_session(&fixture, 1);
    let result = send_review(&fixture, &id, review_context("chapter-2-1", "VI"));
    assert_eq!(code(result), AssistantErrorCode::Invalid);
    let unknown = send_review(&fixture, &id, review_context("nope", "VI"));
    assert_eq!(code(unknown), AssistantErrorCode::Invalid);
    assert!(fixture.llm.calls().is_empty());
}

#[test]
fn a_review_context_for_an_untranslated_chapter_or_a_bad_target_is_invalid() {
    let fixture = fixture();
    let id = novel_session(&fixture, 1);
    let untranslated = send_review(&fixture, &id, review_context("chapter-1-1", "EN"));
    let target = send_review(&fixture, &id, review_context("chapter-1-1", "FR"));
    assert_eq!(code(untranslated), AssistantErrorCode::Invalid);
    assert_eq!(code(target), AssistantErrorCode::Invalid);
    assert!(fixture.llm.calls().is_empty());
}

#[test]
fn a_review_context_replaces_the_prompt_and_keeps_the_opening_when_starting() {
    let fixture = fixture();
    let id = novel_session(&fixture, 1);
    send_review(&fixture, &id, review_context("chapter-1-1", "vi")).unwrap();
    let calls = fixture.llm.calls();
    assert_eq!(calls[0].kind, CallKind::Start);
    assert!(
        calls[0]
            .prompt
            .contains("You are the Dreamy Studio assistant")
    );
    assert!(calls[0].prompt.contains("Review it"));
    assert!(calls[0].prompt.contains("submit_translation_review"));
    assert!(calls[0].prompt.contains("\"VI\""));
    assert!(calls[0].prompt.contains("chapter 1"));
}

#[test]
fn a_resumed_cli_session_still_gets_the_skill_prompt() {
    let fixture = fixture();
    let id = novel_session(&fixture, 1);
    send(&fixture, &id, "Hello", &review_novels()).unwrap();
    send_review(&fixture, &id, review_context("chapter-1-1", "VI")).unwrap();
    let calls = fixture.llm.calls();
    assert_eq!(calls[1].kind, CallKind::Resume);
    assert!(calls[1].prompt.contains("submit_translation_review"));
    assert!(calls[1].prompt.contains("read_translation_guide"));
    assert!(
        !calls[1]
            .prompt
            .contains("You are the Dreamy Studio assistant")
    );
}

#[test]
fn a_plain_message_has_no_skill_prompt() {
    let fixture = fixture();
    let id = novel_session(&fixture, 1);
    send_review(&fixture, &id, None).unwrap();
    assert!(
        !fixture.llm.calls()[0]
            .prompt
            .contains("submit_translation_review")
    );
}

#[test]
fn attachments_are_stored_on_the_reply_keeping_the_last_one_of_each_kind() {
    let fixture = fixture();
    let grants = fixture.grants.clone();
    fixture.llm.set_hook(move |token| {
        let sink = grants.get(token).unwrap().sink;
        sink.attach(json!({ "kind": "translation_review", "checked": 1 }));
        sink.attach(json!({ "kind": "other", "checked": 5 }));
        sink.attach(json!({ "kind": "translation_review", "checked": 2 }));
    });
    let id = novel_session(&fixture, 1);
    let session = send_review(&fixture, &id, review_context("chapter-1-1", "VI")).unwrap();
    let expected = vec![
        json!({ "kind": "translation_review", "checked": 2 }),
        json!({ "kind": "other", "checked": 5 }),
    ];
    assert!(session.messages[0].attachments.is_empty());
    assert_eq!(session.messages[1].attachments, expected);
    let stored = fixture.workspace.get(&id).unwrap();
    assert_eq!(stored.messages[1].attachments, expected);
}

#[test]
fn empty_text_is_invalid_and_calls_nothing() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
        .unwrap()
        .summary
        .id;
    let inner = Arc::new(Mutex::new(None));
    let workspace = fixture.workspace.clone();
    let session_id = id.clone();
    let seen = inner.clone();
    fixture.llm.set_hook(move |_token| {
        let source = FakeNovels::new();
        let result = workspace.send(&session_id, "again", None, events(), &sources(&source));
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
        .unwrap()
        .summary
        .id;
    let sink = events();
    let session = fixture
        .workspace
        .send(
            &id,
            "what is here?",
            None,
            sink.clone(),
            &sources(&novels()),
        )
        .unwrap();
    let expected = vec!["list_novel() → 1".to_string(), "read_novel(1)".to_string()];
    assert!(session.messages[0].activities.is_empty());
    assert_eq!(session.messages[1].activities, expected);
    let emitted: Vec<String> = sink
        .events()
        .into_iter()
        .filter_map(|event| match event {
            AssistantEvent::Activity { label } => Some(label),
            AssistantEvent::Changed(_) => None,
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
        .create(workspace_scope(), &novels())
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
fn the_grant_copies_the_edit_flag_from_the_session_at_the_start_of_each_turn() {
    let fixture = fixture();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let grants = fixture.grants.clone();
    let slot = seen.clone();
    fixture.llm.set_hook(move |token| {
        slot.lock()
            .unwrap()
            .push(grants.get(token).unwrap().can_edit);
    });
    let id = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap()
        .summary
        .id;
    send(&fixture, &id, "first", &novels()).unwrap();
    fixture.workspace.permit(&id, true).unwrap();
    send(&fixture, &id, "second", &novels()).unwrap();
    fixture.workspace.permit(&id, false).unwrap();
    send(&fixture, &id, "third", &novels()).unwrap();
    assert_eq!(*seen.lock().unwrap(), vec![false, true, false]);
}

#[test]
fn changes_are_forwarded_to_the_event_sink_without_becoming_activities() {
    let fixture = fixture();
    let change = AssistantChange {
        target: ChangeTarget::Chapter,
        novel_id: 1,
        chapter_id: Some("chapter-1-1".to_string()),
        lang: None,
        translation_target: None,
    };
    let grants = fixture.grants.clone();
    let sent = change.clone();
    fixture.llm.set_hook(move |token| {
        grants.get(token).unwrap().sink.changed(sent.clone());
    });
    let id = fixture
        .workspace
        .create(workspace_scope(), &novels())
        .unwrap()
        .summary
        .id;
    let sink = events();
    let session = fixture
        .workspace
        .send(&id, "rename it", None, sink.clone(), &sources(&novels()))
        .unwrap();
    assert_eq!(sink.events(), vec![AssistantEvent::Changed(change)]);
    assert!(session.messages[1].activities.is_empty());
}

#[test]
fn the_token_is_revoked_after_success_and_after_failure() {
    let fixture = fixture();
    let id = fixture
        .workspace
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
        .create(workspace_scope(), &novels())
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
