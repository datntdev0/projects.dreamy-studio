use crate::bootstrap::configure;
use crate::bootstrap::install;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::session::WorkspaceSession;
use crate::testing::backend::StubBackend;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::App;
use tauri::AppHandle;
use tauri::Manager;
use tauri::WebviewUrl;
use tauri::WebviewWindow;
use tauri::WebviewWindowBuilder;
use tauri::async_runtime::block_on;
use tauri::ipc::CallbackFn;
use tauri::ipc::InvokeBody;
use tauri::test::INVOKE_KEY;
use tauri::test::MockRuntime;
use tauri::test::get_ipc_response;
use tauri::test::mock_builder;
use tauri::test::mock_context;
use tauri::test::noop_assets;
use tauri::webview::InvokeRequest;
use tempfile::TempDir;

const CALLER_LABEL: &str = "caller";

pub struct MockHost {
    app: App<MockRuntime>,
    caller: WebviewWindow<MockRuntime>,
    pub backend: Arc<StubBackend>,
    pub dir: TempDir,
}

impl MockHost {
    pub fn new() -> Self {
        Self::build(None)
    }

    pub fn with_window(label: &str) -> Self {
        Self::build(Some(label))
    }

    fn build(window: Option<&str>) -> Self {
        let dir = TempDir::new().unwrap();
        let app = configure(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        if let Some(label) = window {
            WebviewWindowBuilder::new(&app, label, WebviewUrl::default())
                .build()
                .unwrap();
        }
        let caller = WebviewWindowBuilder::new(&app, CALLER_LABEL, WebviewUrl::default())
            .build()
            .unwrap();
        let backend = Arc::new(StubBackend::new());
        let container = AppContainer::with_backend(dir.path().to_path_buf(), backend.clone());
        install(&app, container);
        Self {
            app,
            caller,
            backend,
            dir,
        }
    }

    pub fn handle(&self) -> AppHandle<MockRuntime> {
        self.app.handle().clone()
    }

    pub fn open_workspace(&self) -> PathBuf {
        let path = self.dir.path().join("studio");
        fs::create_dir_all(&path).unwrap();
        let app = self.handle();
        let loader = app.state::<WorkspaceLoader>();
        let session = app.state::<WorkspaceSession>();
        let request = LoadRequest::new(path.to_str().unwrap(), None);
        perform_load(&loader, &session, request, &ignore_event).unwrap();
        loader.enter(&session).unwrap();
        path
    }

    pub fn seed_novel(&self, chapters: &[(&str, &str)]) -> (i64, Vec<String>) {
        let input = json!({ "title": "Book", "lang": "ZH", "tags": [] });
        let book = self
            .invoke("novel_create", json!({ "input": input }))
            .unwrap();
        let id = book["id"].as_i64().unwrap();
        let mut ids = Vec::new();
        for (title, text) in chapters {
            let args = json!({ "novelId": id, "title": title });
            let added = self.invoke("novel_chapter_add", args).unwrap();
            let chapter = added["id"].as_str().unwrap().to_string();
            let args = json!({ "novelId": id, "chapterId": chapter, "text": text });
            self.invoke("novel_chapter_write", args).unwrap();
            ids.push(chapter);
        }
        (id, ids)
    }

    pub fn expect_code(&self, calls: &[(&str, Value)], code: &str) {
        for (cmd, payload) in calls {
            let error = self.invoke(cmd, payload.clone()).unwrap_err();
            assert_eq!(error["code"], code, "{cmd}: {error}");
        }
    }

    pub fn invoke(&self, cmd: &str, payload: Value) -> Result<Value, Value> {
        let request = InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "http://tauri.localhost".parse().unwrap(),
            body: InvokeBody::Json(payload),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        };
        get_ipc_response(&self.caller, request).map(|body| body.deserialize::<Value>().unwrap())
    }
}

fn ignore_event(_event: LoadEvent) {}

pub fn wait<T>(future: impl Future<Output = T>) -> T {
    block_on(future)
}
