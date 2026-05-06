use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{Result, RunFileStatus, RunMode, RunOptions, extraction, run};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesktopReviewRequest {
    pub input: PathBuf,
    pub config: Option<PathBuf>,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReviewResult {
    pub replacements: usize,
    pub non_text_omissions_detected: bool,
    pub file_statuses: Vec<RunFileStatus>,
    pub review_summary: String,
    pub coverage_note: &'static str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesktopReplaceRequest {
    pub input: PathBuf,
    pub config: Option<PathBuf>,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReplaceResult {
    pub replacements: usize,
    pub non_text_omissions_detected: bool,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub file_statuses: Vec<RunFileStatus>,
    pub file_previews: Vec<DesktopFilePreview>,
    pub review_summary: String,
    pub coverage_note: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFilePreview {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub original_html: Option<String>,
    pub redacted_html: String,
    pub review: DesktopReviewMetadata,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReviewMetadata {
    pub requires_manual_review: bool,
    pub extraction_provenance: Option<String>,
    pub reasons: Vec<DesktopReviewReason>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopReviewReason {
    OriginalPreviewUnavailable,
    NonTextOmissionsDetected,
    TextDegradedDetected,
    StructuralLossSuspected,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct EditableAuditPreviewReport {
    input_path: PathBuf,
    output_path: PathBuf,
    review_flags: Value,
    replacements: Vec<EditableAuditPreviewRecord>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct EditableAuditPreviewRecord {
    source: Value,
    entity_type: String,
    matched_text: String,
    replacement: String,
    reason: String,
    score: Option<f32>,
    start: usize,
    end: usize,
}

#[derive(Debug, Clone)]
struct HighlightRange {
    start: usize,
    end: usize,
    label: String,
    original_start: usize,
    original_end: usize,
    replacement: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreviewSelectionSource {
    Original,
    Redacted,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAddRedactionRequest {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub source_preview: PreviewSelectionSource,
    pub selection_start: usize,
    pub selection_end: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRemoveRedactionRequest {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub start: usize,
    pub end: usize,
    pub replacement: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPreviewUpdateResult {
    pub preview: DesktopFilePreview,
    pub replacements: usize,
}

pub fn run_review_job(request: DesktopReviewRequest) -> Result<DesktopReviewResult> {
    let summary = run(RunOptions {
        input: request.input,
        output: None,
        audit_output: None,
        config: request.config,
        include_patterns: request.include_patterns,
        exclude_patterns: request.exclude_patterns,
        mode: RunMode::Review,
    })?;

    Ok(DesktopReviewResult {
        replacements: summary.replacements,
        non_text_omissions_detected: summary.non_text_omissions_detected,
        file_statuses: summary.file_statuses,
        review_summary: summary.review_summary,
        coverage_note: summary.coverage_note,
    })
}

pub fn run_replace_job(request: DesktopReplaceRequest) -> Result<DesktopReplaceResult> {
    let summary = run(RunOptions {
        input: request.input,
        output: None,
        audit_output: None,
        config: request.config,
        include_patterns: request.include_patterns,
        exclude_patterns: request.exclude_patterns,
        mode: RunMode::Replace,
    })?;

    let file_previews = build_replace_previews(&summary.file_statuses, &summary.output_path)?;

    Ok(DesktopReplaceResult {
        replacements: summary.replacements,
        non_text_omissions_detected: summary.non_text_omissions_detected,
        output_path: summary.output_path.expect("replace mode output path"),
        audit_output_path: summary.audit_output_path.expect("replace mode audit path"),
        file_statuses: summary.file_statuses,
        file_previews,
        review_summary: summary.review_summary,
        coverage_note: summary.coverage_note,
    })
}

pub fn add_manual_redaction(request: DesktopAddRedactionRequest) -> Result<DesktopPreviewUpdateResult> {
    let original_text = load_preview_input_as_markdown(&request.input_path)?;
    let mut audit_report = read_editable_audit_report(&request.audit_output_path)?;
    let (start, end) = map_selection_to_original_range(
        &original_text,
        &audit_report.replacements,
        request.source_preview,
        request.selection_start,
        request.selection_end,
    )?;

    if overlaps_existing_replacement(&audit_report.replacements, start, end) {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "manual redactions must be selected outside existing highlights; click a highlight to remove it first".to_string(),
        ));
    }

    let matched_text = original_text[start..end].to_string();
    if matched_text.trim().is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text is empty or whitespace only".to_string(),
        ));
    }

    audit_report.replacements.push(EditableAuditPreviewRecord {
        source: json!("custom"),
        entity_type: "MANUAL_REDACTION".to_string(),
        matched_text,
        replacement: "[MANUAL_REDACTION]".to_string(),
        reason: "desktop manual selection".to_string(),
        score: None,
        start,
        end,
    });
    sort_and_validate_replacements(&mut audit_report.replacements)?;

    persist_preview_edit(
        request.path,
        request.output_path,
        request.audit_output_path,
        original_text,
        audit_report,
    )
}

pub fn remove_redaction(request: DesktopRemoveRedactionRequest) -> Result<DesktopPreviewUpdateResult> {
    let original_text = load_preview_input_as_markdown(&request.input_path)?;
    let mut audit_report = read_editable_audit_report(&request.audit_output_path)?;
    let original_len = audit_report.replacements.len();

    audit_report.replacements.retain(|record| {
        !(record.start == request.start
            && record.end == request.end
            && record.replacement == request.replacement)
    });

    if audit_report.replacements.len() == original_len {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "clicked redaction no longer exists in the current preview".to_string(),
        ));
    }

    sort_and_validate_replacements(&mut audit_report.replacements)?;

    persist_preview_edit(
        request.path,
        request.output_path,
        request.audit_output_path,
        original_text,
        audit_report,
    )
}

fn build_replace_previews(
    file_statuses: &[RunFileStatus],
    _output_root: &Option<PathBuf>,
) -> Result<Vec<DesktopFilePreview>> {
    let mut previews = Vec::new();

    for status in file_statuses {
        let Some(output_path) = status.output_path.as_ref() else {
            continue;
        };
        let Some(audit_path) = status.audit_output_path.as_ref() else {
            continue;
        };

        let redacted_text =
            fs::read_to_string(output_path).map_err(|source| crate::error::AppError::ReadFile {
                path: output_path.clone(),
                source,
            })?;
        let audit_json =
            fs::read_to_string(audit_path).map_err(|source| crate::error::AppError::ReadFile {
                path: audit_path.clone(),
                source,
            })?;
        let audit_report: EditableAuditPreviewReport = serde_json::from_str(&audit_json)
            .map_err(crate::error::AppError::SerializeAuditReport)?;
        previews.push(build_preview(
            status.path.clone(),
            output_path.clone(),
            audit_path.clone(),
            &redacted_text,
            &audit_report,
        )?);
    }

    Ok(previews)
}

fn build_preview(
    path: PathBuf,
    output_path: PathBuf,
    audit_output_path: PathBuf,
    redacted_text: &str,
    audit_report: &EditableAuditPreviewReport,
) -> Result<DesktopFilePreview> {
    let original_text = load_preview_input_as_markdown(&audit_report.input_path).ok();
    let extraction_fidelity = audit_report.review_flags.get("extraction_fidelity");
    let non_text_omissions_detected = audit_report
        .review_flags
        .get("non_text_omissions_detected")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let text_degraded_detected = audit_report
        .review_flags
        .get("text_degraded_detected")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let structural_loss_suspected = extraction_fidelity
        .and_then(|value| value.get("structural_loss_suspected"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let low_confidence_review_required = extraction_fidelity
        .and_then(|value| value.get("low_confidence_review_required"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let extraction_provenance = extraction_fidelity
        .and_then(|value| value.get("provenance"))
        .and_then(Value::as_str);

    let original_html = original_text.as_ref().map(|text| {
        render_highlighted_html(
            text,
            &audit_report
                .replacements
                .iter()
                .map(|record| HighlightRange {
                    start: record.start,
                    end: record.end,
                    label: record.entity_type.clone(),
                    original_start: record.start,
                    original_end: record.end,
                    replacement: record.replacement.clone(),
                })
                .collect::<Vec<_>>(),
        )
    });
    let redacted_html = render_highlighted_html(
        redacted_text,
        &map_redacted_highlights(&audit_report.replacements),
    );

    Ok(DesktopFilePreview {
        path,
        input_path: audit_report.input_path.clone(),
        output_path,
        audit_output_path,
        original_html,
        redacted_html,
        review: build_review_metadata(
            original_text.is_none(),
            extraction_provenance,
            non_text_omissions_detected,
            text_degraded_detected,
            structural_loss_suspected,
            low_confidence_review_required,
        ),
    })
}

fn build_review_metadata(
    original_preview_unavailable: bool,
    extraction_provenance: Option<&str>,
    non_text_omissions_detected: bool,
    text_degraded_detected: bool,
    structural_loss_suspected: bool,
    low_confidence_review_required: bool,
) -> DesktopReviewMetadata {
    let mut reasons = Vec::new();

    if original_preview_unavailable {
        reasons.push(DesktopReviewReason::OriginalPreviewUnavailable);
    }
    if non_text_omissions_detected {
        reasons.push(DesktopReviewReason::NonTextOmissionsDetected);
    }
    if text_degraded_detected {
        reasons.push(DesktopReviewReason::TextDegradedDetected);
    }
    if structural_loss_suspected {
        reasons.push(DesktopReviewReason::StructuralLossSuspected);
    }

    DesktopReviewMetadata {
        requires_manual_review: non_text_omissions_detected
            || text_degraded_detected
            || structural_loss_suspected
            || low_confidence_review_required,
        extraction_provenance: extraction_provenance.map(str::to_string),
        reasons,
    }
}

fn persist_preview_edit(
    path: PathBuf,
    output_path: PathBuf,
    audit_output_path: PathBuf,
    original_text: String,
    mut audit_report: EditableAuditPreviewReport,
) -> Result<DesktopPreviewUpdateResult> {
    audit_report.output_path = output_path.clone();
    let redacted_text = render_redacted_text(&original_text, &audit_report.replacements)?;
    fs::write(&output_path, &redacted_text).map_err(|source| crate::error::AppError::WriteFile {
        path: output_path.clone(),
        source,
    })?;

    let audit_json = serde_json::to_string_pretty(&audit_report)
        .map_err(crate::error::AppError::SerializeAuditReport)?;
    fs::write(&audit_output_path, audit_json).map_err(|source| crate::error::AppError::WriteFile {
        path: audit_output_path.clone(),
        source,
    })?;

    Ok(DesktopPreviewUpdateResult {
        preview: build_preview(path, output_path, audit_output_path, &redacted_text, &audit_report)?,
        replacements: audit_report.replacements.len(),
    })
}

fn read_editable_audit_report(path: &Path) -> Result<EditableAuditPreviewReport> {
    let audit_json = fs::read_to_string(path).map_err(|source| crate::error::AppError::ReadFile {
        path: path.to_path_buf(),
        source,
    })?;
    serde_json::from_str(&audit_json).map_err(crate::error::AppError::SerializeAuditReport)
}

fn load_preview_input_as_markdown(path: &Path) -> Result<String> {
    extraction::extract_input(path).map(|extracted| extracted.text)
}

fn map_redacted_highlights(records: &[EditableAuditPreviewRecord]) -> Vec<HighlightRange> {
    let mut ranges = Vec::with_capacity(records.len());
    let mut input_cursor = 0usize;
    let mut output_cursor = 0usize;

    for record in records {
        let start = output_cursor + record.start.saturating_sub(input_cursor);
        let end = start + record.replacement.len();
        ranges.push(HighlightRange {
            start,
            end,
            label: record.entity_type.clone(),
            original_start: record.start,
            original_end: record.end,
            replacement: record.replacement.clone(),
        });
        input_cursor = record.end;
        output_cursor = end;
    }

    ranges
}

fn render_highlighted_html(text: &str, ranges: &[HighlightRange]) -> String {
    let mut html = String::new();
    let mut cursor = 0usize;

    for range in ranges {
        if range.start > text.len() || range.end > text.len() || range.start >= range.end {
            continue;
        }

        if cursor < range.start {
            html.push_str(&escape_html(&text[cursor..range.start]));
        }

        html.push_str("<mark title=\"");
        html.push_str(&escape_html(&range.label));
        html.push_str("\" data-record-start=\"");
        html.push_str(&range.original_start.to_string());
        html.push_str("\" data-record-end=\"");
        html.push_str(&range.original_end.to_string());
        html.push_str("\" data-record-replacement=\"");
        html.push_str(&escape_html(&range.replacement));
        html.push_str("\">");
        html.push_str(&escape_html(&text[range.start..range.end]));
        html.push_str("</mark>");
        cursor = range.end;
    }

    if cursor < text.len() {
        html.push_str(&escape_html(&text[cursor..]));
    }

    html
}

fn render_redacted_text(text: &str, records: &[EditableAuditPreviewRecord]) -> Result<String> {
    let mut output = String::new();
    let mut cursor = 0usize;

    for record in records {
        validate_text_range(text, record.start, record.end)?;
        if cursor > record.start {
            return Err(crate::error::AppError::InvalidPreviewEdit(
                "redaction ranges overlap in the current audit report".to_string(),
            ));
        }

        output.push_str(&text[cursor..record.start]);
        output.push_str(&record.replacement);
        cursor = record.end;
    }

    output.push_str(&text[cursor..]);
    Ok(output)
}

fn sort_and_validate_replacements(records: &mut [EditableAuditPreviewRecord]) -> Result<()> {
    records.sort_by_key(|record| (record.start, record.end));

    for window in records.windows(2) {
        if window[0].end > window[1].start {
            return Err(crate::error::AppError::InvalidPreviewEdit(
                "redaction ranges overlap in the current audit report".to_string(),
            ));
        }
    }

    Ok(())
}

fn map_selection_to_original_range(
    original_text: &str,
    records: &[EditableAuditPreviewRecord],
    source: PreviewSelectionSource,
    selection_start: usize,
    selection_end: usize,
) -> Result<(usize, usize)> {
    if selection_start >= selection_end {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "select some text before applying a manual redaction".to_string(),
        ));
    }

    let (start, end) = match source {
        PreviewSelectionSource::Original => (selection_start, selection_end),
        PreviewSelectionSource::Redacted => (
            map_redacted_offset_to_original(records, selection_start)?,
            map_redacted_offset_to_original(records, selection_end)?,
        ),
    };

    validate_text_range(original_text, start, end)?;
    Ok((start, end))
}

fn map_redacted_offset_to_original(
    records: &[EditableAuditPreviewRecord],
    offset: usize,
) -> Result<usize> {
    let mut input_cursor = 0usize;
    let mut output_cursor = 0usize;

    for record in records {
        let unchanged_len = record.start.saturating_sub(input_cursor);
        let replacement_start = output_cursor + unchanged_len;
        if offset <= replacement_start {
            return Ok(input_cursor + offset.saturating_sub(output_cursor));
        }

        let replacement_end = replacement_start + record.replacement.len();
        if offset < replacement_end {
            return Err(crate::error::AppError::InvalidPreviewEdit(
                "cannot add a new redaction from inside an existing redacted replacement".to_string(),
            ));
        }

        input_cursor = record.end;
        output_cursor = replacement_end;
    }

    Ok(input_cursor + offset.saturating_sub(output_cursor))
}

fn overlaps_existing_replacement(
    records: &[EditableAuditPreviewRecord],
    start: usize,
    end: usize,
) -> bool {
    records
        .iter()
        .any(|record| start < record.end && end > record.start)
}

fn validate_text_range(text: &str, start: usize, end: usize) -> Result<()> {
    if start > text.len() || end > text.len() || start >= end {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text is outside the current preview bounds".to_string(),
        ));
    }

    if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text does not align to valid character boundaries".to_string(),
        ));
    }

    Ok(())
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use tempfile::tempdir;

    use crate::RunFileStatusKind;
    use lopdf::content::{Content, Operation};
    use lopdf::{Document, Object, Stream, dictionary};

    use super::{
        DesktopAddRedactionRequest, DesktopRemoveRedactionRequest, DesktopReplaceRequest,
        DesktopReviewReason, DesktopReviewRequest, PreviewSelectionSource, add_manual_redaction,
        load_preview_input_as_markdown, read_editable_audit_report, remove_redaction,
        run_replace_job, run_review_job,
    };

    #[test]
    fn desktop_review_job_uses_real_non_writing_review_workflow() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.md");
        let config = temp.path().join("deid.toml");

        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_review_job(DesktopReviewRequest {
            input,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.replacements, 2);
        assert!(!result.non_text_omissions_detected);
        assert_eq!(result.file_statuses.len(), 1);
        assert_eq!(result.file_statuses[0].status, RunFileStatusKind::Reviewed);
        assert_eq!(result.file_statuses[0].replacements, 2);
        assert!(result.file_statuses[0].review_sensitive);
        assert!(
            result
                .review_summary
                .contains("[configured:client] Jane Doe -> CLIENT")
        );
        assert!(
            result
                .review_summary
                .contains("[redact-core:EMAIL_ADDRESS]")
        );
        assert!(
            result
                .coverage_note
                .contains("Structured identifiers were processed")
        );
        assert!(!temp.path().join("note.deidentified.md").exists());
        assert!(!temp.path().join("note.audit.json").exists());
    }

    #[test]
    fn desktop_replace_job_uses_real_writing_replace_workflow() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.replacements, 2);
        assert_eq!(result.output_path, input_dir.join("redacted"));
        assert_eq!(result.audit_output_path, input_dir.join("redacted/.audit"));
        assert_eq!(result.file_statuses.len(), 1);
        assert_eq!(result.file_statuses[0].path, PathBuf::from("note.md"));
        assert_eq!(result.file_statuses[0].status, RunFileStatusKind::Processed);
        assert_eq!(result.file_statuses[0].replacements, 2);
        assert_eq!(
            result.file_statuses[0].output_path,
            Some(input_dir.join("redacted/note.md"))
        );
        assert_eq!(result.file_previews.len(), 1);
        assert_eq!(result.file_previews[0].path, PathBuf::from("note.md"));
        assert!(
            result.file_previews[0].original_html.as_ref().is_some_and(
                |html| {
                    html.contains("data-record-start=")
                        && html.contains("title=\"EMAIL_ADDRESS\"")
                        && html.contains(">jane@example.com</mark>")
                }
            )
        );
        assert!(
            result.file_previews[0]
                .redacted_html
                .contains("title=\"EMAIL_ADDRESS\"")
                && result.file_previews[0].redacted_html.contains(">[EMAIL_ADDRESS]</mark>")
        );
        assert!(input_dir.join("redacted/note.md").exists());
        assert!(input_dir.join("redacted/.audit/note.audit.json").exists());
    }

    #[test]
    fn desktop_replace_job_builds_original_preview_for_pdf_inputs() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        let input = input_dir.join("note.pdf");
        write_test_pdf(
            &input,
            "Student: Teddy Roosevelt Phone: (202) 456-1111 Date of Birth: October 27, 1858",
        );

        let result = run_replace_job(DesktopReplaceRequest {
            input: input.clone(),
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.file_previews.len(), 1);
        let preview = &result.file_previews[0];
        assert_eq!(preview.path, input);
        assert_eq!(preview.review.extraction_provenance.as_deref(), Some("pdf_text"));
        assert!(
            preview
                .original_html
                .as_ref()
                .is_some_and(|html| html.contains("(202) 456-1111"))
        );
        assert!(preview.redacted_html.contains("[PHONE_NUMBER]"));
    }

    #[test]
    fn desktop_replace_job_surfaces_docx_omission_note_in_preview() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        let input = input_dir.join("note.docx");
        fs::write(
            &input,
            build_test_docx_bytes(
                r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Image follows</w:t></w:r><w:r><w:drawing/></w:r></w:p></w:body></w:document>"#,
            ),
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert!(result.file_previews[0]
            .review
            .reasons
            .contains(&DesktopReviewReason::NonTextOmissionsDetected));
    }

    #[test]
    fn add_manual_redaction_persists_preview_edit() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
        })
        .unwrap();

        assert_eq!(updated.replacements, 3);
        assert!(updated.preview.redacted_html.contains("[MANUAL_REDACTION]"));
        assert!(
            updated
                .preview
                .original_html
                .as_ref()
                .is_some_and(|html| html.contains("MANUAL_REDACTION"))
        );
        assert!(
            fs::read_to_string(&preview.output_path)
                .unwrap()
                .contains("[MANUAL_REDACTION]")
        );
    }

    #[test]
    fn remove_redaction_restores_original_segment() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let audit_report = read_editable_audit_report(&preview.audit_output_path).unwrap();
        let email_record = audit_report
            .replacements
            .iter()
            .find(|record| record.entity_type == "EMAIL_ADDRESS")
            .unwrap();

        let updated = remove_redaction(DesktopRemoveRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            start: email_record.start,
            end: email_record.end,
            replacement: email_record.replacement.clone(),
        })
        .unwrap();

        assert_eq!(updated.replacements, 1);
        assert!(updated.preview.redacted_html.contains("jane@example.com"));
        assert!(
            fs::read_to_string(&preview.output_path)
                .unwrap()
                .contains("jane@example.com")
        );
    }

    fn write_test_pdf(path: &std::path::Path, text: &str) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Courier",
        });
        let resources_id = doc.add_object(dictionary! {
            "Font" => dictionary! {
                "F1" => font_id,
            },
        });
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 12.into()]),
                Operation::new("Td", vec![50.into(), 700.into()]),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        });
        let pages = dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        };
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        doc.compress();
        doc.save(path).unwrap();
    }

    fn build_test_docx_bytes(document_xml: &str) -> Vec<u8> {
        let mut buffer = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("word/document.xml", options).unwrap();
        std::io::Write::write_all(&mut zip, document_xml.as_bytes()).unwrap();
        zip.finish().unwrap();
        buffer.into_inner()
    }
}
