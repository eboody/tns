use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{Result, RunFileStatus, RunMode, RunOptions, docx_extract, pdf_extract, run};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesktopReviewRequest {
    pub input: PathBuf,
    pub config: Option<PathBuf>,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
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
pub struct DesktopFilePreview {
    pub path: PathBuf,
    pub original_html: Option<String>,
    pub redacted_html: String,
    pub preview_note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AuditPreviewReport {
    input_path: PathBuf,
    replacements: Vec<AuditPreviewRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct AuditPreviewRecord {
    entity_type: String,
    replacement: String,
    start: usize,
    end: usize,
}

#[derive(Debug, Clone)]
struct HighlightRange {
    start: usize,
    end: usize,
    label: String,
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
        let audit_report: AuditPreviewReport = serde_json::from_str(&audit_json)
            .map_err(crate::error::AppError::SerializeAuditReport)?;

        let original_text = load_preview_input_as_markdown(&audit_report.input_path).ok();

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
                    })
                    .collect::<Vec<_>>(),
            )
        });
        let redacted_html = render_highlighted_html(
            &redacted_text,
            &map_redacted_highlights(&audit_report.replacements),
        );

        previews.push(DesktopFilePreview {
            path: status.path.clone(),
            original_html,
            redacted_html,
            preview_note: if original_text.is_none() {
                Some(
                    "Original preview is not available for this file type in the current desktop slice."
                        .to_string(),
                )
            } else {
                None
            },
        });
    }

    Ok(previews)
}

fn load_preview_input_as_markdown(path: &Path) -> Result<String> {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("md" | "txt") => {
            fs::read_to_string(path).map_err(|source| crate::error::AppError::ReadFile {
                path: path.to_path_buf(),
                source,
            })
        }
        Some("docx") => docx_extract::extract_docx_to_markdown(path),
        Some("pdf") => pdf_extract::extract_pdf_to_markdown(path),
        _ => Err(crate::error::AppError::UnsupportedInputFormat(
            path.to_path_buf(),
        )),
    }
}

fn map_redacted_highlights(records: &[AuditPreviewRecord]) -> Vec<HighlightRange> {
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

    use super::{DesktopReplaceRequest, DesktopReviewRequest, run_replace_job, run_review_job};

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
                |html| html.contains("<mark title=\"EMAIL_ADDRESS\">jane@example.com</mark>")
            )
        );
        assert!(
            result.file_previews[0]
                .redacted_html
                .contains("<mark title=\"EMAIL_ADDRESS\">[EMAIL_ADDRESS]</mark>")
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
        assert!(
            preview
                .original_html
                .as_ref()
                .is_some_and(|html| html.contains("(202) 456-1111"))
        );
        assert!(preview.redacted_html.contains("[PHONE_NUMBER]"));
        assert!(preview.preview_note.is_none());
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
}
