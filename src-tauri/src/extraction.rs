use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OcrCacheKind {
    Pdf,
    Image,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OcrCacheKey {
    kind: OcrCacheKind,
    path: PathBuf,
    len: u64,
    modified_nanos: Option<u128>,
    runtime_signature: String,
}

#[derive(Debug, Default)]
struct OcrExtractionCache {
    entries: VecDeque<(OcrCacheKey, ExtractedInput)>,
}

const OCR_CACHE_LIMIT: usize = 16;

static OCR_EXTRACTION_CACHE: OnceLock<Mutex<OcrExtractionCache>> = OnceLock::new();

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

    let selected_text = match (&lopdf, &pdftotext) {
        (
            crate::extractor_pipeline::ExtractionAttempt::Extracted {
                value: lopdf_value, ..
            },
            crate::extractor_pipeline::ExtractionAttempt::Extracted {
                value: pdftotext_value,
                ..
            },
        ) if pdf_extract::should_prefer_pdftotext(lopdf_value, pdftotext_value) => {
            Some(select_first_success(
                [pdftotext.clone(), lopdf.clone()],
                "PDF contains no extractable text; treat as non-extractable or low-confidence",
            )?)
        }
        (crate::extractor_pipeline::ExtractionAttempt::Extracted { .. }, _) => {
            Some(select_first_success(
                [lopdf.clone(), pdftotext.clone()],
                "PDF contains no extractable text; treat as non-extractable or low-confidence",
            )?)
        }
        (_, crate::extractor_pipeline::ExtractionAttempt::Extracted { .. }) => {
            Some(select_first_success(
                [pdftotext.clone(), lopdf.clone()],
                "PDF contains no extractable text; treat as non-extractable or low-confidence",
            )?)
        }
        _ => None,
    };

    let Some(selected) = selected_text else {
        return cached_ocr_extraction(input, OcrCacheKind::Pdf, || {
            extract_pdf_ocr_input_with_attempts(input, lopdf, pdftotext)
        });
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

fn extract_pdf_ocr_input_with_attempts(
    input: &Path,
    lopdf: crate::extractor_pipeline::ExtractionAttempt<pdf_extract::PdfExtraction>,
    pdftotext: crate::extractor_pipeline::ExtractionAttempt<pdf_extract::PdfExtraction>,
) -> Result<ExtractedInput> {
    let ocr =
        ocr_extract::extract_pdf_via_ocr_attempt(input).map(|ocr| pdf_extract::PdfExtraction {
            text: ocr.text,
            text_degraded_detected: false,
            low_confidence_review_required: true,
            quality_penalty: usize::MAX / 4,
        });

    let selected = select_first_success(
        [lopdf, pdftotext, ocr],
        "PDF contains no extractable text; treat as non-extractable or low-confidence",
    )?;

    let mut extracted = match selected.strategy {
        ExtractionStrategy::PdfOcr => ExtractedInput::successful(
            selected.value.text,
            ExtractionFidelity::ocr(false, true, false),
            selected.strategy,
        ),
        _ => unreachable!("text PDF extraction should have been selected before OCR fallback"),
    };
    extracted.attempts = selected.attempts;
    Ok(extracted)
}

fn extract_image_input(input: &Path) -> Result<ExtractedInput> {
    cached_ocr_extraction(input, OcrCacheKind::Image, || {
        extract_image_input_with_attempt(ocr_extract::extract_image_via_ocr_attempt(input))
    })
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

fn cached_ocr_extraction(
    input: &Path,
    kind: OcrCacheKind,
    extract: impl FnOnce() -> Result<ExtractedInput>,
) -> Result<ExtractedInput> {
    let Some(key) = ocr_cache_key(input, kind) else {
        return extract();
    };

    if let Some(extracted) = lookup_cached_ocr_extraction(&key) {
        return Ok(extracted);
    }

    let extracted = extract()?;
    if extracted.fidelity.provenance == ExtractionProvenance::OcrText {
        store_cached_ocr_extraction(key, extracted.clone());
    }
    Ok(extracted)
}

fn ocr_cache_key(input: &Path, kind: OcrCacheKind) -> Option<OcrCacheKey> {
    let metadata = fs::metadata(input).ok()?;
    let modified_nanos = metadata.modified().ok().and_then(system_time_nanos);
    Some(OcrCacheKey {
        kind,
        path: input.canonicalize().unwrap_or_else(|_| input.to_path_buf()),
        len: metadata.len(),
        modified_nanos,
        runtime_signature: ocr_extract::ocr_runtime_cache_signature(),
    })
}

fn system_time_nanos(time: SystemTime) -> Option<u128> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_nanos())
}

fn lookup_cached_ocr_extraction(key: &OcrCacheKey) -> Option<ExtractedInput> {
    let cache = OCR_EXTRACTION_CACHE
        .get_or_init(|| Mutex::new(OcrExtractionCache::default()))
        .lock()
        .ok()?;
    cache
        .entries
        .iter()
        .find(|(cached_key, _)| cached_key == key)
        .map(|(_, extracted)| extracted.clone())
}

fn store_cached_ocr_extraction(key: OcrCacheKey, extracted: ExtractedInput) {
    let Ok(mut cache) = OCR_EXTRACTION_CACHE
        .get_or_init(|| Mutex::new(OcrExtractionCache::default()))
        .lock()
    else {
        return;
    };

    cache.entries.retain(|(cached_key, _)| cached_key != &key);
    cache.entries.push_back((key, extracted));
    while cache.entries.len() > OCR_CACHE_LIMIT {
        cache.entries.pop_front();
    }
}

#[cfg(test)]
fn clear_ocr_extraction_cache_for_tests() {
    if let Some(cache) = OCR_EXTRACTION_CACHE.get()
        && let Ok(mut cache) = cache.lock()
    {
        cache.entries.clear();
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
    use super::{
        ExtractedInput, ExtractionFidelity, ExtractionProvenance, ExtractionStrategy, OcrCacheKind,
        cached_ocr_extraction, clear_ocr_extraction_cache_for_tests,
        extract_image_input_with_attempt, extraction_strategy_label, is_supported_image_extension,
        normalized_extension,
    };
    use crate::audit::ExtractionStatus;
    use crate::extractor_pipeline::ExtractionAttempt;
    use crate::ocr_extract::OcrExtraction;
    use std::{cell::Cell, fs, path::Path};
    use tempfile::tempdir;

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

    #[test]
    fn ocr_extraction_cache_reuses_unchanged_ocr_input() {
        clear_ocr_extraction_cache_for_tests();
        let temp = tempdir().unwrap();
        let input = temp.path().join("scan.png");
        fs::write(&input, b"fake image bytes").unwrap();
        let calls = Cell::new(0usize);

        for _ in 0..2 {
            let extracted = cached_ocr_extraction(&input, OcrCacheKind::Image, || {
                calls.set(calls.get() + 1);
                Ok(ExtractedInput::successful(
                    "cached OCR text".to_string(),
                    ExtractionFidelity::ocr(false, true, false),
                    ExtractionStrategy::ImageOcr,
                ))
            })
            .unwrap();

            assert_eq!(extracted.text, "cached OCR text");
        }

        assert_eq!(calls.get(), 1);
        clear_ocr_extraction_cache_for_tests();
    }
}
