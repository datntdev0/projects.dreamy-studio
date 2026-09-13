use tauri::App;
use tauri::AppHandle;
use tauri::Builder;
use tauri::Manager;
use tauri::RunEvent;
use tauri::Runtime;
use tauri::http::Request;
use tauri::http::Response;

use std::sync::Arc;
use std::sync::Mutex;

use crate::commands;
use crate::commands::assistant::AppMcpHost;
use crate::commands::audiobook::AppSynthesizer;
use crate::container::AppContainer;
use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::server::McpServer;
use crate::features::assistant::service::AssistantService;
use crate::features::assistant::service::CliAssistantLlm;
use crate::features::assistant::service::McpEndpoint;
use crate::features::backend::cache::SpeechCache;
use crate::features::backend::cloud::CloudAccountService;
use crate::features::backend::remote::RemoteBackendService;
use crate::features::backend::service::BackendService;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::library::models::StreamKind;
use crate::features::library::service::LibraryService;
use crate::features::novel::service::NovelService;
use crate::features::pipeline::analyzer::LlmAnalyzer;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::job::JobRegistry;
use crate::features::pipeline::jobs::analysis::AnalysisJobFactory;
use crate::features::pipeline::jobs::audio::AudioJobFactory;
use crate::features::pipeline::jobs::translation::TranslationJobFactory;
use crate::features::pipeline::llm::LlmTranslator;
use crate::features::project::service::ProjectService;
use crate::features::settings::install::CliInstaller;
use crate::features::settings::models::Theme;
use crate::features::settings::service::SettingsService;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::startup::launch::StartupService;
use crate::infra::startup::manifest::manifest;
use crate::infra::startup::setup::SetupDeps;
use crate::infra::startup::setup::SetupService;
use crate::infra::window_state;

pub fn run() {
    let app = configure(tauri::Builder::default())
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(handle_run_event);
}

pub fn configure<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());
    let builder = register_stream(builder, "dreamy-sound", StreamKind::Sound);
    register_stream(builder, "dreamy-video", StreamKind::Video).invoke_handler(
        tauri::generate_handler![
            commands::app::app_info,
            commands::app::app_quit,
            commands::setup::setup_run,
            commands::setup::setup_pause,
            commands::setup::setup_package_pick,
            commands::setup::setup_package_import,
            commands::setup::startup_run,
            commands::settings::settings_get,
            commands::settings::settings_general_save,
            commands::settings::settings_folder_open,
            commands::settings::settings_layout_save,
            commands::settings::llm_get,
            commands::settings::llm_feature_save,
            commands::settings::llm_probe,
            commands::settings::llm_login,
            commands::settings::llm_install,
            commands::settings::llm_install_cancel,
            commands::settings::llm_usage,
            commands::settings::llm_logout,
            commands::settings::window_background_set,
            commands::backend::backend_status,
            commands::backend::backend_restart,
            commands::backend::backend_logs_open,
            commands::backend::backend_models_open,
            commands::backend::backend_model_list,
            commands::backend::backend_model_download,
            commands::backend::backend_model_cancel,
            commands::backend::backend_model_remove,
            commands::backend::backend_remote_status,
            commands::backend::backend_remote_connect,
            commands::backend::backend_remote_disconnect,
            commands::backend::backend_remote_active_set,
            commands::backend::backend_remote_model_list,
            commands::backend::backend_remote_model_download,
            commands::backend::backend_remote_model_cancel,
            commands::backend::backend_remote_model_remove,
            commands::backend::cloud_account_list,
            commands::backend::cloud_account_key_set,
            commands::backend::cloud_account_key_remove,
            commands::backend::cloud_account_check,
            commands::backend::cloud_voice_search,
            commands::backend::cloud_cache_status,
            commands::backend::cloud_cache_clear,
            commands::backend::cloud_cache_open,
            commands::workspace::recent_list,
            commands::workspace::workspace_measure,
            commands::workspace::workspace_delete,
            commands::workspace::folder_pick,
            commands::workspace::workspace_load,
            commands::workspace::workspace_cancel,
            commands::workspace::workspace_enter,
            commands::workspace::workspace_current,
            commands::workspace::workspace_is_current,
            commands::novel::novel_list,
            commands::novel::novel_create,
            commands::novel::novel_update,
            commands::novel::novel_delete,
            commands::novel::novel_cover_get,
            commands::novel::novel_cover_set,
            commands::novel::novel_cover_clear,
            commands::novel::novel_chapters,
            commands::novel::novel_chapter_read,
            commands::novel::novel_paragraph_update,
            commands::novel::novel_chapter_write,
            commands::novel::novel_chapter_add,
            commands::novel::novel_chapter_rename,
            commands::novel::novel_chapter_delete,
            commands::novel::novel_chapter_move,
            commands::novel::novel_paragraph_add,
            commands::novel::novel_package_pick,
            commands::novel::novel_package_inspect,
            commands::novel::novel_package_import,
            commands::novel::novel_package_save_pick,
            commands::novel::novel_package_export,
            commands::translation::translation_get,
            commands::translation::translation_warnings,
            commands::translation::translation_guidelines_save,
            commands::translation::translation_dict_add,
            commands::translation::translation_dict_update,
            commands::translation::translation_dict_delete,
            commands::translation::translation_passage_save,
            commands::translation::translation_note_save,
            commands::knowledge::knowledge_get,
            commands::knowledge::knowledge_edit,
            commands::knowledge::knowledge_stale_accept,
            commands::assistant::assistant_session_list,
            commands::assistant::assistant_session_get,
            commands::assistant::assistant_session_create,
            commands::assistant::assistant_session_permit,
            commands::assistant::assistant_message_send,
            commands::assistant::assistant_proposal_resolve,
            commands::assistant::assistant_session_delete,
            commands::assistant::assistant_quota_get,
            commands::pipeline::pipeline_start,
            commands::pipeline::pipeline_cancel,
            commands::pipeline::pipeline_history_list,
            commands::project::project_list,
            commands::project::project_create,
            commands::project::project_update,
            commands::project::project_archive,
            commands::project::project_delete,
            commands::project::project_open,
            commands::project::project_cover_get,
            commands::project::project_cover_set,
            commands::project::project_cover_clear,
            commands::project::project_modules,
            commands::scripting::scripting_get,
            commands::scripting::scripting_save,
            commands::scripting::scripting_unit_save,
            commands::scripting::scripting_cast_save,
            commands::audiobook::audiobook_get,
            commands::audiobook::audiobook_unit_get,
            commands::audiobook::audiobook_config_save,
            commands::audiobook::audiobook_mix_save,
            commands::audiobook::audiobook_flag_set,
            commands::audiobook::audiobook_segment_generate,
            commands::audiobook::audiobook_segment_audio,
            commands::audiobook::audiobook_voice_preview,
            commands::audiobook::audiobook_export,
            commands::library::library_summary,
            commands::library::library_collection_list,
            commands::library::library_collection_create,
            commands::library::library_collection_update,
            commands::library::library_collection_delete,
            commands::library::library_tag_list,
            commands::library::library_tag_rename,
            commands::library::library_tag_merge,
            commands::library::library_tag_delete,
            commands::library::library_image_pick,
            commands::library::library_image_inspect,
            commands::library::library_image_upload,
            commands::library::library_image_list,
            commands::library::library_image_update,
            commands::library::library_image_delete,
            commands::library::library_image_thumb,
            commands::library::library_image_read,
            commands::library::library_sound_pick,
            commands::library::library_sound_inspect,
            commands::library::library_sound_upload,
            commands::library::library_sound_list,
            commands::library::library_sound_update,
            commands::library::library_sound_delete,
            commands::library::library_sound_peaks,
            commands::library::library_video_pick,
            commands::library::library_video_inspect,
            commands::library::library_video_upload,
            commands::library::library_video_list,
            commands::library::library_video_update,
            commands::library::library_video_delete,
            commands::library::library_video_poster,
            commands::library::library_prompt_create,
            commands::library::library_prompt_list,
            commands::library::library_prompt_update,
            commands::library::library_prompt_delete,
            commands::library_voices::library_voice_list,
            commands::library_voices::library_voice_create,
            commands::library_voices::library_voice_update,
            commands::library_voices::library_voice_duplicate,
            commands::library_voices::library_voice_delete,
            commands::library_voices::library_voice_preview,
        ],
    )
}

fn register_stream<R: Runtime>(builder: Builder<R>, scheme: &str, kind: StreamKind) -> Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol(scheme, move |context, request, responder| {
        let app = context.app_handle().clone();
        tauri::async_runtime::spawn_blocking(move || {
            serve_stream(&app, request, kind, |response| responder.respond(response));
        });
    })
}

pub fn serve_stream<R: Runtime>(
    app: &AppHandle<R>,
    request: Request<Vec<u8>>,
    kind: StreamKind,
    send: impl FnOnce(Response<Vec<u8>>),
) {
    send(commands::library_stream::respond(app, request, kind));
}

fn handle_run_event<R: Runtime>(app: &AppHandle<R>, event: RunEvent) {
    if let RunEvent::Exit = event {
        if let Some(executor) = app.try_state::<PipelineExecutor>() {
            executor.cancel();
        }
        if let Some(server) = app.try_state::<McpServer>() {
            server.stop();
        }
        if let Some(container) = app.try_state::<AppContainer>() {
            container.backend.stop();
            container.logger.info("app", "backend stopped on exit");
        }
    }
}

fn setup<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let container = AppContainer::new();
    install(app, container);
    Ok(())
}

pub fn install<R: Runtime>(app: &App<R>, container: AppContainer) {
    log_startup(app, &container);
    manage_workspace(app, &container);
    manage_assistant(app, &container);
    manage_backend(app, &container);
    manage_setup(app, &container);
    app.manage(container);
    prepare_window(app);
}

fn prepare_window<R: Runtime>(app: &App<R>) {
    let Some(window) = app.get_webview_window(commands::workspace::MAIN_WINDOW_LABEL) else {
        return;
    };
    let service = app.state::<SettingsService>();
    let theme = service.general().theme.unwrap_or(Theme::Dark);
    window_state::apply_background(&window, theme);
    window_state::prepare(&window, app.handle(), service.window());
}

fn manage_workspace<R: Runtime>(app: &App<R>, container: &AppContainer) {
    let repository = WorkspaceRepository::new(container.database_path.clone());
    let service = WorkspaceService::new(repository);
    let loader = WorkspaceLoader::from_container(container, service.clone());
    app.manage(
        SettingsService::new(container.settings_repository())
            .with_status(container.llm_status.clone())
            .with_portable(container.config.portable),
    );
    app.manage(WorkspaceSession::new());
    app.manage(service);
    app.manage(loader);
    app.manage(NovelService::new());
    let projects = ProjectService::new();
    let library = LibraryService::new();
    manage_pipeline(app, container, &projects, &library);
    app.manage(projects);
    app.manage(library);
}

fn manage_backend<R: Runtime>(app: &App<R>, container: &AppContainer) {
    let remote = Arc::new(RemoteBackendService::new(container.settings_repository()));
    let cloud = Arc::new(CloudAccountService::new(
        container.settings_repository(),
        SpeechCache::new(&container.config.caches_dir),
    ));
    app.manage(remote.clone());
    app.manage(cloud.clone());
    app.manage(BackendService::new(
        container.supervisor.clone(),
        remote,
        cloud,
        container.config.backend_data_dir.clone(),
        container.config.backend_logs_dir(),
    ));
}

fn manage_setup<R: Runtime>(app: &App<R>, container: &AppContainer) {
    app.manage(SetupService::new(SetupDeps {
        config: container.config.clone(),
        manifest: manifest().startup(),
        llm: container.llm.clone(),
        runtime_libraries: Some(AppContainer::runtime_libraries_dir()),
        logger: container.logger.clone(),
    }));
    app.manage(CliInstaller::new(
        container.config.clone(),
        manifest().clone(),
        container.logger.clone(),
    ));
    app.manage(StartupService::new(
        container.directories.root.clone(),
        container.database_path.clone(),
        container.logger.clone(),
        container.backend.clone(),
    ));
}

fn manage_assistant<R: Runtime>(app: &App<R>, container: &AppContainer) {
    let grants = McpGrants::new();
    let endpoint: McpEndpoint = Arc::new(Mutex::new(None));
    let llm = Arc::new(CliAssistantLlm::new(
        container.settings_repository(),
        Some(container.directories.logs.clone()),
        endpoint.clone(),
    ));
    app.manage(AssistantService::new(llm, grants.clone()));
    let host = Arc::new(AppMcpHost(app.handle().clone()));
    match McpServer::start(grants.clone(), host) {
        Ok(server) => {
            *endpoint.lock().unwrap_or_else(|error| error.into_inner()) = Some(server.endpoint());
            app.manage(server);
        }
        Err(error) => {
            let message = format!("assistant server did not start: {error}");
            container.logger.log("WARN", "assistant", &message);
        }
    }
    app.manage(grants);
}

fn manage_pipeline<R: Runtime>(
    app: &App<R>,
    container: &AppContainer,
    projects: &ProjectService,
    library: &LibraryService,
) {
    let translation = crate::features::translation::service::TranslationService::new();
    let translator = std::sync::Arc::new(LlmTranslator::new(container.settings_repository()));
    let knowledge = KnowledgeService::new();
    let analyzer = std::sync::Arc::new(LlmAnalyzer::new(container.settings_repository()));
    app.manage(translation.clone());
    app.manage(knowledge.clone());
    app.manage(PipelineExecutor::with_logs(
        container.directories.logs.clone(),
    ));
    app.manage(
        JobRegistry::new()
            .register(std::sync::Arc::new(TranslationJobFactory::new(
                translation,
                translator,
            )))
            .register(std::sync::Arc::new(AnalysisJobFactory::new(
                knowledge, analyzer,
            )))
            .register(std::sync::Arc::new(AudioJobFactory::new(
                projects.clone(),
                library.clone(),
                std::sync::Arc::new(AppSynthesizer::new(app.handle().clone())),
            ))),
    );
}

fn log_startup<R: Runtime>(app: &App<R>, container: &AppContainer) {
    let logger = &container.logger;
    if let Err(error) = logger.prepare() {
        eprintln!("cannot prepare log directory: {error}");
        return;
    }
    let package = app.package_info();
    let lines = [
        format!("{} {} started", package.name, package.version),
        format!("root directory: {}", container.config.root_dir.display()),
        format!("data directory: {}", container.directories.root.display()),
        format!("log directory: {}", container.directories.logs.display()),
        format!(
            "application database: {}",
            container.database_path.display()
        ),
        format!("settings file: {}", container.settings_path.display()),
        format!(
            "runtime directory: {}",
            container.config.runtime_dir.display()
        ),
        format!(
            "toolbox directory: {}",
            container.config.toolbox_dir.display()
        ),
        format!(
            "backend data directory: {}",
            container.config.backend_data_dir.display()
        ),
        match &container.config.source {
            Some(source) => format!(
                "configuration: {} (portable: {})",
                source.display(),
                container.config.portable
            ),
            None => "configuration: defaults".to_string(),
        },
    ];
    for line in &lines {
        logger.info("app", line);
    }
}
