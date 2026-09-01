use tauri::AppHandle;
use tauri::Runtime;
use tauri::async_runtime::spawn_blocking;

pub async fn run_blocking_with<R, T, E, F>(
    app: AppHandle<R>,
    failure: fn(tauri::Error) -> E,
    job: F,
) -> Result<T, E>
where
    R: Runtime,
    T: Send + 'static,
    E: Send + 'static,
    F: FnOnce(&AppHandle<R>) -> Result<T, E> + Send + 'static,
{
    match spawn_blocking(move || job(&app)).await {
        Ok(result) => result,
        Err(error) => Err(failure(error)),
    }
}
