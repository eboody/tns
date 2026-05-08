use std::path::PathBuf;
use std::sync::Mutex;

use crate::desktop::{
    DesktopAddRedactionRequest, DesktopFindAndRedactRequest, DesktopRedactionAcrossFilesRequest,
    DesktopRemoveRedactionTermRequest,
    DesktopRemoveRedactionRequest, DesktopRunSettings, DesktopReplaceRequest,
    DesktopReviewRequest,
    add_manual_redaction as add_manual_redaction_service,
    apply_redaction_to_all_files as apply_redaction_to_all_files_service,
    find_and_redact_term as find_and_redact_term_service,
    inspect_manual_redaction as inspect_manual_redaction_service,
    inspect_redaction_across_files as inspect_redaction_across_files_service,
    merge_manual_redaction as merge_manual_redaction_service,
    remove_redaction_term as remove_redaction_term_service,
    remove_redaction_from_all_files as remove_redaction_from_all_files_service,
    remove_redaction as remove_redaction_service, run_replace_job as run_replace_service,
    run_review_job as run_review_service,
};
use tauri::{AppHandle, Manager, path::BaseDirectory};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Default)]
struct LastReplaceArtifacts {
    output_path: Option<PathBuf>,
    audit_output_path: Option<PathBuf>,
}

type LastReplaceArtifactsState = Mutex<LastReplaceArtifacts>;

const NER_MODEL_RESOURCE_PATH: &str = "ner/model.onnx";
const NER_TOKENIZER_RESOURCE_PATH: &str = "ner/tokenizer.json";
const DEV_NER_MODEL_RESOURCE_PATH: &str = "../ml/ner/model.onnx";
const DEV_NER_TOKENIZER_RESOURCE_PATH: &str = "../ml/ner/tokenizer.json";

#[tauri::command]
fn run_review_job(
    input: String,
    config: Option<String>,
    settings: Option<DesktopRunSettings>,
    include_patterns: Vec<String>,
    exclude_patterns: Vec<String>,
) -> Result<crate::desktop::DesktopReviewResult, String> {
    run_review_service(DesktopReviewRequest {
        input: input.into(),
        config: config.map(Into::into),
        settings,
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
    settings: Option<DesktopRunSettings>,
    include_patterns: Vec<String>,
    exclude_patterns: Vec<String>,
) -> Result<crate::desktop::DesktopReplaceResult, String> {
    let result = run_replace_service(DesktopReplaceRequest {
        input: input.into(),
        config: config.map(Into::into),
        settings,
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
fn add_manual_redaction(
    request: DesktopAddRedactionRequest,
) -> Result<crate::desktop::DesktopPreviewUpdateResult, String> {
    add_manual_redaction_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn inspect_manual_redaction(
    request: DesktopAddRedactionRequest,
) -> Result<crate::desktop::DesktopManualRedactionAvailability, String> {
    inspect_manual_redaction_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn merge_manual_redaction(
    request: DesktopAddRedactionRequest,
) -> Result<crate::desktop::DesktopPreviewUpdateResult, String> {
    merge_manual_redaction_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_redaction(
    request: DesktopRemoveRedactionRequest,
) -> Result<crate::desktop::DesktopPreviewUpdateResult, String> {
    remove_redaction_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn apply_redaction_to_all_files(
    request: DesktopRedactionAcrossFilesRequest,
) -> Result<crate::desktop::DesktopAcrossFilesUpdateResult, String> {
    apply_redaction_to_all_files_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_redaction_from_all_files(
    request: DesktopRedactionAcrossFilesRequest,
) -> Result<crate::desktop::DesktopAcrossFilesUpdateResult, String> {
    remove_redaction_from_all_files_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn inspect_redaction_across_files(
    request: DesktopRedactionAcrossFilesRequest,
) -> Result<crate::desktop::DesktopAcrossFilesAvailability, String> {
    inspect_redaction_across_files_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn find_and_redact_term(
    request: DesktopFindAndRedactRequest,
) -> Result<crate::desktop::DesktopAcrossFilesUpdateResult, String> {
    find_and_redact_term_service(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_redaction_term(
    request: DesktopRemoveRedactionTermRequest,
) -> Result<crate::desktop::DesktopAcrossFilesUpdateResult, String> {
    remove_redaction_term_service(request).map_err(|error| error.to_string())
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

    let open_target = artifact_open_target(&path)?;

    app.opener()
        .open_path(open_target.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

fn artifact_open_target(path: &std::path::Path) -> Result<PathBuf, String> {
    if path.is_dir() {
        return Ok(path.to_path_buf());
    }

    path.parent()
        .map(|parent| parent.to_path_buf())
        .ok_or_else(|| format!("Path has no parent directory to open: {}", path.display()))
}

fn configure_default_auto_ner_assets(app: &AppHandle) {
    let Some((model_path, tokenizer_path)) = resolve_default_auto_ner_assets(app) else {
        unsafe {
            std::env::remove_var("TNS_DEID_AUTO_NER_MODEL_PATH");
            std::env::remove_var("TNS_DEID_AUTO_NER_TOKENIZER_PATH");
        }
        return;
    };

    unsafe {
        std::env::set_var("TNS_DEID_AUTO_NER_MODEL_PATH", model_path);
        std::env::set_var("TNS_DEID_AUTO_NER_TOKENIZER_PATH", tokenizer_path);
    }
}

fn resolve_default_auto_ner_assets(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
    [
        resolve_ner_assets(app, NER_MODEL_RESOURCE_PATH, NER_TOKENIZER_RESOURCE_PATH),
        resolve_ner_assets(
            app,
            DEV_NER_MODEL_RESOURCE_PATH,
            DEV_NER_TOKENIZER_RESOURCE_PATH,
        ),
    ]
    .into_iter()
    .flatten()
    .find(|(model_path, tokenizer_path)| model_path.is_file() && tokenizer_path.is_file())
}

fn resolve_ner_assets(
    app: &AppHandle,
    model_resource_path: &str,
    tokenizer_resource_path: &str,
) -> Option<(PathBuf, PathBuf)> {
    let model_path = app
        .path()
        .resolve(model_resource_path, BaseDirectory::Resource)
        .ok()?;
    let tokenizer_path = app
        .path()
        .resolve(tokenizer_resource_path, BaseDirectory::Resource)
        .ok()?;
    Some((model_path, tokenizer_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            configure_default_auto_ner_assets(app.handle());
            Ok(())
        })
        .manage(LastReplaceArtifactsState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            run_review_job,
            run_replace_job,
            add_manual_redaction,
            inspect_manual_redaction,
            merge_manual_redaction,
            remove_redaction,
            apply_redaction_to_all_files,
            remove_redaction_from_all_files,
            inspect_redaction_across_files,
            find_and_redact_term,
            remove_redaction_term,
            open_last_output_path,
            open_last_audit_output_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

#[cfg(test)]
mod tests {
    use super::artifact_open_target;
    use std::{fs, path::Path};
    use tempfile::tempdir;

    #[test]
    fn artifact_open_target_returns_parent_directory_for_file_paths() {
        let path = Path::new("/tmp/output/note.deidentified.md");

        assert_eq!(
            artifact_open_target(path).unwrap(),
            Path::new("/tmp/output")
        );
    }

    #[test]
    fn artifact_open_target_preserves_directory_paths() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("output");
        fs::create_dir_all(&path).unwrap();

        assert_eq!(artifact_open_target(&path).unwrap(), path);
    }
}
