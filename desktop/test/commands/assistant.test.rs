use super::*;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::models::AssistantErrorCode;
use crate::features::assistant::models::ScopeKind;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::testing::assistant::FakeLlm;
use crate::testing::assistant::RecordingEvents;
use crate::testing::assistant::RecordingSink;
use crate::testing::backend::StubBackend;
use tempfile::TempDir;

struct Fixture {
    dir: TempDir,
    workspace: String,
    session: WorkspaceSession,
    novels: NovelService,
    knowledge: KnowledgeService,
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
        service: service(),
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

    let created = create_session(&fixture.service, &fixture.session, workspace_scope()).unwrap();
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
    let created = create_session(&fixture.service, &fixture.session, workspace_scope()).unwrap();
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
    let created = create_session(&fixture.service, &fixture.session, workspace_scope()).unwrap();
    let events = Arc::new(RecordingEvents::new());

    let answered = send_message(
        &fixture.service,
        &fixture.novels,
        &fixture.session,
        &created.summary.id,
        "What novels are here?",
        None,
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

#[test]
fn rejects_a_novel_scope() {
    let fixture = entered_fixture();
    let scope = AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(1),
    };

    let error = create_session(&fixture.service, &fixture.session, scope).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Invalid);
}

#[test]
fn every_operation_reports_no_workspace_without_a_current_workspace() {
    let service = service();
    let novels = NovelService::new();
    let session = WorkspaceSession::new();
    let sink = Arc::new(RecordingEvents::new());

    let errors = [
        list_sessions(&service, &session).unwrap_err(),
        get_session(&service, &session, "id").unwrap_err(),
        create_session(&service, &session, workspace_scope()).unwrap_err(),
        delete_session(&service, &session, "id").unwrap_err(),
        permit_session(&service, &session, "id", true).unwrap_err(),
        send_message(&service, &novels, &session, "id", "hi", None, sink).unwrap_err(),
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
        &fixture.session,
        &grant,
    )
    .ok()
    .unwrap();

    assert!(sources.novels.list().unwrap().is_empty());
    assert!(sources.knowledge.get(1, "src").is_err());
}

#[test]
fn host_refuses_a_grant_for_a_workspace_that_is_not_current() {
    let fixture = entered_fixture();
    let other = fixture.dir.path().join("elsewhere");
    let grant = grant_for(other.to_str().unwrap());

    let refused = open_sources(
        &fixture.novels,
        &fixture.knowledge,
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
        &WorkspaceSession::new(),
        &grant,
    );

    assert_eq!(refused.err().unwrap(), "workspace is no longer open");
}
