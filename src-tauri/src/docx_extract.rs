use std::fs::File;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use zip::ZipArchive;

use crate::error::{AppError, Result};

const OMITTED_NON_TEXT_CONTENT: &str = "[OMITTED_NON_TEXT_CONTENT]";

#[derive(Debug, Clone)]
pub struct DocxExtraction {
    pub text: String,
    pub non_text_omissions_detected: bool,
    pub structural_loss_suspected: bool,
}

pub fn extract_docx_to_markdown(path: &Path) -> Result<String> {
    Ok(extract_docx(path)?.text)
}

pub fn extract_docx(path: &Path) -> Result<DocxExtraction> {
    let file = File::open(path).map_err(|source| AppError::ReadFile {
        path: path.to_path_buf(),
        source,
    })?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| AppError::Analysis(format!("failed to read DOCX archive: {error}")))?;

    let mut document_xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|error| AppError::Analysis(format!("missing word/document.xml: {error}")))?
        .read_to_string(&mut document_xml)
        .map_err(|error| {
            AppError::Analysis(format!("failed to read word/document.xml: {error}"))
        })?;

    parse_document_xml_to_markdown(&document_xml)
}

fn parse_document_xml_to_markdown(xml: &str) -> Result<DocxExtraction> {
    let mut reader = Reader::from_str(xml);

    let mut paragraphs = Vec::new();
    let mut current_paragraph = String::new();
    let mut in_paragraph = false;
    let mut in_text = false;
    let mut saw_non_text = false;
    let mut structural_loss_suspected = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"w:p" => {
                    in_paragraph = true;
                    current_paragraph.clear();
                    saw_non_text = false;
                }
                b"w:t" => {
                    if in_paragraph {
                        in_text = true;
                    }
                }
                b"w:drawing" | b"w:pict" | b"w:object" => {
                    if in_paragraph {
                        saw_non_text = true;
                    }
                }
                b"w:tbl" | b"w:tr" | b"w:tc" | b"w:numPr" => {
                    structural_loss_suspected = true;
                }
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.name().as_ref() {
                b"w:drawing" | b"w:pict" | b"w:object" => {
                    if in_paragraph {
                        saw_non_text = true;
                    }
                }
                b"w:tab" => {
                    if in_paragraph {
                        current_paragraph.push(' ');
                    }
                }
                b"w:br" | b"w:cr" => {
                    if in_paragraph && !current_paragraph.ends_with('\n') {
                        current_paragraph.push('\n');
                    }
                }
                b"w:tbl" | b"w:tr" | b"w:tc" | b"w:numPr" => {
                    structural_loss_suspected = true;
                }
                _ => {}
            },
            Ok(Event::Text(e)) => {
                if in_paragraph && in_text {
                    let text = e.decode().map_err(|error| {
                        AppError::Analysis(format!("failed to decode DOCX text: {error}"))
                    })?;
                    current_paragraph.push_str(&text);
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"w:t" => {
                    in_text = false;
                }
                b"w:p" => {
                    let mut paragraph = normalize_paragraph_text(&current_paragraph);
                    if saw_non_text {
                        if !paragraph.is_empty() {
                            paragraph.push(' ');
                        }
                        paragraph.push_str(OMITTED_NON_TEXT_CONTENT);
                    }
                    if !paragraph.is_empty() {
                        paragraphs.push(paragraph);
                    }
                    in_paragraph = false;
                    in_text = false;
                    current_paragraph.clear();
                    saw_non_text = false;
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(AppError::Analysis(format!(
                    "failed to parse DOCX XML: {error}"
                )));
            }
            _ => {}
        }
    }

    let text = paragraphs.join("\n\n");
    Ok(DocxExtraction {
        non_text_omissions_detected: text.contains(OMITTED_NON_TEXT_CONTENT),
        structural_loss_suspected,
        text,
    })
}

fn normalize_paragraph_text(text: &str) -> String {
    text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use super::parse_document_xml_to_markdown;

    #[test]
    fn parse_document_xml_extracts_paragraphs_and_non_text_placeholder() {
        let xml = r#"
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:r><w:t>Hello world</w:t></w:r></w:p>
                <w:p><w:r><w:t>Image follows</w:t></w:r><w:r><w:drawing/></w:r></w:p>
              </w:body>
            </w:document>
        "#;

        let markdown = parse_document_xml_to_markdown(xml).unwrap();
        assert_eq!(
            markdown.text,
            "Hello world\n\nImage follows [OMITTED_NON_TEXT_CONTENT]"
        );
        assert!(markdown.non_text_omissions_detected);
        assert!(!markdown.structural_loss_suspected);
    }

    #[test]
    fn parse_document_xml_preserves_run_boundary_spaces() {
        let xml = r#"
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p>
                  <w:r><w:t xml:space="preserve">Name: </w:t></w:r>
                  <w:r><w:t>Jane Doe</w:t></w:r>
                </w:p>
                <w:p>
                  <w:r><w:t xml:space="preserve">Evaluation Date(s): </w:t></w:r>
                  <w:r><w:t>12/17/2025</w:t></w:r>
                  <w:r><w:t xml:space="preserve"> </w:t></w:r>
                  <w:r><w:t>12/19/2025</w:t></w:r>
                </w:p>
              </w:body>
            </w:document>
        "#;

        let markdown = parse_document_xml_to_markdown(xml).unwrap();
        assert_eq!(
            markdown.text,
            "Name: Jane Doe\n\nEvaluation Date(s): 12/17/2025 12/19/2025"
        );
        assert!(!markdown.structural_loss_suspected);
    }

    #[test]
    fn parse_document_xml_preserves_tabs_and_breaks() {
        let xml = r#"
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p>
                  <w:r><w:t>Provider</w:t></w:r>
                  <w:r><w:tab/></w:r>
                  <w:r><w:t>Shina Halavi, PhD</w:t></w:r>
                  <w:r><w:br/></w:r>
                  <w:r><w:t>Pacific Ocean Pediatrics</w:t></w:r>
                </w:p>
              </w:body>
            </w:document>
        "#;

        let markdown = parse_document_xml_to_markdown(xml).unwrap();
        assert_eq!(
            markdown.text,
            "Provider Shina Halavi, PhD\nPacific Ocean Pediatrics"
        );
        assert!(!markdown.structural_loss_suspected);
    }

    #[test]
    fn parse_document_xml_matches_real_spacing_fixture() {
        let fixture = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests")
                .join("fixtures")
                .join("docx_run_spacing.xml"),
        )
        .unwrap();

        let markdown = parse_document_xml_to_markdown(&fixture).unwrap();
        assert_eq!(
            markdown.text,
            "Name: Jane Doe\n\nEvaluation Date(s): 12/17/2025 12/19/2025\n\nProvider Shina Halavi, PhD\nPacific Ocean Pediatrics"
        );
        assert!(!markdown.structural_loss_suspected);
    }

    #[test]
    fn parse_document_xml_marks_table_structure_as_lossy() {
        let xml = r#"
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>Course</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Grade</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
              </w:body>
            </w:document>
        "#;

        let markdown = parse_document_xml_to_markdown(xml).unwrap();
        assert_eq!(markdown.text, "Course\n\nGrade");
        assert!(markdown.structural_loss_suspected);
    }
}
