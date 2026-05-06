use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::{AppError, Result};

#[derive(Debug, Clone)]
pub struct OcrExtraction {
    pub text: String,
}

pub fn extract_pdf_via_ocr(path: &Path) -> Result<Option<OcrExtraction>> {
    extract_pdf_via_ocr_with_tools(path, "pdftoppm", "ocrs")
}

fn extract_pdf_via_ocr_with_tools(
    path: &Path,
    pdftoppm_tool: &str,
    ocr_tool: &str,
) -> Result<Option<OcrExtraction>> {
    if !tool_available(pdftoppm_tool) || !tool_available(ocr_tool) {
        return Ok(None);
    }

    let scratch = create_scratch_dir()?;
    let prefix = scratch.join("page");

    let pdftoppm_status = Command::new(pdftoppm_tool)
        .arg("-png")
        .arg(path)
        .arg(&prefix)
        .status()
        .map_err(|error| AppError::Analysis(format!("failed to run {pdftoppm_tool}: {error}")))?;

    if !pdftoppm_status.success() {
        cleanup_scratch_dir(&scratch);
        return Err(AppError::Analysis(format!(
            "{pdftoppm_tool} failed while preparing OCR fallback images"
        )));
    }

    let mut image_paths = fs::read_dir(&scratch)
        .map_err(|error| AppError::Analysis(format!("failed to read OCR scratch dir: {error}")))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("png"))
        .collect::<Vec<_>>();
    image_paths.sort();

    if image_paths.is_empty() {
        cleanup_scratch_dir(&scratch);
        return Ok(None);
    }

    let mut pages = Vec::new();
    for image_path in &image_paths {
        let output = Command::new(ocr_tool)
            .arg(image_path)
            .output()
            .map_err(|error| AppError::Analysis(format!("failed to run {ocr_tool}: {error}")))?;

        if !output.status.success() {
            cleanup_scratch_dir(&scratch);
            return Err(AppError::Analysis(format!(
                "{ocr_tool} failed while extracting OCR fallback text"
            )));
        }

        let page_text = String::from_utf8(output.stdout)
            .map_err(|error| AppError::Analysis(format!("OCR output was not valid UTF-8: {error}")))?
            .trim()
            .to_string();
        if !page_text.is_empty() {
            pages.push(page_text);
        }
    }

    cleanup_scratch_dir(&scratch);

    if pages.is_empty() {
        return Ok(None);
    }

    Ok(Some(OcrExtraction {
        text: pages.join("\n\n"),
    }))
}

fn tool_available(tool: &str) -> bool {
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

    use super::extract_pdf_via_ocr_with_tools;

    #[test]
    fn ocr_fallback_collects_page_text_from_external_tools() {
        let temp = tempdir().unwrap();
        let pdf = temp.path().join("input.pdf");
        fs::write(&pdf, b"fake pdf bytes").unwrap();

        let pdftoppm = temp.path().join("fake-pdftoppm.sh");
        fs::write(
            &pdftoppm,
            "#!/usr/bin/env bash\nprefix=\"${@: -1}\"\nprintf 'img' > \"${prefix}-1.png\"\nprintf 'img' > \"${prefix}-2.png\"\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&pdftoppm).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&pdftoppm, perms).unwrap();

        let ocrs = temp.path().join("fake-ocrs.sh");
        fs::write(
            &ocrs,
            "#!/usr/bin/env bash\ncase \"$1\" in\n  *-1.png) printf 'OCR page 1' ;;
  *-2.png) printf 'OCR page 2' ;;
esac\n",
        )
        .unwrap();
        let mut perms = fs::metadata(&ocrs).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&ocrs, perms).unwrap();

        let extracted = extract_pdf_via_ocr_with_tools(
            &pdf,
            pdftoppm.to_str().unwrap(),
            ocrs.to_str().unwrap(),
        )
        .unwrap()
        .unwrap();

        assert_eq!(extracted.text, "OCR page 1\n\nOCR page 2");
    }
}
