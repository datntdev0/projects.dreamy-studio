use tauri::App;
use tauri::AppHandle;
use tauri::Manager;
use tauri::RunEvent;

use crate::commands;
use crate::container::AppContainer;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::novel::service::NovelService;
use crate::features::pipeline::analyzer::LlmAnalyzer;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::job::JobRegistry;
use crate::features::pipeline::jobs::analysis::AnalysisJobFactory;
use crate::features::pipeline::jobs::translation::TranslationJobFactory;
use crate::features::pipeline::llm::LlmTranslator;
use crate::features::settings::models::Theme;
use crate::features::settings::repository::SettingsRepository;
use crate::features::settings::service::SettingsService;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::window_state;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("dreamy-sound", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(commands::library_stream::respond(
                    &app,
                    request,
                    crate::features::library::models::StreamKind::Sound,
                ));
            });
        })
        .register_asynchronous_uri_scheme_protocol("dreamy-video", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(commands::library_stream::respond(
                    &app,
                    request,
                    crate::features::library::models::StreamKind::Video,
                ));
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::settings::settings_get,
            commands::settings::settings_general_save,
            commands::settings::settings_folder_open,
            commands::settings::settings_layout_save,
            commands::settings::llm_get,
            commands::settings::llm_provider_save,
            commands::settings::llm_feature_save,
            commands::settings::llm_probe,
            commands::settings::llm_login,
            commands::settings::llm_logout,
            commands::settings::llm_profile_open,
            commands::settings::window_background_set,
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
            commands::pipeline::pipeline_start,
            commands::pipeline::pipeline_cancel,
            commands::pipeline::pipeline_history_list,
            commands::project::project_list,
            commands::project::project_create,
            commands::project::project_update,
            commands::project::project_archive,
            commands::project::project_delete,
            commands::project::project_open,
            commands::project::project_dir_list,
            commands::project::project_cover_get,
            commands::project::project_cover_set,
            commands::project::project_cover_clear,
            commands::project::project_folder_open,
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
            commands::library::library_prompt_pick,
            commands::library::library_prompt_inspect,
            commands::library::library_prompt_upload,
            commands::library::library_prompt_create,
            commands::library::library_prompt_list,
            commands::library::library_prompt_update,
            commands::library::library_prompt_delete,
        ])
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(handle_run_event);
}

fn handle_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::Exit = event {
        if let Some(executor) = app.try_state::<PipelineExecutor>() {
            executor.cancel();
        }
        if let Some(container) = app.try_state::<AppContainer>() {
            container.backend.stop();
            container.logger.info("app", "backend stopped on exit");
        }
    }
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let container = AppContainer::new(app)?;
    log_startup(app, &container);
    manage_workspace(app, &container);
    app.manage(container);
    prepare_window(app);
    Ok(())
}

fn prepare_window(app: &App) {
    let Some(window) = app.get_webview_window(commands::workspace::MAIN_WINDOW_LABEL) else {
        return;
    };
    let service = app.state::<SettingsService>();
    let theme = service.general().theme.unwrap_or(Theme::Dark);
    window_state::apply_background(&window, theme);
    window_state::prepare(&window, app.handle(), service.window());
}

fn manage_workspace(app: &App, container: &AppContainer) {
    let repository = WorkspaceRepository::new(container.database_path.clone());
    let service = WorkspaceService::new(repository);
    let loader = WorkspaceLoader::from_container(container, service.clone());
    app.manage(
        SettingsService::new(SettingsRepository::new(container.settings_path.clone()))
            .with_status(container.llm_status.clone()),
    );
    app.manage(WorkspaceSession::new());
    app.manage(service);
    app.manage(loader);
    app.manage(NovelService::new());
    manage_pipeline(app, container);
    app.manage(crate::features::project::service::ProjectService::new());
    app.manage(crate::features::library::service::LibraryService::new());
}

fn manage_pipeline(app: &App, container: &AppContainer) {
    let translation = crate::features::translation::service::TranslationService::new();
    let translator = std::sync::Arc::new(LlmTranslator::new(SettingsRepository::new(
        container.settings_path.clone(),
    )));
    let knowledge = KnowledgeService::new();
    let analyzer = std::sync::Arc::new(LlmAnalyzer::new(SettingsRepository::new(
        container.settings_path.clone(),
    )));
    app.manage(translation.clone());
    app.manage(knowledge.clone());
    app.manage(PipelineExecutor::new());
    app.manage(
        JobRegistry::new()
            .register(std::sync::Arc::new(TranslationJobFactory::new(
                translation,
                translator,
            )))
            .register(std::sync::Arc::new(AnalysisJobFactory::new(
                knowledge, analyzer,
            ))),
    );
}

fn log_startup(app: &App, container: &AppContainer) {
    let logger = &container.logger;
    if let Err(error) = logger.prepare() {
        eprintln!("cannot prepare log directory: {error}");
        return;
    }
    let package = app.package_info();
    let lines = [
        format!("{} {} started", package.name, package.version),
        format!("data directory: {}", container.directories.root.display()),
        format!("log directory: {}", container.directories.logs.display()),
        format!(
            "application database: {}",
            container.database_path.display()
        ),
        format!("settings file: {}", container.settings_path.display()),
    ];
    for line in &lines {
        logger.info("app", line);
    }
}
