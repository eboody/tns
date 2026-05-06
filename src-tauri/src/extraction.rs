use std::{fs, path::Path};

use crate::{
    audit::ExtractionStatus, docx_extract, error::AppError, error::Result, pdf_extract,
};

const OMITTED_NON_TEXT_CONTENT: &str = "[OMITTED_NON_TEXT_CONTENT]";

#[derive(Debug, Clone)]
pub struct ExtractedInput {
    pub text: String,
    pub non_text_omissions_detected: bool,
    pub text_degraded_detected: bool,
    pub extraction_status: ExtractionStatus,
}

pub fn extract_input(input: &Path) -> Result<ExtractedInput> {
    match input.extension().and_then(|ext| ext.to_str()) {
        Some("md" | "txt") => fs::read_to_string(input)
            .map(|text| ExtractedInput {
                text,
                non_text_omissions_detected: false,
                text_degraded_detected: false,
                extraction_status: ExtractionStatus::CleanText,
            })
            .map_err(|source| AppError::ReadFile {
                path: input.to_path_buf(),
                source,
            }),
        Some("docx") => {
            let text = docx_extract::extract_docx_to_markdown(input)?;
            let non_text_omissions_detected = text.contains(OMITTED_NON_TEXT_CONTENT);
            Ok(ExtractedInput {
                text,
                non_text_omissions_detected,
                text_degraded_detected: false,
                extraction_status: classify_extraction_status(non_text_omissions_detected, false),
            })
        }
        Some("pdf") => {
            let extracted = pdf_extract::extract_pdf(input)?;
            Ok(ExtractedInput {
                text: extracted.text,
                non_text_omissions_detected: false,
                text_degraded_detected: extracted.text_degraded_detected,
                extraction_status: classify_extraction_status(false, extracted.text_degraded_detected),
            })
        }
        _ => Err(AppError::UnsupportedInputFormat(input.to_path_buf())),
    }
}

pub fn classify_extraction_status(
    non_text_omissions_detected: bool,
    text_degraded_detected: bool,
) -> ExtractionStatus {
    match (non_text_omissions_detected, text_degraded_detected) {
        (false, false) => ExtractionStatus::CleanText,
        (true, false) => ExtractionStatus::NonTextOmissions,
        (false, true) => ExtractionStatus::TextDegraded,
        (true, true) => ExtractionStatus::TextDegradedWithNonTextOmissions,
    }
}

pub fn extraction_status_label(status: ExtractionStatus) -> &'static str {
    match status {
        ExtractionStatus::CleanText => "clean_text",
        ExtractionStatus::NonTextOmissions => "non_text_omissions",
        ExtractionStatus::TextDegraded => "text_degraded",
        ExtractionStatus::TextDegradedWithNonTextOmissions => {
            "text_degraded_with_non_text_omissions"
        }
    }
}
