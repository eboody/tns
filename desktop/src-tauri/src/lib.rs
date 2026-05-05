use std::path::PathBuf;
use std::sync::Mutex;

use tauri_plugin_opener::OpenerExt;
use tns_deid::desktop::{
    DesktopReplaceRequest, DesktopReviewRequest, run_replace_job as run_replace_service,
    run_review_job as run_review_service,
};

#[derive(Debug, Default)]
struct LastReplaceArtifacts {
    output_path: Option<PathBuf>,
    audit_output_path: Option<PathBuf>,
}

type LastReplaceArtifactsState = Mutex<LastReplaceArtifacts>;

#[tauri::command]
fn run_review_job(
    input: String,
    config: Option<String>,
    include_patterns: Vec<String>,
    exclude_patterns: Vec<String>,
) -> Result<tns_deid::desktop::DesktopReviewResult, String> {
    run_review_service(DesktopReviewRequest {
        input: input.into(),
        config: config.map(Into::into),
        include_patterns,
        exclude_patterns,
    })
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn run_replace_job(
    artifacts: tauri::State<'_, LastReplaceArtifactsState>,
    input: String,
    config: Option<String>,
    include_patterns: Vec<String>,
    exclude_patterns: Vec<String>,
) -> Result<tns_deid::desktop::DesktopReplaceResult, String> {
    let result = run_replace_service(DesktopReplaceRequest {
        input: input.into(),
        config: config.map(Into::into),
        include_patterns,
        exclude_patterns,
    })
    .map_err(|error| error.to_string())?;

    let mut artifacts = artifacts.lock().map_err(|error| error.to_string())?;
    artifacts.output_path = Some(result.output_path.clone());
    artifacts.audit_output_path = Some(result.audit_output_path.clone());

    Ok(result)
}

#[tauri::command]
fn open_last_output_path(
    app: tauri::AppHandle,
    artifacts: tauri::State<'_, LastReplaceArtifactsState>,
) -> Result<(), String> {
    let path = artifacts
        .lock()
        .map_err(|error| error.to_string())?
        .output_path
        .clone()
        .ok_or_else(|| "No replace output path is available yet.".to_string())?;

    open_existing_path(&app, path)
}

#[tauri::command]
fn open_last_audit_output_path(
    app: tauri::AppHandle,
    artifacts: tauri::State<'_, LastReplaceArtifactsState>,
) -> Result<(), String> {
    let path = artifacts
        .lock()
        .map_err(|error| error.to_string())?
        .audit_output_path
        .clone()
        .ok_or_else(|| "No audit output path is available yet.".to_string())?;

    open_existing_path(&app, path)
}

fn open_existing_path(app: &tauri::AppHandle, path: PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Path no longer exists: {}", path.display()));
    }

    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LastReplaceArtifactsState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            run_review_job,
            run_replace_job,
            open_last_output_path,
            open_last_audit_output_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
