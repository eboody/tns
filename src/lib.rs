pub mod audit;
pub mod config;
pub mod deidentify;
pub mod docx_extract;
pub mod error;
pub mod pdf_extract;
mod safe_harbor_policy;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use audit::{AuditReport, Finding, FindingSource};
use config::Config;
use deidentify::{DeidentifyResult, apply_rules, build_rules};
use error::{AppError, Result};
use globset::{Glob, GlobSet, GlobSetBuilder};
use redact_core::AnalyzerEngine;
use redact_core::recognizers::Recognizer;
use redact_ner::{NerConfig as NerRecognizerConfig, NerRecognizer};
use walkdir::WalkDir;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunMode {
    Replace,
    DryRun,
    Review,
}

#[derive(Debug, Clone)]
pub struct RunOptions {
    pub input: PathBuf,
    pub output: Option<PathBuf>,
    pub audit_output: Option<PathBuf>,
    pub config: Option<PathBuf>,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub mode: RunMode,
}

#[derive(Debug, Clone)]
pub struct RunSummary {
    pub mode: RunMode,
    pub output_path: Option<PathBuf>,
    pub audit_output_path: Option<PathBuf>,
    pub replacements: usize,
    pub review_summary: String,
    pub coverage_note: &'static str,
}

const COVERAGE_NOTE: &str = "Structured identifiers were processed with redact-core. Full HIPAA Safe Harbor coverage still requires policy mapping, configured known-entity replacement, and custom gap recognizers.";
const RESIDUAL_GAPS: &[&str] = &[
    "names and contextual person references",
    "sub-state geography and full address details",
    "ages over 89 and broader Safe Harbor date policy nuances",
    "non-text identifiers such as embedded images, biometrics, and comparable visuals",
    "other unique identifying numbers or contextual codes not yet covered by policy/config/custom recognizers",
];

pub fn run(options: RunOptions) -> Result<RunSummary> {
    if options.input.is_dir() {
        return run_directory(options);
    }

    run_single(options)
}

fn run_single(options: RunOptions) -> Result<RunSummary> {
    validate_supported_input(&options.input)?;

    let input_text = load_input_as_markdown(&options.input)?;

    let structured = apply_deidentification_pipeline(&input_text, options.config.as_deref())?;
    let review_summary =
        build_review_summary(&options.input, &structured.findings, structured.ml_active);

    if options.mode != RunMode::Replace {
        return Ok(RunSummary {
            mode: options.mode,
            output_path: None,
            audit_output_path: None,
            replacements: structured.findings.len(),
            review_summary,
            coverage_note: COVERAGE_NOTE,
        });
    }

    let output_path = options
        .output
        .unwrap_or_else(|| default_output_path(&options.input, ".deidentified", true));
    let audit_output_path = options
        .audit_output
        .unwrap_or_else(|| default_output_path(&options.input, ".audit.json", false));

    if output_path == options.input {
        return Err(AppError::UnsafeOutputPath(output_path));
    }

    write_text_file(&output_path, &structured.text)?;

    let audit_report = AuditReport::new(
        options.input.clone(),
        output_path.clone(),
        structured.findings,
    );
    let audit_json =
        serde_json::to_string_pretty(&audit_report).map_err(AppError::SerializeAuditReport)?;
    write_text_file(&audit_output_path, &audit_json)?;

    Ok(RunSummary {
        mode: options.mode,
        output_path: Some(output_path),
        audit_output_path: Some(audit_output_path),
        replacements: audit_report.replacements.len(),
        review_summary,
        coverage_note: COVERAGE_NOTE,
    })
}

fn run_directory(options: RunOptions) -> Result<RunSummary> {
    let matcher = PathMatcher::new(&options.include_patterns, &options.exclude_patterns)?;
    let filename_rules = load_filename_rules(options.config.as_deref())?;
    let output_root = options
        .output
        .clone()
        .unwrap_or_else(|| default_directory_output_root(&options.input));
    let audit_root = options
        .audit_output
        .clone()
        .unwrap_or_else(|| default_directory_audit_root(&output_root));

    let mut processed = Vec::new();
    let mut skipped = Vec::new();
    let mut unsupported = Vec::new();
    let mut extraction_failed = Vec::new();
    let mut review_sensitive = Vec::new();
    let mut renamed = Vec::new();
    let mut replacement_total = 0usize;

    for entry in WalkDir::new(&options.input) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path().to_path_buf();
        if is_generated_output_path(&path, &output_root, &audit_root) {
            continue;
        }
        let relative = path
            .strip_prefix(&options.input)
            .expect("walked file should be under input directory")
            .to_path_buf();

        if !matcher.allows(&relative) {
            skipped.push(relative);
            continue;
        }

        if !is_supported_input(&path) {
            unsupported.push(relative);
            continue;
        }

        let deidentified_relative = deidentify_relative_path(&relative, filename_rules.as_deref());
        if deidentified_relative != relative {
            renamed.push((relative.clone(), deidentified_relative.clone()));
        }
        let per_file_output = output_root.join(relative_to_markdown_path(&deidentified_relative));
        let per_file_audit = audit_root.join(relative_to_audit_path(&deidentified_relative));
        let summary = match run_single(RunOptions {
            input: path,
            output: Some(per_file_output),
            audit_output: Some(per_file_audit),
            config: options.config.clone(),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: options.mode,
        }) {
            Ok(summary) => summary,
            Err(AppError::Analysis(_)) => {
                extraction_failed.push(relative.clone());
                review_sensitive.push(relative);
                continue;
            }
            Err(error) => return Err(error),
        };

        replacement_total += summary.replacements;
        processed.push(relative.clone());
        review_sensitive.push(relative);
    }

    let review_summary = build_batch_summary(
        &options.input,
        &processed,
        &skipped,
        &unsupported,
        &extraction_failed,
        &review_sensitive,
        &renamed,
    );

    Ok(RunSummary {
        mode: options.mode,
        output_path: if options.mode == RunMode::Replace {
            Some(output_root)
        } else {
            None
        },
        audit_output_path: if options.mode == RunMode::Replace {
            Some(audit_root)
        } else {
            None
        },
        replacements: replacement_total,
        review_summary,
        coverage_note: COVERAGE_NOTE,
    })
}

#[derive(Debug)]
struct StructuredRun {
    text: String,
    findings: Vec<Finding>,
    ml_active: bool,
}

type SharedRecognizer = Arc<dyn Recognizer>;

fn apply_redact_core_with_recognizers(
    input_text: &str,
    config: Option<&Config>,
    extra_recognizers: Vec<SharedRecognizer>,
) -> Result<StructuredRun> {
    let mut engine = AnalyzerEngine::new();
    for recognizer in extra_recognizers {
        engine.recognizer_registry_mut().add_recognizer(recognizer);
    }

    if let Some(ner) = config
        .and_then(|config| config.ner.as_ref())
        .filter(|ner| ner.enabled)
    {
        if !ner.model_path.is_file() {
            return Err(AppError::NerInitialization(format!(
                "model file does not exist: {}",
                ner.model_path.display()
            )));
        }
        if let Some(tokenizer_path) = ner.tokenizer_path.as_ref()
            && !tokenizer_path.is_file()
        {
            return Err(AppError::NerInitialization(format!(
                "tokenizer file does not exist: {}",
                tokenizer_path.display()
            )));
        }

        let recognizer = NerRecognizer::from_config(NerRecognizerConfig {
            model_path: ner.model_path.to_string_lossy().into_owned(),
            tokenizer_path: ner
                .tokenizer_path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            min_confidence: ner.min_confidence,
            ..Default::default()
        })
        .map_err(|error| AppError::NerInitialization(error.to_string()))?;
        engine
            .recognizer_registry_mut()
            .add_recognizer(Arc::new(recognizer));
    }

    let analysis = engine
        .analyze(input_text, None)
        .map_err(|error| AppError::Analysis(error.to_string()))?;

    let (text, mut findings) = safe_harbor_policy::apply(input_text, &analysis.detected_entities);
    findings.sort_by_key(|record| (record.start, record.end));

    Ok(StructuredRun {
        text,
        findings,
        ml_active: config
            .and_then(|config| config.ner.as_ref())
            .is_some_and(|ner| ner.enabled),
    })
}

fn apply_redact_core_with_config(
    input_text: &str,
    config: Option<&Config>,
) -> Result<StructuredRun> {
    apply_redact_core_with_recognizers(input_text, config, Vec::new())
}

fn apply_deidentification_pipeline(
    input_text: &str,
    config_path: Option<&Path>,
) -> Result<StructuredRun> {
    let loaded_config = match config_path {
        Some(config_path) => Some(Config::from_path(config_path)?),
        None => None,
    };

    let mut structured = apply_redact_core_with_config(input_text, loaded_config.as_ref())?;

    let Some(config) = loaded_config.as_ref() else {
        return Ok(structured);
    };

    let rules = build_rules(&config)?;
    let DeidentifyResult { text, mut findings } = apply_rules(&structured.text, &rules);

    structured.text = text;
    structured.findings.append(&mut findings);
    structured
        .findings
        .sort_by_key(|record| (record.start, record.end));

    Ok(structured)
}

fn build_review_summary(input: &Path, findings: &[Finding], ml_active: bool) -> String {
    let mut lines = vec![
        format!("input: {}", input.display()),
        format!("proposed structured replacements: {}", findings.len()),
    ];

    if ml_active {
        lines.push("ml-assisted contextual recognition: enabled".to_string());
    }

    let mut policy_categories = Vec::new();
    let mut raw_structured_categories = Vec::new();
    let mut ml_categories = Vec::new();
    let mut safe_harbor_categories = Vec::new();

    for record in findings {
        let source = record.source.summary_label();

        if record.source == FindingSource::Policy {
            if !policy_categories.contains(&record.entity_type.as_str()) {
                policy_categories.push(record.entity_type.as_str());
            }
        } else if record.source == FindingSource::Ml {
            if !ml_categories.contains(&record.entity_type.as_str()) {
                ml_categories.push(record.entity_type.as_str());
            }
        } else if record.source == FindingSource::RedactCore
            && !raw_structured_categories.contains(&record.entity_type.as_str())
        {
            raw_structured_categories.push(record.entity_type.as_str());
        }

        if let Some(category) = safe_harbor_category_label(&record.entity_type) {
            if !safe_harbor_categories.contains(&category) {
                safe_harbor_categories.push(category);
            }
        }

        let confidence = record
            .score
            .map(|score| format!("; score={score:.2}"))
            .unwrap_or_default();
        lines.push(format!(
            "- [{}:{}] {} -> {} ({}){}",
            source,
            record.entity_type,
            record.matched_text,
            record.replacement,
            record.reason,
            confidence,
        ));
    }

    if !policy_categories.is_empty() {
        lines.push("Currently policy-shaped Safe Harbor behaviors:".to_string());
        if policy_categories.contains(&"DATE_TIME") {
            lines.push(
                "- DATE_TIME -> preserve year only when structured date parsing succeeds"
                    .to_string(),
            );
        }
        if policy_categories.contains(&"AGE") {
            lines.push("- AGE -> replace ages over 89 with `90 or older`".to_string());
        }
    }

    if !raw_structured_categories.is_empty() {
        lines.push("Currently raw structured coverage from redact-core:".to_string());
        for category in raw_structured_categories {
            lines.push(format!("- {category}"));
        }
    }

    if !ml_categories.is_empty() {
        lines.push("Currently ML-assisted contextual coverage:".to_string());
        for category in ml_categories {
            lines.push(format!("- {category}"));
        }
    }

    if !safe_harbor_categories.is_empty() {
        lines.push("Currently covered Safe Harbor categories:".to_string());
        for category in safe_harbor_categories {
            lines.push(format!("- {category}"));
        }
    }

    lines.push(COVERAGE_NOTE.to_string());
    lines.push("Residual Safe Harbor gaps still requiring later coverage:".to_string());
    for gap in RESIDUAL_GAPS {
        lines.push(format!("- {gap}"));
    }

    lines.join("\n")
}

fn safe_harbor_category_label(entity_type: &str) -> Option<&'static str> {
    match entity_type {
        "CLIENT_NAME" | "PROVIDER_NAME" | "FAMILY_NAME" => Some("Category 1: names"),
        "INSTITUTION_NAME" => Some("Category 2: geographic subdivisions smaller than a state"),
        "DATE_TIME" | "AGE" => Some("Category 3: dates except year / ages over 89"),
        "ADDRESS" => Some("Category 2: geographic subdivisions smaller than a state"),
        "PHONE_NUMBER" => Some("Category 4: telephone numbers"),
        "FAX_NUMBER" => Some("Category 5: fax numbers"),
        "EMAIL_ADDRESS" => Some("Category 6: email addresses"),
        _ => None,
    }
}

fn validate_supported_input(input: &Path) -> Result<()> {
    if is_supported_input(input) {
        Ok(())
    } else {
        Err(AppError::UnsupportedInputFormat(input.to_path_buf()))
    }
}

fn is_supported_input(input: &Path) -> bool {
    matches!(
        input.extension().and_then(|ext| ext.to_str()),
        Some("md" | "txt" | "docx" | "pdf")
    )
}

fn load_input_as_markdown(input: &Path) -> Result<String> {
    match input.extension().and_then(|ext| ext.to_str()) {
        Some("md" | "txt") => fs::read_to_string(input).map_err(|source| AppError::ReadFile {
            path: input.to_path_buf(),
            source,
        }),
        Some("docx") => docx_extract::extract_docx_to_markdown(input),
        Some("pdf") => pdf_extract::extract_pdf_to_markdown(input),
        _ => Err(AppError::UnsupportedInputFormat(input.to_path_buf())),
    }
}

fn write_text_file(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| AppError::CreateDirectory {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    fs::write(path, contents).map_err(|source| AppError::WriteFile {
        path: path.to_path_buf(),
        source,
    })
}

fn default_output_path(input: &Path, suffix: &str, preserve_input_extension: bool) -> PathBuf {
    let parent = input.parent().unwrap_or_else(|| Path::new("."));
    let stem = input
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("output");
    let extension = if matches!(
        input.extension().and_then(|ext| ext.to_str()),
        Some("docx" | "pdf")
    ) && preserve_input_extension
    {
        ".md".to_string()
    } else if preserve_input_extension {
        input
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| format!(".{extension}"))
            .unwrap_or_default()
    } else {
        String::new()
    };

    parent.join(format!("{stem}{suffix}{extension}"))
}

fn default_directory_output_root(input: &Path) -> PathBuf {
    input.join("redacted")
}

fn default_directory_audit_root(output_root: &Path) -> PathBuf {
    output_root.join(".audit")
}

fn is_generated_output_path(path: &Path, output_root: &Path, audit_root: &Path) -> bool {
    path.starts_with(output_root) || path.starts_with(audit_root)
}

fn relative_to_markdown_path(relative: &Path) -> PathBuf {
    let mut output = relative.to_path_buf();
    output.set_extension("md");
    output
}

fn relative_to_audit_path(relative: &Path) -> PathBuf {
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let stem = relative
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("output");
    parent.join(format!("{stem}.audit.json"))
}

fn load_filename_rules(
    config_path: Option<&Path>,
) -> Result<Option<Vec<deidentify::ReplacementRule>>> {
    let Some(config_path) = config_path else {
        return Ok(None);
    };
    let config = Config::from_path(config_path)?;
    let rules = build_rules(&config)?;
    Ok(Some(rules))
}

fn deidentify_relative_path(
    relative: &Path,
    rules: Option<&[deidentify::ReplacementRule]>,
) -> PathBuf {
    let Some(rules) = rules else {
        return relative.to_path_buf();
    };

    let mut output = PathBuf::new();
    for component in relative.components() {
        let component_text = component.as_os_str().to_string_lossy().to_string();
        let DeidentifyResult { text, .. } = apply_rules(&component_text, rules);
        output.push(text);
    }
    output
}

fn build_batch_summary(
    input_root: &Path,
    processed: &[PathBuf],
    skipped: &[PathBuf],
    unsupported: &[PathBuf],
    extraction_failed: &[PathBuf],
    review_sensitive: &[PathBuf],
    renamed: &[(PathBuf, PathBuf)],
) -> String {
    let mut lines = vec![format!("input directory: {}", input_root.display())];
    lines.push(format!("processed files: {}", processed.len()));
    lines.push(format!("skipped files: {}", skipped.len()));
    lines.push(format!("unsupported files: {}", unsupported.len()));
    lines.push(format!(
        "extraction-failed files: {}",
        extraction_failed.len()
    ));
    lines.push(format!(
        "review-sensitive files: {}",
        review_sensitive.len()
    ));
    lines.push(format!("renamed outputs: {}", renamed.len()));

    if !processed.is_empty() {
        lines.push("Processed:".to_string());
        for path in processed {
            lines.push(format!("- {}", path.display()));
        }
    }
    if !skipped.is_empty() {
        lines.push("Skipped:".to_string());
        for path in skipped {
            lines.push(format!("- {}", path.display()));
        }
    }
    if !unsupported.is_empty() {
        lines.push("Unsupported:".to_string());
        for path in unsupported {
            lines.push(format!("- {}", path.display()));
        }
    }
    if !extraction_failed.is_empty() {
        lines.push("Extraction failed:".to_string());
        for path in extraction_failed {
            lines.push(format!("- {}", path.display()));
        }
    }
    if !review_sensitive.is_empty() {
        lines.push("Review-sensitive:".to_string());
        for path in review_sensitive {
            lines.push(format!("- {}", path.display()));
        }
    }
    if !renamed.is_empty() {
        lines.push("Renamed outputs:".to_string());
        for (from, to) in renamed {
            lines.push(format!("- {} -> {}", from.display(), to.display()));
        }
    }

    lines.join("\n")
}

struct PathMatcher {
    include: Option<GlobSet>,
    exclude: GlobSet,
}

impl PathMatcher {
    fn new(include_patterns: &[String], exclude_patterns: &[String]) -> Result<Self> {
        let include = if include_patterns.is_empty() {
            None
        } else {
            Some(build_globset(include_patterns)?)
        };
        let exclude = build_globset(exclude_patterns)?;
        Ok(Self { include, exclude })
    }

    fn allows(&self, relative: &Path) -> bool {
        if self.exclude.is_match(relative) {
            return false;
        }
        match &self.include {
            Some(include) => include.is_match(relative),
            None => true,
        }
    }
}

fn build_globset(patterns: &[String]) -> Result<GlobSet> {
    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        let glob = Glob::new(pattern).map_err(|error| {
            AppError::InvalidConfig(format!("invalid glob `{pattern}`: {error}"))
        })?;
        builder.add(glob);
    }
    builder
        .build()
        .map_err(|error| AppError::InvalidConfig(format!("invalid globset: {error}")))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use anyhow::Result as AnyhowResult;
    use redact_core::recognizers::Recognizer;
    use redact_core::{RecognizerResult, types::EntityType};

    use super::{COVERAGE_NOTE, FindingSource, RunMode, RunOptions, run};
    use std::fs;
    use std::io::Write;
    use std::path::Path;
    use std::path::PathBuf;

    use lopdf::content::{Content, Operation};
    use lopdf::{Document, Object, Stream, dictionary};
    use tempfile::tempdir;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    #[derive(Debug)]
    struct FakeNerRecognizer;

    impl Recognizer for FakeNerRecognizer {
        fn name(&self) -> &str {
            "FakeNerRecognizer"
        }

        fn supported_entities(&self) -> &[EntityType] {
            static SUPPORTED: [EntityType; 1] = [EntityType::Person];
            &SUPPORTED
        }

        fn analyze(&self, text: &str, _language: &str) -> AnyhowResult<Vec<RecognizerResult>> {
            let start = text
                .find("John Doe")
                .expect("test input should include John Doe");
            let end = start + "John Doe".len();

            Ok(vec![
                RecognizerResult::new(EntityType::Person, start, end, 0.95, self.name())
                    .with_text(text),
            ])
        }
    }

    #[test]
    fn run_creates_default_output_and_audit_files() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.md");

        fs::write(&input, "Email jane@example.com or call (555) 123-4567.").unwrap();

        let summary = run(RunOptions {
            input: input.clone(),
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert_eq!(
            summary.output_path,
            Some(temp.path().join("note.deidentified.md"))
        );
        assert_eq!(
            summary.audit_output_path,
            Some(temp.path().join("note.audit.json"))
        );
        assert_ne!(summary.output_path, Some(input));

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("[EMAIL_ADDRESS]"));
        assert!(output.contains("[PHONE_NUMBER]"));

        let audit = fs::read_to_string(summary.audit_output_path.unwrap()).unwrap();
        assert!(audit.contains("EMAIL_ADDRESS"));
        assert!(audit.contains("PHONE_NUMBER"));
        assert!(audit.contains("redact-core pattern detection"));
    }

    #[test]
    fn run_supports_plain_text_inputs_and_preserves_extension() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.txt");

        fs::write(&input, "Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert_eq!(
            summary.output_path,
            Some(temp.path().join("note.deidentified.txt"))
        );
        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "Email [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_replaces_structured_identifiers_and_records_redact_core_reasons() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("contact.md");

        fs::write(
            &input,
            "Email jane@example.com before 01/02/2003 or call 310-555-1212.",
        )
        .unwrap();

        let summary = run(RunOptions {
            input: input.clone(),
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("[EMAIL_ADDRESS]"));
        assert!(output.contains("[PHONE_NUMBER]"));

        let audit = fs::read_to_string(summary.audit_output_path.unwrap()).unwrap();
        assert!(audit.contains("EMAIL_ADDRESS"));
        assert!(audit.contains("PHONE_NUMBER"));
        assert!(audit.contains("\"source\": \"redact_core\""));
        assert!(audit.contains("\"score\": 0.8"));
        assert_eq!(summary.replacements, 2);
    }

    #[test]
    fn run_applies_safe_harbor_date_policy_by_preserving_only_year() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("dates.md");

        fs::write(&input, "DOB 2003-01-02. Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("DOB 2003."));
        assert!(!output.contains("2003-01-02"));
        assert!(!output.contains("[DATE_TIME]"));
    }

    #[test]
    fn run_dry_run_returns_summary_without_writing_files() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("contact.md");
        fs::write(&input, "Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input: input.clone(),
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::DryRun,
        })
        .unwrap();

        assert_eq!(summary.mode, RunMode::DryRun);
        assert_eq!(summary.output_path, None);
        assert_eq!(summary.audit_output_path, None);
        assert!(
            summary
                .review_summary
                .contains("proposed structured replacements: 1")
        );
        assert!(summary.review_summary.contains(COVERAGE_NOTE));
        assert!(!temp.path().join("contact.deidentified.md").exists());
        assert!(!temp.path().join("contact.audit.json").exists());
    }

    #[test]
    fn run_review_returns_summary_without_writing_files() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("contact.md");
        fs::write(&input, "Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input: input.clone(),
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert_eq!(summary.mode, RunMode::Review);
        assert_eq!(summary.output_path, None);
        assert_eq!(summary.audit_output_path, None);
        assert!(
            summary
                .review_summary
                .contains("[redact-core:EMAIL_ADDRESS] jane@example.com -> [EMAIL_ADDRESS]")
        );
        assert!(!temp.path().join("contact.deidentified.md").exists());
        assert!(!temp.path().join("contact.audit.json").exists());
    }

    #[test]
    fn run_review_surfaces_policy_transformed_dates_as_policy_output() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("dates.md");
        fs::write(&input, "DOB 2003-01-02.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[policy:DATE_TIME] 2003-01-02 -> 2003")
        );
    }

    #[test]
    fn run_review_explicitly_surfaces_residual_safe_harbor_gaps() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("gaps.md");
        fs::write(&input, "Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("Residual Safe Harbor gaps still requiring later coverage:")
        );
        assert!(
            summary
                .review_summary
                .contains("- names and contextual person references")
        );
        assert!(
            summary
                .review_summary
                .contains("- sub-state geography and full address details")
        );
    }

    #[test]
    fn run_applies_safe_harbor_age_policy_for_ages_over_89() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("age.md");
        fs::write(&input, "Patient age 94.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("Patient 90 or older."));
        assert!(!output.contains("94"));
        assert!(!output.contains("[AGE]"));
    }

    #[test]
    fn run_review_surfaces_age_over_89_as_policy_output() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("age.md");
        fs::write(&input, "Patient age 94.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[policy:AGE] age 94 -> 90 or older")
        );
    }

    #[test]
    fn run_review_summarizes_current_policy_and_raw_structured_coverage() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("coverage.md");
        fs::write(
            &input,
            "DOB 2003-01-02. Patient age 94. Email jane@example.com.",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("Currently policy-shaped Safe Harbor behaviors:")
        );
        assert!(
            summary.review_summary.contains(
                "- DATE_TIME -> preserve year only when structured date parsing succeeds"
            )
        );
        assert!(
            summary
                .review_summary
                .contains("- AGE -> replace ages over 89 with `90 or older`")
        );
        assert!(
            summary
                .review_summary
                .contains("Currently raw structured coverage from redact-core:")
        );
        assert!(summary.review_summary.contains("- EMAIL_ADDRESS"));
    }

    #[test]
    fn run_review_maps_currently_covered_entities_to_safe_harbor_categories() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("coverage-map.md");
        fs::write(
            &input,
            "DOB 2003-01-02. Patient age 94. Email jane@example.com. Call 310-555-1212.",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("Currently covered Safe Harbor categories:")
        );
        assert!(
            summary
                .review_summary
                .contains("- Category 3: dates except year / ages over 89")
        );
        assert!(
            summary
                .review_summary
                .contains("- Category 4: telephone numbers")
        );
        assert!(
            summary
                .review_summary
                .contains("- Category 6: email addresses")
        );
    }

    #[test]
    fn run_applies_configured_client_name_replacement_alongside_redact_core() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("client.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "CLIENT emailed [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_review_distinguishes_configured_client_replacement_from_redact_core() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("client.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input: input.clone(),
            output: None,
            audit_output: None,
            config: Some(config.clone()),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[configured:client] Jane Doe -> CLIENT")
        );
        assert!(
            summary
                .review_summary
                .contains("[redact-core:EMAIL_ADDRESS] jane@example.com -> [EMAIL_ADDRESS]")
        );

        let replace_summary = run(RunOptions {
            input: input.clone(),
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let audit = fs::read_to_string(replace_summary.audit_output_path.unwrap()).unwrap();
        assert!(audit.contains("\"source\": \"configured\""));
        assert!(audit.contains("\"source\": \"redact_core\""));
    }

    #[test]
    fn run_allows_deterministic_fallback_when_ner_is_not_configured() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("contact.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "CLIENT emailed [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_fails_explicitly_when_enabled_ner_model_cannot_be_loaded() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("contact.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            format!(
                "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[ner]\nenabled = true\nmodel_path = \"{}\"\nmin_confidence = 0.7\n",
                temp.path().join("missing-model.onnx").display()
            ),
        )
        .unwrap();

        let error = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap_err();

        assert!(error.to_string().contains("failed to initialize NER"));
    }

    #[test]
    fn apply_redact_core_with_injected_ner_recognizer_surfaces_ml_finding() {
        let structured = super::apply_redact_core_with_recognizers(
            "John Doe emailed john@example.com.",
            None,
            vec![Arc::new(FakeNerRecognizer)],
        )
        .unwrap();

        assert!(
            structured
                .text
                .contains("[PERSON] emailed [EMAIL_ADDRESS].")
        );
        assert!(
            structured
                .findings
                .iter()
                .any(|finding| finding.source == FindingSource::Ml
                    && finding.entity_type == "PERSON"
                    && finding.reason.contains("FakeNerRecognizer"))
        );

        let review_summary = super::build_review_summary(
            std::path::Path::new("/tmp/fake.md"),
            &structured.findings,
            true,
        );
        assert!(review_summary.contains("[ml:PERSON] John Doe -> [PERSON]"));
        assert!(review_summary.contains("ml-assisted contextual recognition: enabled"));
        assert!(review_summary.contains("Currently ML-assisted contextual coverage:"));
        assert!(review_summary.contains("- PERSON"));
        assert!(review_summary.contains("score=0.95"));
    }

    #[test]
    #[ignore = "requires local NER model assets"]
    fn run_with_real_local_ner_assets_surfaces_ml_findings() {
        let model_path = std::env::var("TNS_DEID_NER_MODEL_PATH")
            .expect("set TNS_DEID_NER_MODEL_PATH to a local ONNX model");
        let tokenizer_path = std::env::var("TNS_DEID_NER_TOKENIZER_PATH").ok();

        let temp = tempdir().unwrap();
        let input = temp.path().join("contact.md");
        let config = temp.path().join("deid.toml");
        fs::write(
            &input,
            "John Doe works at Acme Corp in New York. Email john@acme.com.",
        )
        .unwrap();

        let mut config_toml = format!(
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Example\"]\n\n[ner]\nenabled = true\nmodel_path = \"{}\"\nmin_confidence = 0.7\n",
            PathBuf::from(&model_path).display()
        );
        if let Some(tokenizer_path) = tokenizer_path {
            config_toml.push_str(&format!(
                "tokenizer_path = \"{}\"\n",
                PathBuf::from(tokenizer_path).display()
            ));
        }
        fs::write(&config, config_toml).unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("ml-assisted contextual recognition: enabled")
        );
        assert!(
            summary
                .review_summary
                .contains("Currently ML-assisted contextual coverage:")
        );
        assert!(
            summary.review_summary.contains("[ml:PERSON]")
                || summary.review_summary.contains("[ml:ORGANIZATION]")
                || summary.review_summary.contains("[ml:LOCATION]")
        );
    }

    #[test]
    fn run_redacts_labeled_client_and_provider_fields_in_psychology_text() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("intake.md");
        fs::write(
            &input,
            "Client: Jane Doe\nProvider: Shina Halavi, PhD\nEmail: jane@example.com\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("Client: [CLIENT]"));
        assert!(output.contains("Provider: [PROVIDER]"));
        assert!(output.contains("Email: [EMAIL_ADDRESS]"));

        let audit = fs::read_to_string(summary.audit_output_path.unwrap()).unwrap();
        assert!(audit.contains("\"entity_type\": \"CLIENT_NAME\""));
        assert!(audit.contains("\"entity_type\": \"PROVIDER_NAME\""));
        assert!(audit.contains("\"source\": \"custom\""));
    }

    #[test]
    fn run_review_maps_labeled_psychology_fields_to_name_category() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("intake.md");
        fs::write(&input, "Client: Jane Doe\nProvider: Shina Halavi, PhD\n").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[custom:CLIENT_NAME] Jane Doe -> [CLIENT]")
        );
        assert!(
            summary
                .review_summary
                .contains("[custom:PROVIDER_NAME] Shina Halavi, PhD -> [PROVIDER]")
        );
        assert!(
            summary
                .review_summary
                .contains("Currently covered Safe Harbor categories:")
        );
        assert!(summary.review_summary.contains("- Category 1: names"));
    }

    #[test]
    fn run_redacts_labeled_family_fields_in_psychology_text() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("intake.md");
        fs::write(
            &input,
            "Mother: Jane Doe\nFather: John Doe\nGuardian: Alex Example\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("Mother: [FAMILY_MEMBER]"));
        assert!(output.contains("Father: [FAMILY_MEMBER]"));
        assert!(output.contains("Guardian: [FAMILY_MEMBER]"));

        let audit = fs::read_to_string(summary.audit_output_path.unwrap()).unwrap();
        assert!(audit.contains("\"entity_type\": \"FAMILY_NAME\""));
        assert!(audit.contains("\"replacement\": \"[FAMILY_MEMBER]\""));
    }

    #[test]
    fn run_review_maps_labeled_family_fields_to_name_category() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("intake.md");
        fs::write(&input, "Mother: Jane Doe\nGuardian: Alex Example\n").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[custom:FAMILY_NAME] Jane Doe -> [FAMILY_MEMBER]")
        );
        assert!(
            summary
                .review_summary
                .contains("[custom:FAMILY_NAME] Alex Example -> [FAMILY_MEMBER]")
        );
        assert!(summary.review_summary.contains("- Category 1: names"));
    }

    #[test]
    fn run_redacts_labeled_institution_fields_in_psychology_text() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("intake.md");
        fs::write(
            &input,
            "School: Archer School\nClinic: USC Student Health\nEmployer: Acme Corp\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("School: [INSTITUTION]"));
        assert!(output.contains("Clinic: [INSTITUTION]"));
        assert!(output.contains("Employer: [INSTITUTION]"));

        let audit = fs::read_to_string(summary.audit_output_path.unwrap()).unwrap();
        assert!(audit.contains("\"entity_type\": \"INSTITUTION_NAME\""));
        assert!(audit.contains("\"replacement\": \"[INSTITUTION]\""));
    }

    #[test]
    fn run_review_maps_labeled_institution_fields_to_geography_category() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("intake.md");
        fs::write(
            &input,
            "School: Archer School\nClinic: USC Student Health\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[custom:INSTITUTION_NAME] Archer School -> [INSTITUTION]")
        );
        assert!(
            summary
                .review_summary
                .contains("[custom:INSTITUTION_NAME] USC Student Health -> [INSTITUTION]")
        );
        assert!(
            summary
                .review_summary
                .contains("- Category 2: geographic subdivisions smaller than a state")
        );
    }

    #[test]
    fn run_review_does_not_list_configured_client_under_raw_redact_core_coverage() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("client.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("Currently raw structured coverage from redact-core:")
        );
        assert!(summary.review_summary.contains("- EMAIL_ADDRESS"));
        assert!(!summary.review_summary.contains("- client"));
    }

    #[test]
    fn run_applies_configured_provider_replacement_alongside_redact_core() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("provider.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Dr. Smith emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"provider\"\nreplacement = \"PROVIDER_1\"\nvariants = [\"Dr. Smith\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "PROVIDER_1 emailed [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_review_labels_configured_provider_as_configured() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("provider.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Dr. Smith emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"provider\"\nreplacement = \"PROVIDER_1\"\nvariants = [\"Dr. Smith\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[configured:provider] Dr. Smith -> PROVIDER_1")
        );
        assert!(!summary.review_summary.contains("- provider"));
    }

    #[test]
    fn run_applies_configured_institution_replacement_alongside_redact_core() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("institution.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "USC emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"institution\"\nreplacement = \"INSTITUTION_1\"\nvariants = [\"USC\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "INSTITUTION_1 emailed [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_review_labels_configured_institution_as_configured() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("institution.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "USC emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"institution\"\nreplacement = \"INSTITUTION_1\"\nvariants = [\"USC\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[configured:institution] USC -> INSTITUTION_1")
        );
        assert!(!summary.review_summary.contains("- institution"));
    }

    #[test]
    fn run_applies_configured_location_replacement_alongside_redact_core() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("location.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Los Angeles emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"location\"\nreplacement = \"LOCATION_1\"\nvariants = [\"Los Angeles\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "LOCATION_1 emailed [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_review_labels_configured_location_as_configured() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("location.md");
        let config = temp.path().join("deid.toml");
        fs::write(&input, "Los Angeles emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"location\"\nreplacement = \"LOCATION_1\"\nvariants = [\"Los Angeles\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[configured:location] Los Angeles -> LOCATION_1")
        );
        assert!(!summary.review_summary.contains("- location"));
    }

    #[test]
    fn run_directory_processes_supported_files_into_markdown_outputs() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        fs::create_dir_all(input_dir.join("nested")).unwrap();
        fs::write(input_dir.join("a.md"), "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            input_dir.join("nested").join("b.txt"),
            "Dr. Smith emailed jane@example.com.",
        )
        .unwrap();
        fs::write(input_dir.join("skip.pdf"), "binary-ish").unwrap();

        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n\n[[exact_entities]]\nentity_type = \"provider\"\nreplacement = \"PROVIDER_1\"\nvariants = [\"Dr. Smith\"]\n",
        )
        .unwrap();

        let output_dir = temp.path().join("out");
        let audit_dir = temp.path().join("audit");
        let summary = run(RunOptions {
            input: input_dir.clone(),
            output: Some(output_dir.clone()),
            audit_output: Some(audit_dir.clone()),
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert_eq!(summary.output_path, Some(output_dir.clone()));
        assert_eq!(summary.audit_output_path, Some(audit_dir.clone()));
        assert_eq!(
            fs::read_to_string(output_dir.join("a.md")).unwrap(),
            "CLIENT emailed [EMAIL_ADDRESS]."
        );
        assert_eq!(
            fs::read_to_string(output_dir.join("nested").join("b.md")).unwrap(),
            "PROVIDER_1 emailed [EMAIL_ADDRESS]."
        );
        assert!(summary.review_summary.contains("processed files: 2"));
        assert!(summary.review_summary.contains("unsupported files: 0"));
        assert!(
            summary
                .review_summary
                .contains("extraction-failed files: 1")
        );
        assert!(summary.review_summary.contains("- skip.pdf"));
    }

    #[test]
    fn run_directory_without_output_override_writes_into_redacted_folder() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();

        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input: input_dir.clone(),
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert_eq!(summary.output_path, Some(input_dir.join("redacted")));
        assert_eq!(
            summary.audit_output_path,
            Some(input_dir.join("redacted/.audit"))
        );
        assert_eq!(
            fs::read_to_string(input_dir.join("redacted").join("note.md")).unwrap(),
            "CLIENT emailed [EMAIL_ADDRESS]."
        );
        assert!(
            input_dir
                .join("redacted/.audit")
                .join("note.audit.json")
                .exists()
        );
    }

    #[test]
    fn run_directory_skips_preexisting_generated_redacted_outputs() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        fs::create_dir_all(input_dir.join("redacted")).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();
        fs::write(
            input_dir.join("redacted").join("old.md"),
            "stale [EMAIL_ADDRESS] output",
        )
        .unwrap();

        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input: input_dir.clone(),
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert!(summary.review_summary.contains("processed files: 1"));
        assert!(!summary.review_summary.contains("- redacted/old.md"));
        assert_eq!(
            fs::read_to_string(input_dir.join("redacted").join("note.md")).unwrap(),
            "CLIENT emailed [EMAIL_ADDRESS]."
        );
    }

    #[test]
    fn run_directory_honors_include_and_exclude_patterns() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        fs::create_dir_all(input_dir.join("nested")).unwrap();
        fs::write(input_dir.join("a.md"), "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            input_dir.join("nested").join("b.txt"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();

        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let output_dir = temp.path().join("out");
        let summary = run(RunOptions {
            input: input_dir,
            output: Some(output_dir.clone()),
            audit_output: None,
            config: Some(config),
            include_patterns: vec!["**/*.md".to_string()],
            exclude_patterns: vec!["nested/*".to_string()],
            mode: RunMode::Replace,
        })
        .unwrap();

        assert!(output_dir.join("a.md").exists());
        assert!(!output_dir.join("nested").join("b.md").exists());
        assert!(summary.review_summary.contains("processed files: 1"));
        assert!(summary.review_summary.contains("skipped files: 1"));
        assert!(summary.review_summary.contains("- nested/b.txt"));
    }

    #[test]
    fn run_directory_deidentifies_output_and_audit_filenames() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("Jane Doe report.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();

        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let output_dir = temp.path().join("out");
        let audit_dir = temp.path().join("audit");
        let summary = run(RunOptions {
            input: input_dir,
            output: Some(output_dir.clone()),
            audit_output: Some(audit_dir.clone()),
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert!(output_dir.join("CLIENT report.md").exists());
        assert!(audit_dir.join("CLIENT report.audit.json").exists());
        assert!(summary.review_summary.contains("renamed outputs: 1"));
        assert!(
            summary
                .review_summary
                .contains("Jane Doe report.md -> CLIENT report.md")
        );
    }

    #[test]
    fn run_extracts_docx_to_markdown_and_deidentifies_it() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.docx");
        write_test_docx(
            &input,
            r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Jane Doe emailed jane@example.com.</w:t></w:r></w:p></w:body></w:document>"#,
        );
        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "CLIENT emailed [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_docx_surfaces_non_text_content_in_markdown() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.docx");
        write_test_docx(
            &input,
            r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Image follows</w:t></w:r><w:r><w:drawing/></w:r></w:p></w:body></w:document>"#,
        );

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "Image follows [OMITTED_NON_TEXT_CONTENT]");
    }

    #[test]
    fn run_docx_default_audit_output_remains_json() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.docx");
        write_test_docx(
            &input,
            r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Email jane@example.com.</w:t></w:r></w:p></w:body></w:document>"#,
        );

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        assert_eq!(
            summary.audit_output_path,
            Some(temp.path().join("note.audit.json"))
        );
    }

    #[test]
    fn run_extracts_pdf_to_markdown_and_deidentifies_it() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.pdf");
        write_test_pdf(&input, "Jane Doe emailed jane@example.com.");
        let config = temp.path().join("deid.toml");
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: Some(config),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert!(output.contains("CLIENT"));
        assert!(output.contains("[EMAIL_ADDRESS]"));
    }

    #[test]
    fn run_pdf_without_extractable_text_fails_explicitly() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("blank.pdf");
        write_blank_pdf(&input);

        let error = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap_err();

        assert!(error.to_string().contains(
            "PDF contains no extractable text; treat as non-extractable or low-confidence"
        ));
    }

    fn write_test_docx(path: &Path, document_xml: &str) {
        let file = fs::File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        zip.start_file("word/document.xml", options).unwrap();
        zip.write_all(document_xml.as_bytes()).unwrap();
        zip.finish().unwrap();
    }

    fn write_test_pdf(path: &Path, text: &str) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Courier",
        });
        let resources_id = doc.add_object(dictionary! {
            "Font" => dictionary! {
                "F1" => font_id,
            },
        });
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 12.into()]),
                Operation::new("Td", vec![50.into(), 700.into()]),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        });
        let pages = dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        };
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        doc.compress();
        doc.save(path).unwrap();
    }

    fn write_blank_pdf(path: &Path) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        });
        let pages = dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        };
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        doc.save(path).unwrap();
    }

    #[test]
    fn run_classifies_fax_numbers_with_custom_gap_policy() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("fax.md");
        fs::write(&input, "Fax: (555) 123-4567. Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "Fax: [FAX_NUMBER]. Email [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_review_surfaces_fax_as_custom_gap_classification() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("fax.md");
        fs::write(&input, "Fax: (555) 123-4567. Email jane@example.com.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[custom:FAX_NUMBER] (555) 123-4567 -> [FAX_NUMBER]")
        );
        assert!(summary.review_summary.contains("- Category 5: fax numbers"));
    }

    #[test]
    fn run_classifies_address_with_custom_gap_policy() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("address.md");
        fs::write(
            &input,
            "Address: 123 Main Street, Los Angeles, CA 90001. Email jane@example.com.",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Replace,
        })
        .unwrap();

        let output = fs::read_to_string(summary.output_path.unwrap()).unwrap();
        assert_eq!(output, "Address: [ADDRESS]. Email [EMAIL_ADDRESS].");
    }

    #[test]
    fn run_review_surfaces_address_as_custom_gap_classification() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("address.md");
        fs::write(
            &input,
            "Address: 123 Main Street, Los Angeles, CA 90001. Email jane@example.com.",
        )
        .unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[custom:ADDRESS] 123 Main Street, Los Angeles, CA 90001 -> [ADDRESS]")
        );
        assert!(
            summary
                .review_summary
                .contains("- Category 2: geographic subdivisions smaller than a state")
        );
    }

    #[test]
    fn run_custom_fax_classification_suppresses_overlapping_phone_detection() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("fax.md");
        fs::write(&input, "Fax: (555) 123-4567.").unwrap();

        let summary = run(RunOptions {
            input,
            output: None,
            audit_output: None,
            config: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
            mode: RunMode::Review,
        })
        .unwrap();

        assert!(
            summary
                .review_summary
                .contains("[custom:FAX_NUMBER] (555) 123-4567 -> [FAX_NUMBER]")
        );
        assert!(!summary.review_summary.contains("PHONE_NUMBER"));
    }
}
