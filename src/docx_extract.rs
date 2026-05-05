use std::fs::File;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use zip::ZipArchive;

use crate::error::{AppError, Result};

const OMITTED_NON_TEXT_CONTENT: &str = "[OMITTED_NON_TEXT_CONTENT]";

pub fn extract_docx_to_markdown(path: &Path) -> Result<String> {
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

fn parse_document_xml_to_markdown(xml: &str) -> Result<String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut paragraphs = Vec::new();
    let mut current_paragraph = String::new();
    let mut in_paragraph = false;
    let mut saw_non_text = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"w:p" => {
                    in_paragraph = true;
                    current_paragraph.clear();
                    saw_non_text = false;
                }
                b"w:drawing" | b"w:pict" | b"w:object" => {
                    if in_paragraph {
                        saw_non_text = true;
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.name().as_ref() {
                b"w:drawing" | b"w:pict" | b"w:object" => {
                    if in_paragraph {
                        saw_non_text = true;
                    }
                }
                _ => {}
            },
            Ok(Event::Text(e)) => {
                if in_paragraph {
                    let text = e.decode().map_err(|error| {
                        AppError::Analysis(format!("failed to decode DOCX text: {error}"))
                    })?;
                    current_paragraph.push_str(&text);
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"w:p" {
                    let mut paragraph = current_paragraph.trim().to_string();
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
                    current_paragraph.clear();
                    saw_non_text = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(AppError::Analysis(format!(
                    "failed to parse DOCX XML: {error}"
                )));
            }
            _ => {}
        }
    }

    Ok(paragraphs.join("\n\n"))
}

#[cfg(test)]
mod tests {
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
            markdown,
            "Hello world\n\nImage follows [OMITTED_NON_TEXT_CONTENT]"
        );
    }
}
