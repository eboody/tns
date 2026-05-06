use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

use crate::{
    audit::ExtractionStatus, docx_extract, error::AppError, error::Result, pdf_extract,
};

const OMITTED_NON_TEXT_CONTENT: &str = "[OMITTED_NON_TEXT_CONTENT]";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractionProvenance {
    PlainText,
    DocxText,
    PdfText,
    OcrText,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractionFidelity {
    pub provenance: ExtractionProvenance,
    pub non_text_omissions_detected: bool,
    pub structural_loss_suspected: bool,
    pub text_degraded_detected: bool,
    pub low_confidence_review_required: bool,
}

pub fn extraction_provenance_label(provenance: ExtractionProvenance) -> &'static str {
    match provenance {
        ExtractionProvenance::PlainText => "plain_text",
        ExtractionProvenance::DocxText => "docx_text",
        ExtractionProvenance::PdfText => "pdf_text",
        ExtractionProvenance::OcrText => "ocr_text",
    }
}

impl ExtractionFidelity {
    pub fn plain_text() -> Self {
        Self {
            provenance: ExtractionProvenance::PlainText,
            non_text_omissions_detected: false,
            structural_loss_suspected: false,
            text_degraded_detected: false,
            low_confidence_review_required: false,
        }
    }

    pub fn docx(non_text_omissions_detected: bool, structural_loss_suspected: bool) -> Self {
        Self {
            provenance: ExtractionProvenance::DocxText,
            non_text_omissions_detected,
            structural_loss_suspected,
            text_degraded_detected: false,
            low_confidence_review_required: structural_loss_suspected,
        }
    }

    pub fn pdf(text_degraded_detected: bool) -> Self {
        Self {
            provenance: ExtractionProvenance::PdfText,
            non_text_omissions_detected: false,
            structural_loss_suspected: false,
            text_degraded_detected,
            low_confidence_review_required: text_degraded_detected,
        }
    }

    pub fn ocr(
        non_text_omissions_detected: bool,
        structural_loss_suspected: bool,
        text_degraded_detected: bool,
    ) -> Self {
        Self {
            provenance: ExtractionProvenance::OcrText,
            non_text_omissions_detected,
            structural_loss_suspected,
            text_degraded_detected,
            low_confidence_review_required: true,
        }
    }

    pub fn extraction_status(self) -> ExtractionStatus {
        classify_extraction_status(
            self.non_text_omissions_detected || self.structural_loss_suspected,
            self.text_degraded_detected || self.low_confidence_review_required,
        )
    }
}

#[derive(Debug, Clone)]
pub struct ExtractedInput {
    pub text: String,
    pub fidelity: ExtractionFidelity,
}

impl ExtractedInput {
    pub fn non_text_omissions_detected(&self) -> bool {
        self.fidelity.non_text_omissions_detected
    }

    pub fn text_degraded_detected(&self) -> bool {
        self.fidelity.text_degraded_detected
    }

    pub fn extraction_status(&self) -> ExtractionStatus {
        self.fidelity.extraction_status()
    }
}

pub fn extract_input(input: &Path) -> Result<ExtractedInput> {
    match input.extension().and_then(|ext| ext.to_str()) {
        Some("md" | "txt") => fs::read_to_string(input)
            .map(|text| ExtractedInput {
                text,
                fidelity: ExtractionFidelity::plain_text(),
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
                fidelity: ExtractionFidelity::docx(non_text_omissions_detected, false),
            })
        }
        Some("pdf") => {
            let extracted = pdf_extract::extract_pdf(input)?;
            Ok(ExtractedInput {
                text: extracted.text,
                fidelity: ExtractionFidelity::pdf(extracted.text_degraded_detected),
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

#[cfg(test)]
mod tests {
    use super::{ExtractionFidelity, ExtractionProvenance};
    use crate::audit::ExtractionStatus;

    #[test]
    fn plain_text_fidelity_is_clean() {
        let fidelity = ExtractionFidelity::plain_text();

        assert_eq!(fidelity.provenance, ExtractionProvenance::PlainText);
        assert!(!fidelity.non_text_omissions_detected);
        assert!(!fidelity.structural_loss_suspected);
        assert!(!fidelity.text_degraded_detected);
        assert!(!fidelity.low_confidence_review_required);
        assert_eq!(fidelity.extraction_status(), ExtractionStatus::CleanText);
    }

    #[test]
    fn docx_omissions_are_not_reported_as_clean() {
        let fidelity = ExtractionFidelity::docx(true, false);

        assert_eq!(fidelity.provenance, ExtractionProvenance::DocxText);
        assert!(!fidelity.low_confidence_review_required);
        assert_eq!(fidelity.extraction_status(), ExtractionStatus::NonTextOmissions);
    }

    #[test]
    fn degraded_pdf_is_not_reported_as_clean() {
        let fidelity = ExtractionFidelity::pdf(true);

        assert_eq!(fidelity.provenance, ExtractionProvenance::PdfText);
        assert!(fidelity.low_confidence_review_required);
        assert_eq!(fidelity.extraction_status(), ExtractionStatus::TextDegraded);
    }

    #[test]
    fn structural_loss_alone_is_not_reported_as_clean() {
        let fidelity = ExtractionFidelity::docx(false, true);

        assert!(fidelity.structural_loss_suspected);
        assert!(fidelity.low_confidence_review_required);
        assert_eq!(fidelity.extraction_status(), ExtractionStatus::TextDegradedWithNonTextOmissions);
    }
}
