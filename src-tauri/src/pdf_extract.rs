use std::{
    path::Path,
    process::{Command, Stdio},
};

use lopdf::Document;
use regex::Regex;

use crate::{
    error::Result,
    extraction::ExtractionStrategy,
    extractor_pipeline::{ExtractionAttempt, select_first_success},
};

#[derive(Debug, Clone)]
pub struct PdfExtraction {
    pub text: String,
    pub text_degraded_detected: bool,
    pub low_confidence_review_required: bool,
}

pub fn extract_pdf_to_markdown(path: &Path) -> Result<String> {
    Ok(extract_pdf(path)?.text)
}

pub fn extract_pdf(path: &Path) -> Result<PdfExtraction> {
    Ok(select_first_success(
        [
            extract_pdf_with_lopdf(path),
            extract_pdf_with_pdftotext(path),
        ],
        "PDF contains no extractable text; treat as non-extractable or low-confidence",
    )?
    .value)
}

pub fn extract_pdf_with_lopdf(path: &Path) -> ExtractionAttempt<PdfExtraction> {
    extract_pdf_text_with_lopdf(path).map(build_pdf_extraction)
}

pub fn extract_pdf_with_pdftotext(path: &Path) -> ExtractionAttempt<PdfExtraction> {
    extract_pdf_text_with_pdftotext(path, "pdftotext").map(build_pdf_extraction)
}

fn build_pdf_extraction(text: String) -> PdfExtraction {
    let token_fusion_suspected = token_fusion_suspected(&text);
    let repeated_page_furniture_suspected = repeated_page_furniture_suspected(&text);
    let normalized = normalize_extracted_pdf_text(&text);
    PdfExtraction {
        text_degraded_detected: token_fusion_suspected,
        low_confidence_review_required: token_fusion_suspected || repeated_page_furniture_suspected,
        text: normalized,
    }
}

fn extract_pdf_text_with_lopdf(path: &Path) -> ExtractionAttempt<String> {
    let doc = match Document::load(path) {
        Ok(doc) => doc,
        Err(error) => {
            return ExtractionAttempt::failed(
                ExtractionStrategy::PdfLopdf,
                format!("failed to load PDF: {error}"),
            );
        }
    };

    let pages = doc.get_pages();
    let page_numbers: Vec<u32> = pages.keys().copied().collect();
    match doc.extract_text(&page_numbers) {
        Ok(text) if text.trim().is_empty() => {
            ExtractionAttempt::empty(ExtractionStrategy::PdfLopdf, None)
        }
        Ok(text) => ExtractionAttempt::extracted(ExtractionStrategy::PdfLopdf, text),
        Err(error) => ExtractionAttempt::failed(
            ExtractionStrategy::PdfLopdf,
            format!("failed to extract PDF text: {error}"),
        ),
    }
}

fn extract_pdf_text_with_pdftotext(path: &Path, tool: &str) -> ExtractionAttempt<String> {
    if !tool_available(tool) {
        return ExtractionAttempt::unavailable(
            ExtractionStrategy::PdfPdftotext,
            Some(format!("{tool} unavailable")),
        );
    }

    let output = match Command::new(tool)
        .arg("-layout")
        .arg("-nopgbrk")
        .arg(path)
        .arg("-")
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            return ExtractionAttempt::failed(
                ExtractionStrategy::PdfPdftotext,
                format!("failed to run {tool}: {error}"),
            );
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if stderr.is_empty() {
            format!("{tool} exited with status {}", output.status)
        } else {
            stderr
        };
        return ExtractionAttempt::failed(ExtractionStrategy::PdfPdftotext, detail);
    }

    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.trim().is_empty() {
        ExtractionAttempt::empty(ExtractionStrategy::PdfPdftotext, None)
    } else {
        ExtractionAttempt::extracted(ExtractionStrategy::PdfPdftotext, text)
    }
}

fn tool_available(tool: &str) -> bool {
    Command::new(tool)
        .arg("-h")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success() || !status.success())
}

fn token_fusion_suspected(text: &str) -> bool {
    [
        r"([:;])(\S)",
        r"([a-z\)])([A-Z])",
        r"([A-Za-z])(\d)",
        r"(\d)([A-Za-z])",
        r"(\d{1,2}/\d{1,2}/\d{4})(\d{1,2}/\d{1,2}/\d{4})",
    ]
    .into_iter()
    .any(|pattern| Regex::new(pattern).expect("valid regex").is_match(text))
}

fn repeated_page_furniture_suspected(text: &str) -> bool {
    let page_marker = Regex::new(r"(?im)^.*page\s+\d+\s+of\s+\d+.*$").expect("valid regex");
    page_marker.find_iter(text).count() >= 2
}

fn normalize_extracted_pdf_text(text: &str) -> String {
    let collapsed_line_whitespace = Regex::new(r"[ \t]+")
        .expect("valid regex")
        .replace_all(text, " ")
        .into_owned();

    let normalized_newlines = Regex::new(r"\n{3,}")
        .expect("valid regex")
        .replace_all(&collapsed_line_whitespace, "\n\n")
        .into_owned();

    let inserted_colon_spaces = Regex::new(r"([:;])(\S)")
        .expect("valid regex")
        .replace_all(&normalized_newlines, "$1 $2")
        .into_owned();

    let inserted_lower_upper_spaces = Regex::new(r"([a-z\)])([A-Z])")
        .expect("valid regex")
        .replace_all(&inserted_colon_spaces, "$1 $2")
        .into_owned();

    let inserted_alpha_digit_spaces = Regex::new(r"([A-Za-z])(\d)")
        .expect("valid regex")
        .replace_all(&inserted_lower_upper_spaces, "$1 $2")
        .into_owned();

    let inserted_digit_alpha_spaces = Regex::new(r"(\d)([A-Za-z])")
        .expect("valid regex")
        .replace_all(&inserted_alpha_digit_spaces, "$1 $2")
        .into_owned();

    let separated_adjacent_dates = Regex::new(r"(\d{1,2}/\d{1,2}/\d{4})(\d{1,2}/\d{1,2}/\d{4})")
        .expect("valid regex")
        .replace_all(&inserted_digit_alpha_spaces, "$1 $2")
        .into_owned();

    separated_adjacent_dates.trim().to_string()
}

#[cfg(test)]
mod tests {
    use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf};

    use tempfile::tempdir;

    use crate::extractor_pipeline::ExtractionAttempt;

    use super::{
        extract_pdf_text_with_pdftotext, normalize_extracted_pdf_text,
        repeated_page_furniture_suspected, token_fusion_suspected,
    };

    #[test]
    fn pdftotext_strategy_reads_stdout_when_tool_succeeds() {
        let temp = tempdir().unwrap();
        let pdf = temp.path().join("input.pdf");
        fs::write(&pdf, b"fake pdf bytes").unwrap();

        let tool = temp.path().join("fake-pdftotext.sh");
        fs::write(
            &tool,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"-h\" ]; then exit 0; fi\nprintf 'Extracted via pdftotext'\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&tool).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&tool, perms).unwrap();

        let attempt = extract_pdf_text_with_pdftotext(&pdf, tool.to_str().unwrap());

        assert!(matches!(attempt, ExtractionAttempt::Extracted { .. }));
    }

    #[test]
    fn normalize_extracted_pdf_text_repairs_obvious_label_boundaries() {
        let raw = "Name:Jane Doe\nDate of Birth:1/23/2006\nReportDate:4/24/2026\nAgeat Testing:20years,3months";

        let normalized = normalize_extracted_pdf_text(raw);

        assert_eq!(
            normalized,
            "Name: Jane Doe\nDate of Birth: 1/23/2006\nReport Date: 4/24/2026\nAgeat Testing: 20 years,3 months"
        );
    }

    #[test]
    fn normalize_extracted_pdf_text_separates_adjacent_dates() {
        let raw = "Evaluation Date(s):12/17/202512/19/2025";

        let normalized = normalize_extracted_pdf_text(raw);

        assert_eq!(normalized, "Evaluation Date(s): 12/17/2025 12/19/2025");
    }

    #[test]
    fn normalize_extracted_pdf_text_matches_real_degradation_fixture() {
        let raw = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests")
                .join("fixtures")
                .join("pdf_degraded_spacing.txt"),
        )
        .unwrap();

        let normalized = normalize_extracted_pdf_text(&raw);

        assert!(normalized.contains("without written consent of thepatient."));
        assert!(normalized.contains("Name: Jane Doe"));
        assert!(normalized.contains("Date of Birth: 1/23/2006"));
        assert!(normalized.contains("Evaluation Date(s): 12/17/2025 12/19/2025"));
        assert!(normalized.contains("Report Date: 4/24/2026"));
        assert!(normalized.contains("Ageat Testing: 20 years,3 months"));
        assert!(normalized.contains("Referral Source: Pacific Ocean Pediatrics"));
        assert!(normalized.contains("Provider: Shina Halavi, Ph"));
    }

    #[test]
    fn token_fusion_detection_marks_representative_fixture_as_suspicious() {
        let raw = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests")
                .join("fixtures")
                .join("pdf_degraded_spacing.txt"),
        )
        .unwrap();

        assert!(token_fusion_suspected(&raw));
    }

    #[test]
    fn repeated_page_furniture_detection_marks_multi_page_markers_as_low_confidence() {
        let raw = "Client Intake\nPage 1 of 3\nSummary text\n\nClient Intake\nPage 2 of 3\nMore summary text";

        assert!(repeated_page_furniture_suspected(raw));
    }
}
