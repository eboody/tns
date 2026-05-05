use std::path::Path;

use lopdf::Document;

use crate::error::{AppError, Result};

pub fn extract_pdf_to_markdown(path: &Path) -> Result<String> {
    let doc = Document::load(path)
        .map_err(|error| AppError::Analysis(format!("failed to load PDF: {error}")))?;

    let pages = doc.get_pages();
    let page_numbers: Vec<u32> = pages.keys().copied().collect();
    let text = doc
        .extract_text(&page_numbers)
        .map_err(|error| AppError::Analysis(format!("failed to extract PDF text: {error}")))?;

    if text.trim().is_empty() {
        return Err(AppError::Analysis(
            "PDF contains no extractable text; treat as non-extractable or low-confidence"
                .to_string(),
        ));
    }

    Ok(text.trim().to_string())
}
