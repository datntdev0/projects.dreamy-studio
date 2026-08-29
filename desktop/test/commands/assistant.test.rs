use super::*;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::models::AssistantErrorCode;
use crate::features::assistant::models::ScopeKind;
use crate::features::novel::models::NovelInput;
use crate::features::translation::service::TranslationService;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::testing::app::MockHost;
use crate::testing::assistant::FakeLlm;
use crate::testing::assistant::RecordingEvents;
use crate::testing::assistant::RecordingSink;
use crate::testing::backend::StubBackend;
use serde_json::json;
use tempfile::TempDir;

struct Fixture {
    dir: TempDir,
    workspace: String,
    session: WorkspaceSession,
    novels: NovelService,
    knowledge: KnowledgeService,
    translation: TranslationService,
    service: AssistantService,
}

fn ignore_event(_event: LoadEvent) {}

fn service() -> AssistantService {
    AssistantService::new(Arc::new(FakeLlm::new()), McpGrants::new())
}

fn entered_fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let workspace = dir.path().join("studio");
    std::fs::create_dir(&workspace).unwrap();
    let backend = Arc::new(StubBackend::new());
    let container = AppContainer::with_backend(dir.path().join("DreamyStudio"), backend);
    let repository = WorkspaceRepository::new(container.database_path.clone());
    let workspaces = WorkspaceService::new(repository);
    let loader = WorkspaceLoader::from_container(&container, workspaces);
    let session = WorkspaceSession::new();
    let request = LoadRequest::new(workspace.to_str().unwrap(), None);
    perform_load(&loader, &session, request, &ignore_event).unwrap();
    loader.enter(&session).unwrap();
    Fixture {
        dir,
        workspace: session.current().unwrap().path,
        session,
        novels: NovelService::new(),
        knowledge: KnowledgeService::new(),
        translation: TranslationService::new(),
        service: service(),
    }
}

fn services(fixture: &Fixture) -> SourceServices<'_> {
    SourceServices {
        novels: &fixture.novels,
        knowledge: &fixture.knowledge,
        translation: &fixture.translation,
    }
}

fn input<'a>(session_id: &'a str, text: &'a str, context: Option<Value>) -> SendInput<'a> {
    SendInput {
        session_id,
        text,
        context,
    }
}

fn workspace_scope() -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: None,
    }
}

fn grant_for(workspace: &str) -> Grant {
    Grant {
        workspace: workspace.to_string(),
        scope: workspace_scope(),
        can_edit: false,
        sink: Arc::new(RecordingSink::new()),
    }
}

#[test]
fn creates_lists_gets_and_deletes_a_session() {
    let fixture = entered_fixture();

    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        workspace_scope(),
    )
    .unwrap();
    let fetched = get_session(&fixture.service, &fixture.session, &created.summary.id).unwrap();
    let before = list_sessions(&fixture.service, &fixture.session).unwrap();
    delete_session(&fixture.service, &fixture.session, &created.summary.id).unwrap();
    let after = get_session(&fixture.service, &fixture.session, &created.summary.id);

    assert_eq!(fetched.summary.id, created.summary.id);
    assert!(fetched.messages.is_empty());
    assert!(before.is_empty());
    assert_eq!(after.unwrap_err().code, AssistantErrorCode::NotFound);
}

#[test]
fn permits_and_revokes_editing_for_a_session() {
    let fixture = entered_fixture();
    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        workspace_scope(),
    )
    .unwrap();
    let id = created.summary.id;

    let on = permit_session(&fixture.service, &fixture.session, &id, true).unwrap();
    let fetched = get_session(&fixture.service, &fixture.session, &id).unwrap();
    let off = permit_session(&fixture.service, &fixture.session, &id, false).unwrap();
    let missing = permit_session(&fixture.service, &fixture.session, "missing", true);

    assert!(on.summary.edit_granted);
    assert!(fetched.summary.edit_granted);
    assert!(!off.summary.edit_granted);
    assert_eq!(missing.unwrap_err().code, AssistantErrorCode::NotFound);
}

#[test]
fn sends_a_message_and_lists_the_session_afterwards() {
    let fixture = entered_fixture();
    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        workspace_scope(),
    )
    .unwrap();
    let events = Arc::new(RecordingEvents::new());

    let answered = send_message(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        input(&created.summary.id, "What novels are here?", None),
        events,
    )
    .unwrap();
    let listed = list_sessions(&fixture.service, &fixture.session).unwrap();

    assert_eq!(answered.messages.len(), 2);
    assert_eq!(answered.messages[1].text, "ok");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.summary.id);
    assert_eq!(listed[0].title, "What novels are here?");
}

fn novel_input() -> NovelInput {
    NovelInput {
        title: "Book".to_string(),
        name: String::new(),
        author: String::new(),
        lang: "ZH".to_string(),
        description: String::new(),
        tags: Vec::new(),
    }
}

fn novel_scope(novel_id: Option<i64>) -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Novel,
        novel_id,
    }
}

#[test]
fn creates_a_novel_scoped_session_for_an_existing_novel() {
    let fixture = entered_fixture();
    let novel = fixture
        .novels
        .open(&fixture.session)
        .unwrap()
        .create(novel_input())
        .unwrap();

    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        novel_scope(Some(novel.id)),
    )
    .unwrap();

    assert_eq!(created.summary.scope, novel_scope(Some(novel.id)));
}

#[test]
fn rejects_a_novel_scope_for_an_unknown_or_missing_novel() {
    let fixture = entered_fixture();

    for scope in [novel_scope(Some(99)), novel_scope(None)] {
        let error =
            create_session(&fixture.service, &fixture.novels, &fixture.session, scope).unwrap_err();
        assert_eq!(error.code, AssistantErrorCode::Invalid);
    }
}

#[test]
fn every_operation_reports_no_workspace_without_a_current_workspace() {
    let service = service();
    let novels = NovelService::new();
    let knowledge = KnowledgeService::new();
    let translation = TranslationService::new();
    let services = SourceServices {
        novels: &novels,
        knowledge: &knowledge,
        translation: &translation,
    };
    let session = WorkspaceSession::new();
    let sink = Arc::new(RecordingEvents::new());

    let errors = [
        list_sessions(&service, &session).unwrap_err(),
        get_session(&service, &session, "id").unwrap_err(),
        create_session(&service, &novels, &session, workspace_scope()).unwrap_err(),
        delete_session(&service, &session, "id").unwrap_err(),
        permit_session(&service, &session, "id", true).unwrap_err(),
        send_message(&service, &services, &session, input("id", "hi", None), sink).unwrap_err(),
        resolve_proposal(
            &service,
            &services,
            &session,
            resolve_input("id", "m", "applied"),
        )
        .unwrap_err(),
    ];

    for error in errors {
        assert_eq!(error.code, AssistantErrorCode::NoWorkspace);
    }
}

#[test]
fn host_opens_sources_for_the_current_workspace() {
    let fixture = entered_fixture();
    let grant = grant_for(&fixture.workspace);

    let sources = open_sources(
        &fixture.novels,
        &fixture.knowledge,
        &fixture.translation,
        &fixture.session,
        &grant,
    )
    .ok()
    .unwrap();

    assert!(sources.novels.list().unwrap().is_empty());
    assert!(sources.knowledge.get(1, "src").is_err());
    assert!(sources.translation.get(1, "VI").is_err());
}

#[test]
fn host_refuses_a_grant_for_a_workspace_that_is_not_current() {
    let fixture = entered_fixture();
    let other = fixture.dir.path().join("elsewhere");
    let grant = grant_for(other.to_str().unwrap());

    let refused = open_sources(
        &fixture.novels,
        &fixture.knowledge,
        &fixture.translation,
        &fixture.session,
        &grant,
    );

    assert_eq!(refused.err().unwrap(), "workspace is no longer open");
}

#[test]
fn host_refuses_every_grant_when_no_workspace_is_open() {
    let grant = grant_for("anywhere");

    let refused = open_sources(
        &NovelService::new(),
        &KnowledgeService::new(),
        &TranslationService::new(),
        &WorkspaceSession::new(),
        &grant,
    );

    assert_eq!(refused.err().unwrap(), "workspace is no longer open");
}

#[test]
fn a_bad_context_shape_is_invalid_and_null_means_no_context() {
    let fixture = entered_fixture();
    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        workspace_scope(),
    )
    .unwrap();
    let id = created.summary.id;
    let bad = [
        json!({ "kind": "nope" }),
        json!({ "kind": "translation_review" }),
        json!("review"),
    ];

    for context in bad {
        let error = send_message(
            &fixture.service,
            &services(&fixture),
            &fixture.session,
            input(&id, "hi", Some(context)),
            Arc::new(RecordingEvents::new()),
        )
        .unwrap_err();
        assert_eq!(error.code, AssistantErrorCode::Invalid);
    }
    let null = send_message(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        input(&id, "hi", Some(Value::Null)),
        Arc::new(RecordingEvents::new()),
    );

    assert!(null.is_ok());
}

#[test]
fn a_review_context_in_workspace_scope_is_invalid() {
    let fixture = entered_fixture();
    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        workspace_scope(),
    )
    .unwrap();
    let context = json!({ "kind": "translation_review", "chapterId": "c1", "target": "VI" });

    let error = send_message(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        input(&created.summary.id, "hi", Some(context)),
        Arc::new(RecordingEvents::new()),
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Invalid);
}

const NO_ITEMS: &[String] = &[];

fn resolve_input<'a>(
    session_id: &'a str,
    message_id: &'a str,
    status: &'a str,
) -> ResolveInput<'a> {
    ResolveInput {
        session_id,
        message_id,
        item_ids: NO_ITEMS,
        status,
    }
}

fn novel_session(fixture: &Fixture) -> String {
    let novel = fixture
        .novels
        .open(&fixture.session)
        .unwrap()
        .create(novel_input())
        .unwrap();
    create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        novel_scope(Some(novel.id)),
    )
    .unwrap()
    .summary
    .id
}

#[test]
fn resolving_an_unknown_message_is_not_found() {
    let fixture = entered_fixture();
    let id = novel_session(&fixture);

    let error = resolve_proposal(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        resolve_input(&id, "missing", "rejected"),
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
}

#[test]
fn resolving_an_unknown_session_is_not_found() {
    let fixture = entered_fixture();

    let error = resolve_proposal(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        resolve_input("missing", "m", "applied"),
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
}

#[test]
fn an_unknown_decision_is_invalid() {
    let fixture = entered_fixture();
    let id = novel_session(&fixture);

    for status in ["pending", "", "Applied"] {
        let error = resolve_proposal(
            &fixture.service,
            &services(&fixture),
            &fixture.session,
            resolve_input(&id, "m", status),
        )
        .unwrap_err();
        assert_eq!(error.code, AssistantErrorCode::Invalid);
    }
}

#[test]
fn resolving_in_a_workspace_scope_is_invalid() {
    let fixture = entered_fixture();
    let created = create_session(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        workspace_scope(),
    )
    .unwrap();
    let answered = send_message(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        input(&created.summary.id, "hi", None),
        Arc::new(RecordingEvents::new()),
    )
    .unwrap();

    let error = resolve_proposal(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        resolve_input(&created.summary.id, &answered.messages[1].id, "applied"),
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Invalid);
}

#[test]
fn rejecting_a_proposal_updates_the_stored_review() {
    let mut fixture = entered_fixture();
    let llm = Arc::new(FakeLlm::new());
    let grants = McpGrants::new();
    fixture.service = AssistantService::new(llm.clone(), grants.clone());
    llm.set_hook(move |token| {
        let review = json!({
            "kind": "translation_review",
            "findings": [{ "id": "f1", "status": "pending" }, { "id": "f2", "status": "pending" }],
            "dictionary": [{ "id": "d1", "status": "pending" }],
        });
        grants.get(token).unwrap().sink.attach(review);
    });
    let id = novel_session(&fixture);
    let answered = send_message(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        input(&id, "review", None),
        Arc::new(RecordingEvents::new()),
    )
    .unwrap();
    let items = vec!["f2".to_string(), "d1".to_string()];
    let resolve = ResolveInput {
        session_id: &id,
        message_id: &answered.messages[1].id,
        item_ids: &items,
        status: "rejected",
    };

    let resolved = resolve_proposal(
        &fixture.service,
        &services(&fixture),
        &fixture.session,
        resolve,
    )
    .unwrap();

    let review = &resolved.messages[1].attachments[0];
    assert_eq!(review["findings"][0]["status"], "pending");
    assert_eq!(review["findings"][1]["status"], "rejected");
    assert_eq!(review["dictionary"][0]["status"], "rejected");
    let stored = get_session(&fixture.service, &fixture.session, &id).unwrap();
    assert_eq!(
        stored.messages[1].attachments,
        resolved.messages[1].attachments
    );
}

#[test]
fn every_assistant_command_reports_no_workspace_through_ipc() {
    let host = MockHost::new();

    host.expect_code(
        &[
            ("assistant_session_list", json!({})),
            ("assistant_session_get", json!({ "id": "s" })),
            (
                "assistant_session_create",
                json!({ "scope": { "kind": "workspace" } }),
            ),
            (
                "assistant_session_permit",
                json!({ "id": "s", "editGranted": true }),
            ),
            ("assistant_session_delete", json!({ "id": "s" })),
            (
                "assistant_proposal_resolve",
                json!({
                    "sessionId": "s",
                    "messageId": "m",
                    "itemIds": [],
                    "status": "accepted"
                }),
            ),
            (
                "assistant_message_send",
                json!({
                    "sessionId": "s",
                    "text": "hi",
                    "context": null,
                    "onEvent": "__CHANNEL__:1"
                }),
            ),
        ],
        "no_workspace",
    );
}

#[test]
fn assistant_sessions_are_created_permitted_and_deleted_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();

    let created = host
        .invoke(
            "assistant_session_create",
            json!({ "scope": { "kind": "workspace" } }),
        )
        .unwrap();
    let id = created["id"].as_str().unwrap().to_string();
    let listed = host.invoke("assistant_session_list", json!({})).unwrap();
    let fetched = host
        .invoke("assistant_session_get", json!({ "id": id }))
        .unwrap();
    let permitted = host
        .invoke(
            "assistant_session_permit",
            json!({ "id": id, "editGranted": true }),
        )
        .unwrap();
    let missing = host
        .invoke("assistant_session_get", json!({ "id": "missing" }))
        .unwrap_err();
    let unresolved = host.invoke(
        "assistant_proposal_resolve",
        json!({
            "sessionId": id,
            "messageId": "missing",
            "itemIds": [],
            "status": "accepted"
        }),
    );
    let deleted = host.invoke("assistant_session_delete", json!({ "id": id }));

    assert!(listed.as_array().unwrap().is_empty());
    assert_eq!(fetched["id"], created["id"]);
    assert_eq!(permitted["id"], created["id"]);
    assert_eq!(missing["code"], "not_found");
    assert!(unresolved.is_err());
    assert!(deleted.is_ok(), "{deleted:?}");
    assert!(
        host.invoke("assistant_session_list", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn sending_to_an_unknown_assistant_session_fails_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();

    let error = host
        .invoke(
            "assistant_message_send",
            json!({
                "sessionId": "missing",
                "text": "hi",
                "context": null,
                "onEvent": "__CHANNEL__:1"
            }),
        )
        .unwrap_err();

    assert_eq!(error["code"], "not_found");
}
