use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::{AppError, Result};
use crate::{extraction::ExtractionStrategy, extractor_pipeline::ExtractionAttempt};

const PDFTOPPM_TOOL_ENV: &str = "TNS_PDFTOPPM_TOOL";
const CUSTOM_OCR_TOOL_ENV: &str = "TNS_OCR_TOOL";
const OCRS_TOOL_ENV: &str = "TNS_OCRS_TOOL";
const TESSERACT_TOOL_ENV: &str = "TNS_TESSERACT_TOOL";

#[derive(Debug, Clone)]
pub struct OcrExtraction {
    pub text: String,
}

#[derive(Debug, Clone)]
struct OcrEngine {
    name: String,
    command: PathBuf,
    mode: OcrEngineMode,
    availability: OcrEngineAvailability,
}

#[derive(Debug, Clone, Copy)]
enum OcrEngineMode {
    StdoutImageArg,
    TesseractStdout,
}

#[derive(Debug, Clone, Copy)]
enum OcrEngineAvailability {
    HelpProbe,
    AssumeConfigured,
}

impl OcrEngine {
    fn stdout_image_arg(name: impl Into<String>, command: impl Into<PathBuf>) -> Self {
        Self {
            name: name.into(),
            command: command.into(),
            mode: OcrEngineMode::StdoutImageArg,
            availability: OcrEngineAvailability::HelpProbe,
        }
    }

    fn configured_stdout_image_arg(name: impl Into<String>, command: impl Into<PathBuf>) -> Self {
        Self {
            name: name.into(),
            command: command.into(),
            mode: OcrEngineMode::StdoutImageArg,
            availability: OcrEngineAvailability::AssumeConfigured,
        }
    }

    fn tesseract(command: impl Into<PathBuf>) -> Self {
        Self {
            name: "tesseract".to_string(),
            command: command.into(),
            mode: OcrEngineMode::TesseractStdout,
            availability: OcrEngineAvailability::HelpProbe,
        }
    }

    fn configured_tesseract(command: impl Into<PathBuf>) -> Self {
        Self {
            name: "tesseract".to_string(),
            command: command.into(),
            mode: OcrEngineMode::TesseractStdout,
            availability: OcrEngineAvailability::AssumeConfigured,
        }
    }

    fn is_available(&self) -> bool {
        match self.availability {
            OcrEngineAvailability::HelpProbe => tool_available(&self.command),
            OcrEngineAvailability::AssumeConfigured => true,
        }
    }
}

pub fn extract_pdf_via_ocr(path: &Path) -> Result<Option<OcrExtraction>> {
    Ok(match extract_pdf_via_ocr_attempt(path) {
        ExtractionAttempt::Extracted { value, .. } => Some(value),
        ExtractionAttempt::Empty { .. } | ExtractionAttempt::Unavailable { .. } => None,
        ExtractionAttempt::Failed { detail, .. } => return Err(AppError::Analysis(detail)),
    })
}

pub fn extract_pdf_via_ocr_attempt(path: &Path) -> ExtractionAttempt<OcrExtraction> {
    extract_pdf_via_ocr_with_tools(path, &configured_pdftoppm_tool(), configured_ocr_engines())
}

pub fn extract_image_via_ocr_attempt(path: &Path) -> ExtractionAttempt<OcrExtraction> {
    extract_images_via_ocr_with_engines(
        vec![path.to_path_buf()],
        &configured_ocr_engines(),
        ExtractionStrategy::ImageOcr,
    )
}

fn extract_pdf_via_ocr_with_tools(
    path: &Path,
    pdftoppm_tool: &Path,
    ocr_engines: Vec<OcrEngine>,
) -> ExtractionAttempt<OcrExtraction> {
    if !tool_available(pdftoppm_tool) {
        return ExtractionAttempt::unavailable(
            ExtractionStrategy::PdfOcr,
            Some(format!("{} unavailable", pdftoppm_tool.display())),
        );
    }

    let scratch = match create_scratch_dir() {
        Ok(path) => path,
        Err(error) => {
            return ExtractionAttempt::failed(ExtractionStrategy::PdfOcr, error.to_string());
        }
    };
    let prefix = scratch.join("page");

    let pdftoppm_status = Command::new(pdftoppm_tool)
        .arg("-png")
        .arg(path)
        .arg(&prefix)
        .status()
        .map_err(|error| format!("failed to run {}: {error}", pdftoppm_tool.display()));

    let pdftoppm_status = match pdftoppm_status {
        Ok(status) => status,
        Err(detail) => {
            cleanup_scratch_dir(&scratch);
            return ExtractionAttempt::failed(ExtractionStrategy::PdfOcr, detail);
        }
    };

    if !pdftoppm_status.success() {
        cleanup_scratch_dir(&scratch);
        return ExtractionAttempt::failed(
            ExtractionStrategy::PdfOcr,
            format!(
                "{} failed while preparing OCR fallback images",
                pdftoppm_tool.display()
            ),
        );
    }

    let read_dir =
        fs::read_dir(&scratch).map_err(|error| format!("failed to read OCR scratch dir: {error}"));
    let mut image_paths = match read_dir {
        Ok(paths) => paths
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("png"))
            .collect::<Vec<_>>(),
        Err(detail) => {
            cleanup_scratch_dir(&scratch);
            return ExtractionAttempt::failed(ExtractionStrategy::PdfOcr, detail);
        }
    };
    image_paths.sort();

    if image_paths.is_empty() {
        cleanup_scratch_dir(&scratch);
        return ExtractionAttempt::empty(
            ExtractionStrategy::PdfOcr,
            Some("no rasterized pages produced".to_string()),
        );
    }

    let extracted =
        extract_images_via_ocr_with_engines(image_paths, &ocr_engines, ExtractionStrategy::PdfOcr);
    cleanup_scratch_dir(&scratch);
    extracted
}

fn configured_pdftoppm_tool() -> PathBuf {
    configured_tool_from_env(PDFTOPPM_TOOL_ENV).unwrap_or_else(|| PathBuf::from("pdftoppm"))
}

fn configured_ocr_engines() -> Vec<OcrEngine> {
    if let Some(command) = configured_tool_from_env(CUSTOM_OCR_TOOL_ENV) {
        return vec![OcrEngine::configured_stdout_image_arg("custom", command)];
    }

    let mut engines = Vec::new();
    engines.push(match configured_tool_from_env(OCRS_TOOL_ENV) {
        Some(command) => OcrEngine::configured_stdout_image_arg("ocrs", command),
        None => OcrEngine::stdout_image_arg("ocrs", "ocrs"),
    });
    engines.push(match configured_tool_from_env(TESSERACT_TOOL_ENV) {
        Some(command) => OcrEngine::configured_tesseract(command),
        None => OcrEngine::tesseract("tesseract"),
    });
    engines
}

fn configured_tool_from_env(env_name: &str) -> Option<PathBuf> {
    std::env::var_os(env_name)
        .filter(|command| !command.is_empty())
        .map(PathBuf::from)
}

fn extract_images_via_ocr_with_engines(
    image_paths: Vec<PathBuf>,
    engines: &[OcrEngine],
    strategy: ExtractionStrategy,
) -> ExtractionAttempt<OcrExtraction> {
    let mut details = Vec::new();
    let mut saw_available_engine = false;
    let mut saw_failed_engine = false;

    for engine in engines {
        if !engine.is_available() {
            details.push(format!("{} unavailable", engine.name));
            continue;
        }

        saw_available_engine = true;
        match extract_images_via_ocr_with_engine(image_paths.clone(), engine, strategy) {
            ExtractionAttempt::Extracted { value, .. } => {
                return ExtractionAttempt::extracted(strategy, value);
            }
            ExtractionAttempt::Empty { detail, .. } => {
                details.push(format!(
                    "{}: {}",
                    engine.name,
                    detail.unwrap_or_else(|| "no text extracted".to_string())
                ));
            }
            ExtractionAttempt::Failed { detail, .. } => {
                saw_failed_engine = true;
                details.push(format!("{}: {detail}", engine.name));
            }
            ExtractionAttempt::Unavailable { detail, .. } => {
                details.push(format!(
                    "{}: {}",
                    engine.name,
                    detail.unwrap_or_else(|| "tool unavailable".to_string())
                ));
            }
        }
    }

    let detail = ocr_failure_detail(&details);
    if !saw_available_engine {
        ExtractionAttempt::unavailable(strategy, Some(detail))
    } else if saw_failed_engine {
        ExtractionAttempt::failed(strategy, detail)
    } else {
        ExtractionAttempt::empty(strategy, Some(detail))
    }
}

fn extract_images_via_ocr_with_engine(
    image_paths: Vec<PathBuf>,
    engine: &OcrEngine,
    strategy: ExtractionStrategy,
) -> ExtractionAttempt<OcrExtraction> {
    let mut pages = Vec::new();
    for image_path in image_paths {
        let mut command = Command::new(&engine.command);
        match engine.mode {
            OcrEngineMode::StdoutImageArg => {
                command.arg(&image_path);
            }
            OcrEngineMode::TesseractStdout => {
                command.arg(&image_path).arg("stdout");
            }
        }

        let output = command.output().map_err(|error| {
            format!(
                "failed to run {} ({}): {error}",
                engine.name,
                engine.command.display()
            )
        });

        let output = match output {
            Ok(output) => output,
            Err(detail) => return ExtractionAttempt::failed(strategy, detail),
        };

        if !output.status.success() {
            return ExtractionAttempt::failed(
                strategy,
                format!(
                    "{} failed while extracting OCR text from {}",
                    engine.name,
                    image_path.display()
                ),
            );
        }

        let page_text = String::from_utf8(output.stdout)
            .map_err(|error| format!("OCR output was not valid UTF-8: {error}"));
        let page_text = match page_text {
            Ok(page_text) => page_text,
            Err(detail) => return ExtractionAttempt::failed(strategy, detail),
        }
        .trim()
        .to_string();
        if !page_text.is_empty() {
            pages.push(page_text);
        }
    }

    if pages.is_empty() {
        return ExtractionAttempt::empty(strategy, Some("OCR produced no text".to_string()));
    }

    ExtractionAttempt::extracted(
        strategy,
        OcrExtraction {
            text: pages.join("\n\n"),
        },
    )
}

fn ocr_failure_detail(details: &[String]) -> String {
    let joined = if details.is_empty() {
        "no OCR engines configured".to_string()
    } else {
        details.join("; ")
    };
    format!(
        "OCR requires an installed OCR engine ({joined}). Install ocrs or tesseract, set TNS_OCR_TOOL to a command that accepts an image path and writes recognized text to stdout, or bundle tools with TNS_OCRS_TOOL/TNS_TESSERACT_TOOL."
    )
}

fn tool_available(tool: impl AsRef<std::ffi::OsStr>) -> bool {
    Command::new(tool)
        .arg("--help")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success() || !status.success())
}

fn create_scratch_dir() -> Result<PathBuf> {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Analysis(format!("failed to build OCR scratch path: {error}")))?
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tns-ocr-{unique}"));
    fs::create_dir_all(&path).map_err(|source| AppError::CreateDirectory {
        path: path.clone(),
        source,
    })?;
    Ok(path)
}

fn cleanup_scratch_dir(path: &Path) {
    let _ = fs::remove_dir_all(path);
}

#[cfg(test)]
mod tests {
    use std::{fs, os::unix::fs::PermissionsExt};

    use tempfile::tempdir;

    use crate::{extraction::ExtractionStrategy, extractor_pipeline::ExtractionAttempt};

    use super::{OcrEngine, extract_images_via_ocr_with_engines, extract_pdf_via_ocr_with_tools};

    #[test]
    fn ocr_fallback_collects_page_text_from_external_tools() {
        let temp = tempdir().unwrap();
        let pdf = temp.path().join("input.pdf");
        fs::write(&pdf, b"fake pdf bytes").unwrap();

        let pdftoppm = temp.path().join("fake-pdftoppm.sh");
        fs::write(
            &pdftoppm,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 0; fi\nprefix=\"${@: -1}\"\nprintf 'img' > \"${prefix}-1.png\"\nprintf 'img' > \"${prefix}-2.png\"\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&pdftoppm).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&pdftoppm, perms).unwrap();

        let ocrs = temp.path().join("fake-ocrs.sh");
        fs::write(
            &ocrs,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 0; fi\ncase \"$1\" in\n  *-1.png) printf 'OCR page 1' ;;
  *-2.png) printf 'OCR page 2' ;;
esac\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&ocrs).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&ocrs, perms).unwrap();

        let extracted = extract_pdf_via_ocr_with_tools(
            &pdf,
            &pdftoppm,
            vec![OcrEngine::stdout_image_arg("ocrs", ocrs.clone())],
        );

        match extracted {
            ExtractionAttempt::Extracted { value, .. } => {
                assert_eq!(value.text, "OCR page 1\n\nOCR page 2")
            }
            other => panic!("expected OCR text, got {other:?}"),
        }
    }

    #[test]
    fn image_ocr_collects_text_from_image_tool() {
        let temp = tempdir().unwrap();
        let image = temp.path().join("scan.png");
        fs::write(&image, b"fake image bytes").unwrap();

        let ocrs = temp.path().join("fake-ocrs.sh");
        fs::write(
            &ocrs,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 0; fi\nprintf 'Standalone image OCR'\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&ocrs).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&ocrs, perms).unwrap();

        let extracted = extract_images_via_ocr_with_engines(
            vec![image],
            &[OcrEngine::stdout_image_arg("ocrs", ocrs)],
            ExtractionStrategy::ImageOcr,
        );

        assert!(matches!(
            extracted,
            ExtractionAttempt::Extracted { strategy: ExtractionStrategy::ImageOcr, value } if value.text == "Standalone image OCR"
        ));
    }

    #[test]
    fn image_ocr_falls_back_to_next_available_engine() {
        let temp = tempdir().unwrap();
        let image = temp.path().join("scan.png");
        fs::write(&image, b"fake image bytes").unwrap();

        let empty = temp.path().join("empty-ocr.sh");
        fs::write(
            &empty,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 0; fi\n",
        )
        .unwrap();
        let good = temp.path().join("good-ocr.sh");
        fs::write(
            &good,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 0; fi\nprintf 'fallback OCR text'\n",
        )
        .unwrap();
        for tool in [&empty, &good] {
            let mut perms = fs::metadata(tool).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(tool, perms).unwrap();
        }

        let extracted = extract_images_via_ocr_with_engines(
            vec![image],
            &[
                OcrEngine::stdout_image_arg("empty", empty),
                OcrEngine::stdout_image_arg("good", good),
            ],
            ExtractionStrategy::ImageOcr,
        );

        assert!(matches!(
            extracted,
            ExtractionAttempt::Extracted { value, .. } if value.text == "fallback OCR text"
        ));
    }

    #[test]
    fn tesseract_engine_uses_stdout_output_base() {
        let temp = tempdir().unwrap();
        let image = temp.path().join("scan.png");
        fs::write(&image, b"fake image bytes").unwrap();

        let tesseract = temp.path().join("fake-tesseract.sh");
        fs::write(
            &tesseract,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 0; fi\nif [ \"$2\" = \"stdout\" ]; then printf 'tesseract OCR text'; else exit 2; fi\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&tesseract).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&tesseract, perms).unwrap();

        let extracted = extract_images_via_ocr_with_engines(
            vec![image],
            &[OcrEngine::tesseract(tesseract)],
            ExtractionStrategy::ImageOcr,
        );

        assert!(matches!(
            extracted,
            ExtractionAttempt::Extracted { value, .. } if value.text == "tesseract OCR text"
        ));
    }

    #[test]
    fn configured_ocr_tool_does_not_require_help_support() {
        let temp = tempdir().unwrap();
        let image = temp.path().join("scan.png");
        fs::write(&image, b"fake image bytes").unwrap();

        let custom = temp.path().join("custom-ocr.sh");
        fs::write(
            &custom,
            "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then exit 64; fi\nprintf 'configured OCR text'\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&custom).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&custom, perms).unwrap();

        let extracted = extract_images_via_ocr_with_engines(
            vec![image],
            &[OcrEngine::configured_stdout_image_arg("custom", custom)],
            ExtractionStrategy::ImageOcr,
        );

        assert!(matches!(
            extracted,
            ExtractionAttempt::Extracted { value, .. } if value.text == "configured OCR text"
        ));
    }

    #[test]
    fn missing_ocr_engines_return_actionable_unavailable_detail() {
        let temp = tempdir().unwrap();
        let image = temp.path().join("scan.png");
        fs::write(&image, b"fake image bytes").unwrap();

        let extracted = extract_images_via_ocr_with_engines(
            vec![image],
            &[OcrEngine::stdout_image_arg(
                "missing",
                temp.path().join("missing-ocr"),
            )],
            ExtractionStrategy::ImageOcr,
        );

        assert!(matches!(
            extracted,
            ExtractionAttempt::Unavailable { detail: Some(detail), .. }
                if detail.contains("Install ocrs or tesseract") && detail.contains("TNS_OCR_TOOL")
        ));
    }
}
