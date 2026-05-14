use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

use crate::{
    audit::ExtractionStatus,
    docx_extract,
    error::AppError,
    error::Result,
    extractor_pipeline::{ExtractionAttemptRecord, select_first_success},
    ocr_extract, pdf_extract,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractionProvenance {
    PlainText,
    DocxText,
    PdfText,
    OcrText,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractionStrategy {
    PlainText,
    DocxXml,
    PdfLopdf,
    PdfPdftotext,
    PdfOcr,
    ImageOcr,
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

pub fn extraction_strategy_label(strategy: ExtractionStrategy) -> &'static str {
    match strategy {
        ExtractionStrategy::PlainText => "plain_text",
        ExtractionStrategy::DocxXml => "docx_xml",
        ExtractionStrategy::PdfLopdf => "pdf_lopdf",
        ExtractionStrategy::PdfPdftotext => "pdf_pdftotext",
        ExtractionStrategy::PdfOcr => "pdf_ocr",
        ExtractionStrategy::ImageOcr => "image_ocr",
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

    pub fn pdf(text_degraded_detected: bool, low_confidence_review_required: bool) -> Self {
        Self {
            provenance: ExtractionProvenance::PdfText,
            non_text_omissions_detected: false,
            structural_loss_suspected: false,
            text_degraded_detected,
            low_confidence_review_required,
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
    pub strategy: ExtractionStrategy,
    pub attempts: Vec<ExtractionAttemptRecord>,
}

impl ExtractedInput {
    fn successful(
        text: String,
        fidelity: ExtractionFidelity,
        strategy: ExtractionStrategy,
    ) -> Self {
        Self {
            text,
            fidelity,
            strategy,
            attempts: vec![ExtractionAttemptRecord::succeeded(strategy)],
        }
    }

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
    match normalized_extension(input).as_deref() {
        Some("md" | "txt") => fs::read_to_string(input)
            .map(|text| {
                ExtractedInput::successful(
                    text,
                    ExtractionFidelity::plain_text(),
                    ExtractionStrategy::PlainText,
                )
            })
            .map_err(|source| AppError::ReadFile {
                path: input.to_path_buf(),
                source,
            }),
        Some("docx") => {
            let extracted = docx_extract::extract_docx(input)?;
            Ok(ExtractedInput::successful(
                extracted.text,
                ExtractionFidelity::docx(
                    extracted.non_text_omissions_detected,
                    extracted.structural_loss_suspected,
                ),
                ExtractionStrategy::DocxXml,
            ))
        }
        Some("pdf") => extract_pdf_input(input),
        Some(extension) if is_supported_image_extension(extension) => extract_image_input(input),
        _ => Err(AppError::UnsupportedInputFormat(input.to_path_buf())),
    }
}

pub fn normalized_extension(input: &Path) -> Option<String> {
    input
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

pub fn is_supported_image_extension(extension: &str) -> bool {
    matches!(
        extension,
        "png" | "jpg" | "jpeg" | "tif" | "tiff" | "bmp" | "webp"
    )
}

fn extract_pdf_input(input: &Path) -> Result<ExtractedInput> {
    let lopdf = pdf_extract::extract_pdf_with_lopdf(input);
    let pdftotext = pdf_extract::extract_pdf_with_pdftotext(input);
    let ocr =
        ocr_extract::extract_pdf_via_ocr_attempt(input).map(|ocr| pdf_extract::PdfExtraction {
            text: ocr.text,
            text_degraded_detected: false,
            low_confidence_review_required: true,
            quality_penalty: usize::MAX / 4,
        });

    let selected = match (&lopdf, &pdftotext) {
        (
            crate::extractor_pipeline::ExtractionAttempt::Extracted {
                value: lopdf_value, ..
            },
            crate::extractor_pipeline::ExtractionAttempt::Extracted {
                value: pdftotext_value,
                ..
            },
        ) if pdf_extract::should_prefer_pdftotext(lopdf_value, pdftotext_value) => {
            select_first_success(
                [pdftotext, lopdf, ocr],
                "PDF contains no extractable text; treat as non-extractable or low-confidence",
            )?
        }
        _ => select_first_success(
            [lopdf, pdftotext, ocr],
            "PDF contains no extractable text; treat as non-extractable or low-confidence",
        )?,
    };

    let mut extracted = match selected.strategy {
        ExtractionStrategy::PdfLopdf | ExtractionStrategy::PdfPdftotext => {
            let fidelity = ExtractionFidelity::pdf(
                selected.value.text_degraded_detected,
                selected.value.low_confidence_review_required,
            );
            ExtractedInput::successful(selected.value.text, fidelity, selected.strategy)
        }
        ExtractionStrategy::PdfOcr => ExtractedInput::successful(
            selected.value.text,
            ExtractionFidelity::ocr(false, true, false),
            selected.strategy,
        ),
        _ => unreachable!("unexpected strategy for PDF extraction"),
    };
    extracted.attempts = selected.attempts;
    Ok(extracted)
}

fn extract_image_input(input: &Path) -> Result<ExtractedInput> {
    extract_image_input_with_attempt(ocr_extract::extract_image_via_ocr_attempt(input))
}

fn extract_image_input_with_attempt(
    ocr: crate::extractor_pipeline::ExtractionAttempt<ocr_extract::OcrExtraction>,
) -> Result<ExtractedInput> {
    let selected = select_first_success(
        [ocr],
        "Image OCR produced no text; install/configure OCR tooling or provide a text-based source",
    )?;

    let mut extracted = ExtractedInput::successful(
        selected.value.text,
        ExtractionFidelity::ocr(false, true, false),
        ExtractionStrategy::ImageOcr,
    );
    extracted.attempts = selected.attempts;
    Ok(extracted)
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
    use super::{
        ExtractedInput, ExtractionFidelity, ExtractionProvenance, ExtractionStrategy,
        extract_image_input_with_attempt, extraction_strategy_label, is_supported_image_extension,
        normalized_extension,
    };
    use crate::audit::ExtractionStatus;
    use crate::extractor_pipeline::ExtractionAttempt;
    use crate::ocr_extract::OcrExtraction;
    use std::path::Path;

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
        assert_eq!(
            fidelity.extraction_status(),
            ExtractionStatus::NonTextOmissions
        );
    }

    #[test]
    fn degraded_pdf_is_not_reported_as_clean() {
        let fidelity = ExtractionFidelity::pdf(true, true);

        assert_eq!(fidelity.provenance, ExtractionProvenance::PdfText);
        assert!(fidelity.low_confidence_review_required);
        assert_eq!(fidelity.extraction_status(), ExtractionStatus::TextDegraded);
    }

    #[test]
    fn structural_loss_alone_is_not_reported_as_clean() {
        let fidelity = ExtractionFidelity::docx(false, true);

        assert!(fidelity.structural_loss_suspected);
        assert!(fidelity.low_confidence_review_required);
        assert_eq!(
            fidelity.extraction_status(),
            ExtractionStatus::TextDegradedWithNonTextOmissions
        );
    }

    #[test]
    fn extraction_strategy_labels_match_serialized_values() {
        assert_eq!(
            extraction_strategy_label(ExtractionStrategy::PlainText),
            "plain_text"
        );
        assert_eq!(
            extraction_strategy_label(ExtractionStrategy::DocxXml),
            "docx_xml"
        );
        assert_eq!(
            extraction_strategy_label(ExtractionStrategy::PdfPdftotext),
            "pdf_pdftotext"
        );
        assert_eq!(
            extraction_strategy_label(ExtractionStrategy::PdfOcr),
            "pdf_ocr"
        );
        assert_eq!(
            extraction_strategy_label(ExtractionStrategy::ImageOcr),
            "image_ocr"
        );
    }

    #[test]
    fn image_extensions_are_normalized_and_supported() {
        assert_eq!(
            normalized_extension(Path::new("transcript.JPG")).as_deref(),
            Some("jpg")
        );
        assert!(is_supported_image_extension("png"));
        assert!(is_supported_image_extension("tiff"));
        assert!(!is_supported_image_extension("gif"));
    }

    #[test]
    fn image_ocr_attempt_becomes_low_confidence_extracted_input() {
        let extracted = extract_image_input_with_attempt(ExtractionAttempt::extracted(
            ExtractionStrategy::ImageOcr,
            OcrExtraction {
                text: "OCR transcript text".to_string(),
            },
        ))
        .unwrap();

        assert!(matches!(
            extracted,
            ExtractedInput {
                text,
                fidelity,
                strategy: ExtractionStrategy::ImageOcr,
                ..
            } if text == "OCR transcript text"
                && fidelity.provenance == ExtractionProvenance::OcrText
                && fidelity.structural_loss_suspected
                && fidelity.low_confidence_review_required
        ));
    }
}
