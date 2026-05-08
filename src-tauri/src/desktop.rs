use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    Result, RunFileStatus, RunMode, RunOptions,
    config::{
        CaseContextConfig, ClientConfig, Config, DeidProfileConfig, ExactEntityConfig,
        NerConfig, PatternConfig, PatternRuleConfig,
    },
    extraction, run,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesktopReviewRequest {
    pub input: PathBuf,
    pub config: Option<PathBuf>,
    pub settings: Option<DesktopRunSettings>,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReviewResult {
    pub replacements: usize,
    pub non_text_omissions_detected: bool,
    pub file_statuses: Vec<RunFileStatus>,
    pub review_summary: String,
    pub coverage_note: &'static str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesktopReplaceRequest {
    pub input: PathBuf,
    pub config: Option<PathBuf>,
    pub settings: Option<DesktopRunSettings>,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRunSettings {
    #[serde(default)]
    pub profile: DesktopProfileSettings,
    #[serde(default)]
    pub case_context: DesktopCaseContextSettings,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopProfileSettings {
    pub patterns: DesktopPatternSettings,
    pub ner: DesktopNerSettings,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCaseContextSettings {
    pub client_replacement: String,
    pub client_variants: Vec<String>,
    #[serde(default)]
    pub exact_entities: Vec<DesktopExactEntitySettings>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopExactEntitySettings {
    pub entity_type: String,
    pub replacement: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPatternSettings {
    pub dates: DesktopPatternRuleSettings,
    pub emails: DesktopPatternRuleSettings,
    pub phones: DesktopPatternRuleSettings,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPatternRuleSettings {
    pub enabled: bool,
    pub replacement: String,
}

impl Default for DesktopPatternRuleSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            replacement: String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopNerSettings {
    pub enabled: bool,
    pub model_path: String,
    pub tokenizer_path: String,
    pub min_confidence: f32,
}

impl Default for DesktopNerSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            model_path: String::new(),
            tokenizer_path: String::new(),
            min_confidence: 0.7,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReplaceResult {
    pub replacements: usize,
    pub non_text_omissions_detected: bool,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub file_statuses: Vec<RunFileStatus>,
    pub file_previews: Vec<DesktopFilePreview>,
    pub review_summary: String,
    pub coverage_note: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFilePreview {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub original_html: Option<String>,
    pub redacted_html: String,
    pub redaction_terms: Vec<DesktopPreviewRedactionTerm>,
    pub review: DesktopReviewMetadata,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPreviewRedactionTerm {
    pub matched_text: String,
    pub replacement: String,
    pub entity_type: String,
    pub occurrences: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReviewMetadata {
    pub requires_manual_review: bool,
    pub extraction_provenance: Option<String>,
    pub reasons: Vec<DesktopReviewReason>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopReviewReason {
    OriginalPreviewUnavailable,
    NonTextOmissionsDetected,
    TextDegradedDetected,
    StructuralLossSuspected,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct EditableAuditPreviewReport {
    input_path: PathBuf,
    output_path: PathBuf,
    review_flags: Value,
    replacements: Vec<EditableAuditPreviewRecord>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct EditableAuditPreviewRecord {
    source: Value,
    entity_type: String,
    matched_text: String,
    replacement: String,
    reason: String,
    score: Option<f32>,
    start: usize,
    end: usize,
}

#[derive(Debug, Clone)]
struct HighlightRange {
    start: usize,
    end: usize,
    label: String,
    manual_number: Option<usize>,
    original_start: usize,
    original_end: usize,
    replacement: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreviewSelectionSource {
    Original,
    Redacted,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManualRedactionScope {
    SingleOccurrence,
    FileExactMatches,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAddRedactionRequest {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub source_preview: PreviewSelectionSource,
    pub selection_start: usize,
    pub selection_end: usize,
    pub redaction_scope: ManualRedactionScope,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRemoveRedactionRequest {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
    pub start: usize,
    pub end: usize,
    pub replacement: String,
    pub redaction_scope: ManualRedactionScope,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPreviewUpdateResult {
    pub preview: DesktopFilePreview,
    pub replacements: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPreviewArtifactRequest {
    pub path: PathBuf,
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub audit_output_path: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopExistingRedactionRequest {
    pub preview: DesktopPreviewArtifactRequest,
    pub start: usize,
    pub end: usize,
    pub replacement: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRedactionAcrossFilesRequest {
    pub source: DesktopExistingRedactionRequest,
    pub targets: Vec<DesktopPreviewArtifactRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAcrossFilesUpdateResult {
    pub updates: Vec<DesktopPreviewUpdateResult>,
    pub requested_targets: usize,
    pub updated_targets: usize,
    pub unchanged_targets: usize,
    pub ignored_targets: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAcrossFilesAvailability {
    pub applicable_targets: usize,
    pub removable_targets: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFindAndRedactRequest {
    pub term: String,
    pub targets: Vec<DesktopPreviewArtifactRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRemoveRedactionTermRequest {
    pub term: String,
    pub targets: Vec<DesktopPreviewArtifactRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopManualRedactionAvailability {
    pub exact_match_count: usize,
    pub mergeable: bool,
}

#[derive(Debug, Clone)]
struct ExactMatchPropagationRule {
    entity_type: String,
    matched_text: String,
    replacement: String,
    source: Value,
    reason: String,
}

impl DesktopRunSettings {
    fn into_runtime_config(self) -> Result<Option<Config>> {
        let client_replacement = self.case_context.client_replacement.trim().to_string();
        let client_variants = self
            .case_context
            .client_variants
            .into_iter()
            .map(|variant| variant.trim().to_string())
            .filter(|variant| !variant.is_empty())
            .collect::<Vec<_>>();

        let client = if client_replacement.is_empty() && client_variants.is_empty() {
            None
        } else {
            Some(ClientConfig {
                replacement: client_replacement,
                variants: client_variants,
            })
        };

        let exact_entities = self
            .case_context
            .exact_entities
            .into_iter()
            .filter_map(|entity| {
                let entity_type = entity.entity_type.trim().to_string();
                let replacement = entity.replacement.trim().to_string();
                let variants = entity
                    .variants
                    .into_iter()
                    .map(|variant| variant.trim().to_string())
                    .filter(|variant| !variant.is_empty())
                    .collect::<Vec<_>>();

                if entity_type.is_empty() && replacement.is_empty() && variants.is_empty() {
                    None
                } else {
                    Some(ExactEntityConfig {
                        entity_type,
                        replacement,
                        variants,
                    })
                }
            })
            .collect::<Vec<_>>();

        let profile = DeidProfileConfig {
            patterns: PatternConfig {
                dates: pattern_rule_from_settings(self.profile.patterns.dates),
                emails: pattern_rule_from_settings(self.profile.patterns.emails),
                phones: pattern_rule_from_settings(self.profile.patterns.phones),
            },
            ner: if self.profile.ner.enabled {
                Some(NerConfig {
                    enabled: true,
                    model_path: PathBuf::from(self.profile.ner.model_path.trim()),
                    tokenizer_path: match self.profile.ner.tokenizer_path.trim() {
                        "" => None,
                        value => Some(PathBuf::from(value)),
                    },
                    min_confidence: self.profile.ner.min_confidence,
                })
            } else {
                None
            },
        };

        let case_context = CaseContextConfig {
            client,
            exact_entities,
        };

        let config = Config::from_profile_and_case_context(profile, case_context);

        if config.is_empty() {
            return Ok(None);
        }

        config.validate()?;
        Ok(Some(config))
    }
}

fn pattern_rule_from_settings(settings: DesktopPatternRuleSettings) -> Option<PatternRuleConfig> {
    if !settings.enabled {
        return None;
    }

    Some(PatternRuleConfig {
        enabled: settings.enabled,
        replacement: settings.replacement.trim().to_string(),
    })
}

fn materialize_runtime_config(
    config_path: Option<PathBuf>,
    settings: Option<DesktopRunSettings>,
) -> Result<Option<PathBuf>> {
    if let Some(settings) = settings {
        let Some(config) = settings.into_runtime_config()? else {
            return Ok(None);
        };

        let path = std::env::temp_dir().join(format!(
            "tns-deid-desktop-runtime-{}.toml",
            std::process::id()
        ));
        let encoded = toml::to_string(&config).map_err(|error| {
            crate::error::AppError::InvalidConfig(format!(
                "failed to encode runtime desktop settings: {error}"
            ))
        })?;
        fs::write(&path, encoded).map_err(|source| crate::error::AppError::WriteFile {
            path: path.clone(),
            source,
        })?;
        return Ok(Some(path));
    }

    Ok(config_path)
}

pub fn run_review_job(request: DesktopReviewRequest) -> Result<DesktopReviewResult> {
    let runtime_config = materialize_runtime_config(request.config, request.settings)?;
    let summary = run(RunOptions {
        input: request.input,
        output: None,
        audit_output: None,
        config: runtime_config,
        include_patterns: request.include_patterns,
        exclude_patterns: request.exclude_patterns,
        mode: RunMode::Review,
    })?;

    Ok(DesktopReviewResult {
        replacements: summary.replacements,
        non_text_omissions_detected: summary.non_text_omissions_detected,
        file_statuses: summary.file_statuses,
        review_summary: summary.review_summary,
        coverage_note: summary.coverage_note,
    })
}

pub fn run_replace_job(request: DesktopReplaceRequest) -> Result<DesktopReplaceResult> {
    let runtime_config = materialize_runtime_config(request.config, request.settings)?;
    let summary = run(RunOptions {
        input: request.input,
        output: None,
        audit_output: None,
        config: runtime_config,
        include_patterns: request.include_patterns,
        exclude_patterns: request.exclude_patterns,
        mode: RunMode::Replace,
    })?;

    let file_previews = build_replace_previews(&summary.file_statuses, &summary.output_path)?;

    Ok(DesktopReplaceResult {
        replacements: summary.replacements,
        non_text_omissions_detected: summary.non_text_omissions_detected,
        output_path: summary.output_path.expect("replace mode output path"),
        audit_output_path: summary.audit_output_path.expect("replace mode audit path"),
        file_statuses: summary.file_statuses,
        file_previews,
        review_summary: summary.review_summary,
        coverage_note: summary.coverage_note,
    })
}

pub fn add_manual_redaction(
    request: DesktopAddRedactionRequest,
) -> Result<DesktopPreviewUpdateResult> {
    let original_text = load_preview_input_as_markdown(&request.input_path)?;
    let mut audit_report = read_editable_audit_report(&request.audit_output_path)?;
    let (start, end) = map_selection_to_original_range(
        &original_text,
        &audit_report.replacements,
        request.source_preview,
        request.selection_start,
        request.selection_end,
    )?;

    if overlaps_existing_replacement(&audit_report.replacements, start, end) {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "manual redactions must be selected outside existing highlights; click a highlight to remove it first".to_string(),
        ));
    }

    let matched_text = original_text[start..end].to_string();
    if matched_text.trim().is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text is empty or whitespace only".to_string(),
        ));
    }

    let new_replacements = match request.redaction_scope {
        ManualRedactionScope::SingleOccurrence => {
            if overlaps_existing_replacement(&audit_report.replacements, start, end) {
                Vec::new()
            } else {
                vec![EditableAuditPreviewRecord {
                    source: json!("custom"),
                    entity_type: "MANUAL_REDACTION".to_string(),
                    matched_text: matched_text.clone(),
                    replacement: "[MANUAL_REDACTION]".to_string(),
                    reason: "desktop manual single-occurrence redaction".to_string(),
                    score: None,
                    start,
                    end,
                }]
            }
        }
        ManualRedactionScope::FileExactMatches => build_manual_replacements_for_exact_matches(
            &original_text,
            &matched_text,
            &audit_report.replacements,
        ),
    };
    if new_replacements.is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text could not be promoted into a non-overlapping manual redaction"
                .to_string(),
        ));
    }

    audit_report.replacements.extend(new_replacements);
    sort_and_validate_replacements(&mut audit_report.replacements)?;

    persist_preview_edit(
        request.path,
        request.output_path,
        request.audit_output_path,
        original_text,
        audit_report,
    )
}

pub fn inspect_manual_redaction(
    request: DesktopAddRedactionRequest,
) -> Result<DesktopManualRedactionAvailability> {
    let original_text = load_preview_input_as_markdown(&request.input_path)?;
    let audit_report = read_editable_audit_report(&request.audit_output_path)?;
    let (start, end) = map_selection_to_original_range_for_merge(
        &original_text,
        &audit_report.replacements,
        request.source_preview,
        request.selection_start,
        request.selection_end,
    )?;

    if overlaps_existing_replacement(&audit_report.replacements, start, end) {
        return Ok(DesktopManualRedactionAvailability {
            exact_match_count: 0,
            mergeable: true,
        });
    }

    let matched_text = original_text[start..end].to_string();
    if matched_text.trim().is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text is empty or whitespace only".to_string(),
        ));
    }

    let exact_match_count = build_manual_replacements_for_exact_matches(
        &original_text,
        &matched_text,
        &audit_report.replacements,
    )
    .len();

    Ok(DesktopManualRedactionAvailability {
        exact_match_count,
        mergeable: false,
    })
}

pub fn merge_manual_redaction(
    request: DesktopAddRedactionRequest,
) -> Result<DesktopPreviewUpdateResult> {
    let original_text = load_preview_input_as_markdown(&request.input_path)?;
    let mut audit_report = read_editable_audit_report(&request.audit_output_path)?;
    let (start, end) = map_selection_to_original_range_for_merge(
        &original_text,
        &audit_report.replacements,
        request.source_preview,
        request.selection_start,
        request.selection_end,
    )?;
    let Some((merge_start, merge_end)) = merged_overlap_bounds(&audit_report.replacements, start, end)
    else {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text must overlap one or more existing redactions to merge".to_string(),
        ));
    };

    let matched_text = original_text[merge_start..merge_end].to_string();
    if matched_text.trim().is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text is empty or whitespace only".to_string(),
        ));
    }

    audit_report
        .replacements
        .retain(|record| !(merge_start < record.end && merge_end > record.start));
    audit_report.replacements.push(EditableAuditPreviewRecord {
        source: json!("custom"),
        entity_type: "MANUAL_REDACTION".to_string(),
        matched_text,
        replacement: "[MANUAL_REDACTION]".to_string(),
        reason: "desktop manual merged redaction".to_string(),
        score: None,
        start: merge_start,
        end: merge_end,
    });
    sort_and_validate_replacements(&mut audit_report.replacements)?;

    persist_preview_edit(
        request.path,
        request.output_path,
        request.audit_output_path,
        original_text,
        audit_report,
    )
}

pub fn find_and_redact_term(
    request: DesktopFindAndRedactRequest,
) -> Result<DesktopAcrossFilesUpdateResult> {
    let term = request.term.trim().to_string();
    if term.is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "enter some text before running find and redact".to_string(),
        ));
    }

    let propagation_rule = ExactMatchPropagationRule {
        source: json!("custom"),
        entity_type: "MANUAL_REDACTION".to_string(),
        matched_text: term,
        replacement: "[MANUAL_REDACTION]".to_string(),
        reason: "desktop manual find-and-redact".to_string(),
    };
    let existing_reason = propagation_rule.reason.clone();
    let existing_term = propagation_rule.matched_text.clone();

    update_redaction_targets(request.targets, |audit_report| {
        audit_report.replacements.retain(|record| {
            !(record.reason == existing_reason
                && same_match_text(&record.matched_text, &existing_term))
        });
    }, move |original_text, existing_replacements| {
        build_exact_match_replacements(
            original_text,
            &[propagation_rule.clone()],
            existing_replacements,
        )
    })
}

pub fn remove_redaction_term(
    request: DesktopRemoveRedactionTermRequest,
) -> Result<DesktopAcrossFilesUpdateResult> {
    let term = request.term.trim().to_string();
    if term.is_empty() {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "choose a redaction term before deleting it".to_string(),
        ));
    }

    update_redaction_targets(request.targets, move |audit_report| {
        audit_report
            .replacements
            .retain(|record| !same_match_text(&record.matched_text, &term));
    }, |_original_text, _existing_replacements| Vec::new())
}

pub fn apply_redaction_to_all_files(
    request: DesktopRedactionAcrossFilesRequest,
) -> Result<DesktopAcrossFilesUpdateResult> {
    let source_record = read_source_redaction_record(&request.source)?;
    let propagation_reason = source_propagation_reason(&request.source.preview.path);
    let propagation_rule = ExactMatchPropagationRule {
        source: json!("desktop_propagated"),
        entity_type: source_record.entity_type.clone(),
        matched_text: source_record.matched_text.clone(),
        replacement: source_record.replacement.clone(),
        reason: propagation_reason.clone(),
    };

    update_redaction_across_files(request, true, |audit_report| {
        audit_report.replacements.retain(|record| {
            !(record.reason == propagation_reason
                && record.entity_type == source_record.entity_type
                && same_match_text(&record.matched_text, &source_record.matched_text))
        });
    }, move |original_text, existing_replacements| {
        build_exact_match_replacements(original_text, &[propagation_rule.clone()], existing_replacements)
    })
}

pub fn remove_redaction_from_all_files(
    request: DesktopRedactionAcrossFilesRequest,
) -> Result<DesktopAcrossFilesUpdateResult> {
    let source_record = read_source_redaction_record(&request.source)?;

    update_redaction_across_files(request, true, move |audit_report| {
        audit_report.replacements.retain(|record| {
            !(same_match_text(&record.matched_text, &source_record.matched_text)
                && record.replacement == source_record.replacement)
        });
    }, |_original_text, _existing_replacements| Vec::new())
}

pub fn inspect_redaction_across_files(
    request: DesktopRedactionAcrossFilesRequest,
) -> Result<DesktopAcrossFilesAvailability> {
    let source_record = read_source_redaction_record(&request.source)?;
    let propagation_rule = ExactMatchPropagationRule {
        source: json!("desktop_propagated"),
        entity_type: source_record.entity_type.clone(),
        matched_text: source_record.matched_text.clone(),
        replacement: source_record.replacement.clone(),
        reason: source_propagation_reason(&request.source.preview.path),
    };

    let mut applicable_targets = 0usize;
    let mut removable_targets = 0usize;
    let mut seen_target_paths = HashSet::new();

    for target in request.targets {
        if !seen_target_paths.insert(target.path.clone()) {
            continue;
        }

        let original_text = load_preview_input_as_markdown(&target.input_path)?;
        let audit_report = read_editable_audit_report(&target.audit_output_path)?;

        let matching_records = audit_report
            .replacements
            .iter()
            .filter(|record| {
                same_match_text(&record.matched_text, &source_record.matched_text)
                    && record.replacement == source_record.replacement
            })
            .count();

        if (target.path == request.source.preview.path && matching_records > 1)
            || (target.path != request.source.preview.path && matching_records > 0)
        {
            removable_targets += 1;
        }

        let new_replacements = build_exact_match_replacements(
            &original_text,
            &[propagation_rule.clone()],
            &audit_report.replacements,
        );
        if !new_replacements.is_empty() {
            applicable_targets += 1;
        }
    }

    Ok(DesktopAcrossFilesAvailability {
        applicable_targets,
        removable_targets,
    })
}

fn update_redaction_across_files(
    request: DesktopRedactionAcrossFilesRequest,
    include_source_target: bool,
    normalize: impl FnMut(&mut EditableAuditPreviewReport),
    build_new_replacements: impl FnMut(&str, &[EditableAuditPreviewRecord]) -> Vec<EditableAuditPreviewRecord>,
) -> Result<DesktopAcrossFilesUpdateResult> {
    update_redaction_targets(
        request
            .targets
            .into_iter()
            .filter(|target| include_source_target || target.path != request.source.preview.path)
            .collect(),
        normalize,
        build_new_replacements,
    )
}

fn update_redaction_targets(
    targets: Vec<DesktopPreviewArtifactRequest>,
    mut normalize: impl FnMut(&mut EditableAuditPreviewReport),
    mut build_new_replacements: impl FnMut(&str, &[EditableAuditPreviewRecord]) -> Vec<EditableAuditPreviewRecord>,
) -> Result<DesktopAcrossFilesUpdateResult> {
    let requested_targets = targets.len();
    let mut updated_targets = 0usize;
    let mut unchanged_targets = 0usize;
    let mut ignored_targets = 0usize;
    let mut seen_target_paths = HashSet::new();
    let mut updates = Vec::new();

    for target in targets {
        if !seen_target_paths.insert(target.path.clone()) {
            ignored_targets += 1;
            continue;
        }

        let original_text = load_preview_input_as_markdown(&target.input_path)?;
        let mut audit_report = read_editable_audit_report(&target.audit_output_path)?;
        let original_replacements = audit_report.replacements.clone();

        normalize(&mut audit_report);
        let new_replacements = build_new_replacements(&original_text, &audit_report.replacements);
        audit_report.replacements.extend(new_replacements);
        sort_and_validate_replacements(&mut audit_report.replacements)?;

        if audit_report.replacements == original_replacements {
            unchanged_targets += 1;
            continue;
        }

        updates.push(persist_preview_edit(
            target.path,
            target.output_path,
            target.audit_output_path,
            original_text,
            audit_report,
        )?);
        updated_targets += 1;
    }

    Ok(DesktopAcrossFilesUpdateResult {
        updates,
        requested_targets,
        updated_targets,
        unchanged_targets,
        ignored_targets,
    })
}

fn read_source_redaction_record(
    request: &DesktopExistingRedactionRequest,
) -> Result<EditableAuditPreviewRecord> {
    let audit_report = read_editable_audit_report(&request.preview.audit_output_path)?;
    audit_report
        .replacements
        .into_iter()
        .find(|record| {
            record.start == request.start
                && record.end == request.end
                && record.replacement == request.replacement
        })
        .ok_or_else(|| {
            crate::error::AppError::InvalidPreviewEdit(
                "clicked redaction no longer exists in the current preview".to_string(),
            )
        })
}

fn build_manual_replacements_for_exact_matches(
    original_text: &str,
    matched_text: &str,
    existing_replacements: &[EditableAuditPreviewRecord],
) -> Vec<EditableAuditPreviewRecord> {
    build_exact_match_replacements(
        original_text,
        &[ExactMatchPropagationRule {
            source: json!("custom"),
            entity_type: "MANUAL_REDACTION".to_string(),
            matched_text: matched_text.to_string(),
            replacement: "[MANUAL_REDACTION]".to_string(),
            reason: "desktop manual exact-match propagation".to_string(),
        }],
        existing_replacements,
    )
}

fn source_propagation_reason(source_path: &Path) -> String {
    format!(
        "desktop propagated exact-match redaction from {}",
        source_path.display()
    )
}

fn build_exact_match_replacements(
    original_text: &str,
    rules: &[ExactMatchPropagationRule],
    existing_replacements: &[EditableAuditPreviewRecord],
) -> Vec<EditableAuditPreviewRecord> {
    let mut sorted_rules = rules.to_vec();
    sorted_rules.sort_by(|left, right| {
        right
            .matched_text
            .len()
            .cmp(&left.matched_text.len())
            .then_with(|| left.entity_type.cmp(&right.entity_type))
            .then_with(|| left.replacement.cmp(&right.replacement))
            .then_with(|| left.matched_text.cmp(&right.matched_text))
    });

    let mut occupied = existing_replacements.to_vec();
    let mut replacements = Vec::new();

    for rule in sorted_rules {
        for matched_range in literal_case_insensitive_matches(original_text, &rule.matched_text) {
            let start = matched_range.start;
            let end = matched_range.end;
            let matched_text = original_text[start..end].to_string();
            if !has_exact_match_boundaries(original_text, start, end, &matched_text) {
                continue;
            }
            if overlaps_existing_replacement(&occupied, start, end) {
                continue;
            }

            let record = EditableAuditPreviewRecord {
                source: rule.source.clone(),
                entity_type: rule.entity_type.clone(),
                matched_text,
                replacement: rule.replacement.clone(),
                reason: rule.reason.clone(),
                score: None,
                start,
                end,
            };
            occupied.push(record.clone());
            replacements.push(record);
        }
    }

    replacements.sort_by_key(|record| (record.start, record.end));
    replacements
}

fn literal_case_insensitive_matches<'a>(text: &'a str, matched_text: &str) -> Vec<std::ops::Range<usize>> {
    let pattern = format!("(?i:{})", regex::escape(matched_text));
    let regex = Regex::new(&pattern).expect("escaped literal case-insensitive regex");
    regex.find_iter(text).map(|matched| matched.range()).collect()
}

fn same_match_text(left: &str, right: &str) -> bool {
    left.to_lowercase() == right.to_lowercase()
}

fn has_exact_match_boundaries(text: &str, start: usize, end: usize, matched_text: &str) -> bool {
    let Some(first_char) = matched_text.chars().next() else {
        return false;
    };
    let Some(last_char) = matched_text.chars().next_back() else {
        return false;
    };

    let left_ok = if is_wordish(first_char) {
        text[..start]
            .chars()
            .next_back()
            .is_none_or(|ch| !is_wordish(ch))
    } else {
        true
    };

    let right_ok = if is_wordish(last_char) {
        text[end..]
            .chars()
            .next()
            .is_none_or(|ch| !is_wordish(ch))
    } else {
        true
    };

    left_ok && right_ok
}

fn is_wordish(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

pub fn remove_redaction(
    request: DesktopRemoveRedactionRequest,
) -> Result<DesktopPreviewUpdateResult> {
    let original_text = load_preview_input_as_markdown(&request.input_path)?;
    let mut audit_report = read_editable_audit_report(&request.audit_output_path)?;
    let original_len = audit_report.replacements.len();

    let target_record = audit_report
        .replacements
        .iter()
        .find(|record| {
            record.start == request.start
                && record.end == request.end
                && record.replacement == request.replacement
        })
        .cloned();

    let Some(target_record) = target_record else {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "clicked redaction no longer exists in the current preview".to_string(),
        ));
    };

    audit_report.replacements.retain(|record| match request.redaction_scope {
        ManualRedactionScope::SingleOccurrence => {
            !(record.start == request.start
                && record.end == request.end
                && record.replacement == request.replacement)
        }
        ManualRedactionScope::FileExactMatches => {
            !(record.entity_type == target_record.entity_type
                && record.matched_text == target_record.matched_text
                && record.replacement == target_record.replacement)
        }
    });

    if audit_report.replacements.len() == original_len {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "clicked redaction no longer exists in the current preview".to_string(),
        ));
    }

    sort_and_validate_replacements(&mut audit_report.replacements)?;

    persist_preview_edit(
        request.path,
        request.output_path,
        request.audit_output_path,
        original_text,
        audit_report,
    )
}

fn build_replace_previews(
    file_statuses: &[RunFileStatus],
    _output_root: &Option<PathBuf>,
) -> Result<Vec<DesktopFilePreview>> {
    let mut previews = Vec::new();

    for status in file_statuses {
        let Some(output_path) = status.output_path.as_ref() else {
            continue;
        };
        let Some(audit_path) = status.audit_output_path.as_ref() else {
            continue;
        };

        let redacted_text =
            fs::read_to_string(output_path).map_err(|source| crate::error::AppError::ReadFile {
                path: output_path.clone(),
                source,
            })?;
        let audit_json =
            fs::read_to_string(audit_path).map_err(|source| crate::error::AppError::ReadFile {
                path: audit_path.clone(),
                source,
            })?;
        let audit_report: EditableAuditPreviewReport = serde_json::from_str(&audit_json)
            .map_err(crate::error::AppError::SerializeAuditReport)?;
        previews.push(build_preview(
            status.path.clone(),
            output_path.clone(),
            audit_path.clone(),
            &redacted_text,
            &audit_report,
        )?);
    }

    Ok(previews)
}

fn build_preview(
    path: PathBuf,
    output_path: PathBuf,
    audit_output_path: PathBuf,
    redacted_text: &str,
    audit_report: &EditableAuditPreviewReport,
) -> Result<DesktopFilePreview> {
    let original_text = load_preview_input_as_markdown(&audit_report.input_path).ok();
    let extraction_fidelity = audit_report.review_flags.get("extraction_fidelity");
    let non_text_omissions_detected = audit_report
        .review_flags
        .get("non_text_omissions_detected")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let text_degraded_detected = audit_report
        .review_flags
        .get("text_degraded_detected")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let structural_loss_suspected = extraction_fidelity
        .and_then(|value| value.get("structural_loss_suspected"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let low_confidence_review_required = extraction_fidelity
        .and_then(|value| value.get("low_confidence_review_required"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let extraction_provenance = extraction_fidelity
        .and_then(|value| value.get("provenance"))
        .and_then(Value::as_str);

    let original_html = original_text.as_ref().map(|text| {
        render_highlighted_html(text, &map_original_highlights(&audit_report.replacements))
    });
    let redacted_html = render_highlighted_html(
        redacted_text,
        &map_redacted_highlights(&audit_report.replacements),
    );

    Ok(DesktopFilePreview {
        path,
        input_path: audit_report.input_path.clone(),
        output_path,
        audit_output_path,
        original_html,
        redacted_html,
        redaction_terms: build_preview_redaction_terms(&audit_report.replacements),
        review: build_review_metadata(
            original_text.is_none(),
            extraction_provenance,
            non_text_omissions_detected,
            text_degraded_detected,
            structural_loss_suspected,
            low_confidence_review_required,
        ),
    })
}

fn build_preview_redaction_terms(
    records: &[EditableAuditPreviewRecord],
) -> Vec<DesktopPreviewRedactionTerm> {
    let mut terms = Vec::<DesktopPreviewRedactionTerm>::new();

    for record in records {
        if let Some(existing) = terms.iter_mut().find(|term| {
            same_match_text(&term.matched_text, &record.matched_text)
                && term.replacement == record.replacement
                && term.entity_type == record.entity_type
        }) {
            existing.occurrences += 1;
            continue;
        }

        terms.push(DesktopPreviewRedactionTerm {
            matched_text: record.matched_text.clone(),
            replacement: record.replacement.clone(),
            entity_type: record.entity_type.clone(),
            occurrences: 1,
        });
    }

    terms.sort_by(|left, right| {
        right
            .occurrences
            .cmp(&left.occurrences)
            .then_with(|| left.matched_text.to_lowercase().cmp(&right.matched_text.to_lowercase()))
    });
    terms
}

fn build_review_metadata(
    original_preview_unavailable: bool,
    extraction_provenance: Option<&str>,
    non_text_omissions_detected: bool,
    text_degraded_detected: bool,
    structural_loss_suspected: bool,
    low_confidence_review_required: bool,
) -> DesktopReviewMetadata {
    let mut reasons = Vec::new();

    if original_preview_unavailable {
        reasons.push(DesktopReviewReason::OriginalPreviewUnavailable);
    }
    if non_text_omissions_detected {
        reasons.push(DesktopReviewReason::NonTextOmissionsDetected);
    }
    if text_degraded_detected {
        reasons.push(DesktopReviewReason::TextDegradedDetected);
    }
    if structural_loss_suspected {
        reasons.push(DesktopReviewReason::StructuralLossSuspected);
    }

    DesktopReviewMetadata {
        requires_manual_review: non_text_omissions_detected
            || text_degraded_detected
            || structural_loss_suspected
            || low_confidence_review_required,
        extraction_provenance: extraction_provenance.map(str::to_string),
        reasons,
    }
}

fn persist_preview_edit(
    path: PathBuf,
    output_path: PathBuf,
    audit_output_path: PathBuf,
    original_text: String,
    mut audit_report: EditableAuditPreviewReport,
) -> Result<DesktopPreviewUpdateResult> {
    audit_report.output_path = output_path.clone();
    let redacted_text = render_redacted_text(&original_text, &audit_report.replacements)?;
    fs::write(&output_path, &redacted_text).map_err(|source| {
        crate::error::AppError::WriteFile {
            path: output_path.clone(),
            source,
        }
    })?;

    let audit_json = serde_json::to_string_pretty(&audit_report)
        .map_err(crate::error::AppError::SerializeAuditReport)?;
    fs::write(&audit_output_path, audit_json).map_err(|source| {
        crate::error::AppError::WriteFile {
            path: audit_output_path.clone(),
            source,
        }
    })?;

    Ok(DesktopPreviewUpdateResult {
        preview: build_preview(
            path,
            output_path,
            audit_output_path,
            &redacted_text,
            &audit_report,
        )?,
        replacements: audit_report.replacements.len(),
    })
}

fn read_editable_audit_report(path: &Path) -> Result<EditableAuditPreviewReport> {
    let audit_json =
        fs::read_to_string(path).map_err(|source| crate::error::AppError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?;
    serde_json::from_str(&audit_json).map_err(crate::error::AppError::SerializeAuditReport)
}

fn load_preview_input_as_markdown(path: &Path) -> Result<String> {
    extraction::extract_input(path).map(|extracted| extracted.text)
}

fn map_redacted_highlights(records: &[EditableAuditPreviewRecord]) -> Vec<HighlightRange> {
    let mut ranges = Vec::with_capacity(records.len());
    let mut input_cursor = 0usize;
    let mut output_cursor = 0usize;
    let mut manual_redaction_number = 0usize;

    for record in records {
        let manual_number = if is_manual_redaction(record) {
            manual_redaction_number += 1;
            Some(manual_redaction_number)
        } else {
            None
        };
        let replacement_text = rendered_replacement_text(record, manual_number);
        let start = output_cursor + record.start.saturating_sub(input_cursor);
        let end = start + replacement_text.len();
        ranges.push(HighlightRange {
            start,
            end,
            label: highlight_label(record, manual_number),
            manual_number,
            original_start: record.start,
            original_end: record.end,
            replacement: record.replacement.clone(),
        });
        input_cursor = record.end;
        output_cursor = end;
    }

    ranges
}

fn map_original_highlights(records: &[EditableAuditPreviewRecord]) -> Vec<HighlightRange> {
    let mut manual_redaction_number = 0usize;

    records
        .iter()
        .map(|record| {
            let manual_number = if is_manual_redaction(record) {
                manual_redaction_number += 1;
                Some(manual_redaction_number)
            } else {
                None
            };

            HighlightRange {
                start: record.start,
                end: record.end,
                label: highlight_label(record, manual_number),
                manual_number,
                original_start: record.start,
                original_end: record.end,
                replacement: record.replacement.clone(),
            }
        })
        .collect()
}

fn is_manual_redaction(record: &EditableAuditPreviewRecord) -> bool {
    record.entity_type == "MANUAL_REDACTION"
}

fn highlight_label(record: &EditableAuditPreviewRecord, manual_number: Option<usize>) -> String {
    match manual_number {
        Some(number) => format!("Manual redaction {number}"),
        None => record.entity_type.clone(),
    }
}

fn rendered_replacement_text(
    record: &EditableAuditPreviewRecord,
    manual_number: Option<usize>,
) -> String {
    match manual_number {
        Some(number) => format!("[MANUAL_REDACTION_{number}]"),
        None => record.replacement.clone(),
    }
}

fn render_highlighted_html(text: &str, ranges: &[HighlightRange]) -> String {
    let mut html = String::new();
    let mut cursor = 0usize;

    for range in ranges {
        if range.start > text.len() || range.end > text.len() || range.start >= range.end {
            continue;
        }

        if cursor < range.start {
            html.push_str(&escape_html(&text[cursor..range.start]));
        }

        html.push_str("<mark title=\"");
        html.push_str(&escape_html(&range.label));
        html.push_str("\" data-record-start=\"");
        html.push_str(&range.original_start.to_string());
        html.push_str("\" data-record-end=\"");
        html.push_str(&range.original_end.to_string());
        html.push_str("\" data-record-replacement=\"");
        html.push_str(&escape_html(&range.replacement));
        if let Some(number) = range.manual_number {
            html.push_str("\" data-manual-number=\"");
            html.push_str(&number.to_string());
        }
        html.push_str("\" data-record-label=\"");
        html.push_str(&escape_html(&range.label));
        html.push_str("\">");
        html.push_str(&escape_html(&text[range.start..range.end]));
        html.push_str("</mark>");
        cursor = range.end;
    }

    if cursor < text.len() {
        html.push_str(&escape_html(&text[cursor..]));
    }

    html
}

fn render_redacted_text(text: &str, records: &[EditableAuditPreviewRecord]) -> Result<String> {
    let mut output = String::new();
    let mut cursor = 0usize;
    let mut manual_redaction_number = 0usize;

    for record in records {
        validate_text_range(text, record.start, record.end)?;
        if cursor > record.start {
            return Err(crate::error::AppError::InvalidPreviewEdit(
                "redaction ranges overlap in the current audit report".to_string(),
            ));
        }

        output.push_str(&text[cursor..record.start]);
        let manual_number = if is_manual_redaction(record) {
            manual_redaction_number += 1;
            Some(manual_redaction_number)
        } else {
            None
        };
        output.push_str(&rendered_replacement_text(record, manual_number));
        cursor = record.end;
    }

    output.push_str(&text[cursor..]);
    Ok(output)
}

fn sort_and_validate_replacements(records: &mut [EditableAuditPreviewRecord]) -> Result<()> {
    records.sort_by_key(|record| (record.start, record.end));

    for window in records.windows(2) {
        if window[0].end > window[1].start {
            return Err(crate::error::AppError::InvalidPreviewEdit(
                "redaction ranges overlap in the current audit report".to_string(),
            ));
        }
    }

    Ok(())
}

fn map_selection_to_original_range(
    original_text: &str,
    records: &[EditableAuditPreviewRecord],
    source: PreviewSelectionSource,
    selection_start: usize,
    selection_end: usize,
) -> Result<(usize, usize)> {
    if selection_start >= selection_end {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "select some text before applying a manual redaction".to_string(),
        ));
    }

    let (start, end) = match source {
        PreviewSelectionSource::Original => (selection_start, selection_end),
        PreviewSelectionSource::Redacted => (
            map_redacted_offset_to_original(records, selection_start)?,
            map_redacted_offset_to_original(records, selection_end)?,
        ),
    };

    validate_text_range(original_text, start, end)?;
    Ok((start, end))
}

fn map_selection_to_original_range_for_merge(
    original_text: &str,
    records: &[EditableAuditPreviewRecord],
    source: PreviewSelectionSource,
    selection_start: usize,
    selection_end: usize,
) -> Result<(usize, usize)> {
    if selection_start >= selection_end {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "select some text before applying a manual redaction".to_string(),
        ));
    }

    let (start, end) = match source {
        PreviewSelectionSource::Original => (selection_start, selection_end),
        PreviewSelectionSource::Redacted => (
            map_redacted_offset_to_original_for_merge(records, selection_start, false)?,
            map_redacted_offset_to_original_for_merge(records, selection_end, true)?,
        ),
    };

    validate_text_range(original_text, start, end)?;
    Ok((start, end))
}

fn map_redacted_offset_to_original(
    records: &[EditableAuditPreviewRecord],
    offset: usize,
) -> Result<usize> {
    let mut input_cursor = 0usize;
    let mut output_cursor = 0usize;
    let mut manual_redaction_number = 0usize;

    for record in records {
        let manual_number = if is_manual_redaction(record) {
            manual_redaction_number += 1;
            Some(manual_redaction_number)
        } else {
            None
        };
        let unchanged_len = record.start.saturating_sub(input_cursor);
        let replacement_start = output_cursor + unchanged_len;
        if offset <= replacement_start {
            return Ok(input_cursor + offset.saturating_sub(output_cursor));
        }

        let replacement_end =
            replacement_start + rendered_replacement_text(record, manual_number).len();
        if offset < replacement_end {
            return Err(crate::error::AppError::InvalidPreviewEdit(
                "cannot add a new redaction from inside an existing redacted replacement"
                    .to_string(),
            ));
        }

        input_cursor = record.end;
        output_cursor = replacement_end;
    }

    Ok(input_cursor + offset.saturating_sub(output_cursor))
}

fn map_redacted_offset_to_original_for_merge(
    records: &[EditableAuditPreviewRecord],
    offset: usize,
    use_end_boundary: bool,
) -> Result<usize> {
    let mut input_cursor = 0usize;
    let mut output_cursor = 0usize;
    let mut manual_redaction_number = 0usize;

    for record in records {
        let manual_number = if is_manual_redaction(record) {
            manual_redaction_number += 1;
            Some(manual_redaction_number)
        } else {
            None
        };
        let unchanged_len = record.start.saturating_sub(input_cursor);
        let replacement_start = output_cursor + unchanged_len;
        if offset <= replacement_start {
            return Ok(input_cursor + offset.saturating_sub(output_cursor));
        }

        let replacement_end =
            replacement_start + rendered_replacement_text(record, manual_number).len();
        if offset < replacement_end {
            return Ok(if use_end_boundary { record.end } else { record.start });
        }

        input_cursor = record.end;
        output_cursor = replacement_end;
    }

    Ok(input_cursor + offset.saturating_sub(output_cursor))
}

fn merged_overlap_bounds(
    records: &[EditableAuditPreviewRecord],
    start: usize,
    end: usize,
) -> Option<(usize, usize)> {
    let mut merge_start = start;
    let mut merge_end = end;
    let mut found_overlap = false;

    for record in records {
        if merge_start < record.end && merge_end > record.start {
            merge_start = merge_start.min(record.start);
            merge_end = merge_end.max(record.end);
            found_overlap = true;
        }
    }

    if found_overlap {
        Some((merge_start, merge_end))
    } else {
        None
    }
}

fn overlaps_existing_replacement(
    records: &[EditableAuditPreviewRecord],
    start: usize,
    end: usize,
) -> bool {
    records
        .iter()
        .any(|record| start < record.end && end > record.start)
}

fn validate_text_range(text: &str, start: usize, end: usize) -> Result<()> {
    if start > text.len() || end > text.len() || start >= end {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text is outside the current preview bounds".to_string(),
        ));
    }

    if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
        return Err(crate::error::AppError::InvalidPreviewEdit(
            "selected text does not align to valid character boundaries".to_string(),
        ));
    }

    Ok(())
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use serde_json::json;
    use tempfile::tempdir;

    use crate::RunFileStatusKind;
    use lopdf::content::{Content, Operation};
    use lopdf::{Document, Object, Stream, dictionary};

    use super::{
        DesktopAddRedactionRequest, DesktopExistingRedactionRequest, DesktopFindAndRedactRequest,
        DesktopRemoveRedactionTermRequest,
        DesktopRedactionAcrossFilesRequest,
        DesktopCaseContextSettings, DesktopExactEntitySettings, DesktopNerSettings,
        DesktopPatternRuleSettings, DesktopPatternSettings, DesktopPreviewArtifactRequest,
        DesktopProfileSettings, DesktopRemoveRedactionRequest, DesktopReplaceRequest,
        DesktopReviewReason, DesktopReviewRequest, DesktopRunSettings,
        EditableAuditPreviewRecord, ManualRedactionScope, PreviewSelectionSource,
        add_manual_redaction, apply_redaction_to_all_files, inspect_redaction_across_files,
        find_and_redact_term, remove_redaction_term,
        inspect_manual_redaction, merge_manual_redaction, remove_redaction_from_all_files,
        build_manual_replacements_for_exact_matches, load_preview_input_as_markdown,
        map_original_highlights, read_editable_audit_report, remove_redaction, run_replace_job,
        run_review_job,
    };

    #[test]
    fn desktop_review_job_uses_real_non_writing_review_workflow() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.md");
        let config = temp.path().join("deid.toml");

        fs::write(&input, "Jane Doe emailed jane@example.com.").unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_review_job(DesktopReviewRequest {
            input,
            config: Some(config),
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.replacements, 2);
        assert!(!result.non_text_omissions_detected);
        assert_eq!(result.file_statuses.len(), 1);
        assert_eq!(result.file_statuses[0].status, RunFileStatusKind::Reviewed);
        assert_eq!(result.file_statuses[0].replacements, 2);
        assert!(result.file_statuses[0].review_sensitive);
        assert!(
            result
                .review_summary
                .contains("[configured:client] Jane Doe -> CLIENT")
        );
        assert!(
            result
                .review_summary
                .contains("[redact-core:EMAIL_ADDRESS]")
        );
        assert!(
            result
                .coverage_note
                .contains("Structured identifiers were processed")
        );
        assert!(!temp.path().join("note.deidentified.md").exists());
        assert!(!temp.path().join("note.audit.json").exists());
    }

    #[test]
    fn desktop_replace_job_uses_real_writing_replace_workflow() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.replacements, 2);
        assert_eq!(result.output_path, input_dir.join("redacted"));
        assert_eq!(result.audit_output_path, input_dir.join("redacted/.audit"));
        assert_eq!(result.file_statuses.len(), 1);
        assert_eq!(result.file_statuses[0].path, PathBuf::from("note.md"));
        assert_eq!(result.file_statuses[0].status, RunFileStatusKind::Processed);
        assert_eq!(result.file_statuses[0].replacements, 2);
        assert_eq!(
            result.file_statuses[0].output_path,
            Some(input_dir.join("redacted/note.md"))
        );
        assert_eq!(result.file_previews.len(), 1);
        assert_eq!(result.file_previews[0].path, PathBuf::from("note.md"));
        assert!(
            result.file_previews[0]
                .original_html
                .as_ref()
                .is_some_and(|html| {
                    html.contains("data-record-start=")
                        && html.contains("title=\"EMAIL_ADDRESS\"")
                        && html.contains(">jane@example.com</mark>")
                })
        );
        assert!(
            result.file_previews[0]
                .redacted_html
                .contains("title=\"EMAIL_ADDRESS\"")
                && result.file_previews[0]
                    .redacted_html
                    .contains(">[EMAIL_ADDRESS]</mark>")
        );
        assert!(input_dir.join("redacted/note.md").exists());
        assert!(input_dir.join("redacted/.audit/note.audit.json").exists());
    }

    #[test]
    fn desktop_review_job_composes_profile_and_case_context_settings() {
        let temp = tempdir().unwrap();
        let input = temp.path().join("note.md");

        fs::write(&input, "Jane Doe emailed jane@example.com on 01/02/2024.").unwrap();

        let result = run_review_job(DesktopReviewRequest {
            input,
            config: None,
            settings: Some(DesktopRunSettings {
                profile: DesktopProfileSettings {
                    patterns: DesktopPatternSettings {
                        dates: DesktopPatternRuleSettings {
                            enabled: true,
                            replacement: "[DATE]".into(),
                        },
                        emails: DesktopPatternRuleSettings::default(),
                        phones: DesktopPatternRuleSettings::default(),
                    },
                    ner: DesktopNerSettings::default(),
                },
                case_context: DesktopCaseContextSettings {
                    client_replacement: "CLIENT".into(),
                    client_variants: vec!["Jane Doe".into()],
                    exact_entities: vec![DesktopExactEntitySettings {
                        entity_type: "provider".into(),
                        replacement: "[PROVIDER]".into(),
                        variants: vec!["Dr. Smith".into()],
                    }],
                },
            }),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.replacements, 3);
        assert!(result.review_summary.contains("[configured:client] Jane Doe -> CLIENT"));
        assert!(result.review_summary.contains("[redact-core:EMAIL_ADDRESS]"));
        assert!(result.review_summary.contains("[configured:date] 01/02/2024 -> [DATE]"));
    }

    #[test]
    fn desktop_replace_job_builds_original_preview_for_pdf_inputs() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        let input = input_dir.join("note.pdf");
        write_test_pdf(
            &input,
            "Student: Teddy Roosevelt Phone: (202) 456-1111 Date of Birth: October 27, 1858",
        );

        let result = run_replace_job(DesktopReplaceRequest {
            input: input.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert_eq!(result.file_previews.len(), 1);
        let preview = &result.file_previews[0];
        assert_eq!(preview.path, input);
        assert_eq!(
            preview.review.extraction_provenance.as_deref(),
            Some("pdf_text")
        );
        assert!(
            preview
                .original_html
                .as_ref()
                .is_some_and(|html| html.contains("(202) 456-1111"))
        );
        assert!(preview.redacted_html.contains("[PHONE_NUMBER]"));
    }

    #[test]
    fn desktop_replace_job_surfaces_docx_omission_note_in_preview() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        let input = input_dir.join("note.docx");
        fs::write(
            &input,
            build_test_docx_bytes(
                r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Image follows</w:t></w:r><w:r><w:drawing/></w:r></w:p></w:body></w:document>"#,
            ),
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input,
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        assert!(
            result.file_previews[0]
                .review
                .reasons
                .contains(&DesktopReviewReason::NonTextOmissionsDetected)
        );
    }

    #[test]
    fn add_manual_redaction_persists_preview_edit() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com. Later, Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        assert_eq!(updated.replacements, 6);
        assert!(updated.preview.redacted_html.contains("[MANUAL_REDACTION_1]"));
        assert!(
            updated
                .preview
                .original_html
                .as_ref()
                .is_some_and(|html| html.contains("Manual redaction 1"))
        );
        assert!(
            updated
                .preview
                .redacted_html
                .contains("data-manual-number=\"1\"")
        );
        assert!(
            updated
                .preview
                .redacted_html
                .contains("data-manual-number=\"2\"")
        );
        assert!(
            fs::read_to_string(&preview.output_path)
                .unwrap()
                .contains("[MANUAL_REDACTION_1]")
        );
    }

    #[test]
    fn add_manual_redaction_can_limit_to_single_occurrence() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com. Later, Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        assert_eq!(updated.replacements, 5);
        assert!(updated.preview.redacted_html.contains("data-manual-number=\"1\""));
        assert!(!updated.preview.redacted_html.contains("data-manual-number=\"2\""));
    }

    #[test]
    fn manual_redaction_output_tokens_are_numbered_in_document_order() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "alpha beta gamma beta delta",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("beta").unwrap();
        let selection_end = selection_start + "beta".len();

        let _updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        let output = fs::read_to_string(&preview.output_path).unwrap();
        assert!(output.contains("[MANUAL_REDACTION_1]"));
        assert!(output.contains("[MANUAL_REDACTION_2]"));
    }

    #[test]
    fn manual_redaction_exact_match_propagation_skips_existing_replacements() {
        let replacements = build_manual_replacements_for_exact_matches(
            "alpha beta alpha gamma alpha",
            "alpha",
            &[EditableAuditPreviewRecord {
                source: json!("configured"),
                entity_type: "CLIENT".to_string(),
                matched_text: "alpha".to_string(),
                replacement: "CLIENT".to_string(),
                reason: "configured".to_string(),
                score: None,
                start: 11,
                end: 16,
            }],
        );

        assert_eq!(replacements.len(), 2);
        assert_eq!(replacements[0].start, 0);
        assert_eq!(replacements[1].start, 23);
        assert!(replacements
            .iter()
            .all(|record| record.reason == "desktop manual exact-match propagation"));
    }

    #[test]
    fn manual_redaction_exact_match_propagation_does_not_match_inside_larger_words() {
        let replacements = build_manual_replacements_for_exact_matches(
            "CA CASE CA, SCAFFOLD",
            "CA",
            &[],
        );

        assert_eq!(replacements.len(), 2);
        assert_eq!(replacements[0].matched_text, "CA");
        assert_eq!(replacements[0].start, 0);
        assert_eq!(replacements[1].start, 8);
    }

    #[test]
    fn manual_redaction_exact_match_propagation_is_case_insensitive() {
        let replacements = build_manual_replacements_for_exact_matches(
            "John met JOHN and johnny before john left.",
            "john",
            &[],
        );

        assert_eq!(replacements.len(), 3);
        assert_eq!(replacements[0].matched_text, "John");
        assert_eq!(replacements[1].matched_text, "JOHN");
        assert_eq!(replacements[2].matched_text, "john");
    }

    #[test]
    fn manual_redaction_highlights_are_numbered_in_document_order() {
        let highlights = map_original_highlights(&[
            EditableAuditPreviewRecord {
                source: json!("custom"),
                entity_type: "MANUAL_REDACTION".to_string(),
                matched_text: "beta".to_string(),
                replacement: "[MANUAL_REDACTION]".to_string(),
                reason: "desktop manual selection".to_string(),
                score: None,
                start: 6,
                end: 10,
            },
            EditableAuditPreviewRecord {
                source: json!("custom"),
                entity_type: "EMAIL_ADDRESS".to_string(),
                matched_text: "jane@example.com".to_string(),
                replacement: "[EMAIL_ADDRESS]".to_string(),
                reason: "pattern".to_string(),
                score: Some(0.8),
                start: 11,
                end: 27,
            },
            EditableAuditPreviewRecord {
                source: json!("custom"),
                entity_type: "MANUAL_REDACTION".to_string(),
                matched_text: "gamma".to_string(),
                replacement: "[MANUAL_REDACTION]".to_string(),
                reason: "desktop manual selection".to_string(),
                score: None,
                start: 28,
                end: 33,
            },
        ]);

        assert_eq!(highlights[0].manual_number, Some(1));
        assert_eq!(highlights[0].label, "Manual redaction 1");
        assert_eq!(highlights[1].manual_number, None);
        assert_eq!(highlights[1].label, "EMAIL_ADDRESS");
        assert_eq!(highlights[2].manual_number, Some(2));
        assert_eq!(highlights[2].label, "Manual redaction 2");
    }

    #[test]
    fn remove_redaction_restores_original_segment() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let audit_report = read_editable_audit_report(&preview.audit_output_path).unwrap();
        let email_record = audit_report
            .replacements
            .iter()
            .find(|record| record.entity_type == "EMAIL_ADDRESS")
            .unwrap();

        let updated = remove_redaction(DesktopRemoveRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            start: email_record.start,
            end: email_record.end,
            replacement: email_record.replacement.clone(),
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        assert_eq!(updated.replacements, 1);
        assert!(updated.preview.redacted_html.contains("jane@example.com"));
        assert!(
            fs::read_to_string(&preview.output_path)
                .unwrap()
                .contains("jane@example.com")
        );
    }

    #[test]
    fn remove_redaction_can_remove_all_matching_manual_redactions() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");
        let config = temp.path().join("deid.toml");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("note.md"),
            "Jane Doe emailed jane@example.com. Later, Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            &config,
            "[client]\nreplacement = \"CLIENT\"\nvariants = [\"Jane Doe\"]\n",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: Some(config),
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();
        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        let audit_report = read_editable_audit_report(&updated.preview.audit_output_path).unwrap();
        let manual_record = audit_report
            .replacements
            .iter()
            .find(|record| record.entity_type == "MANUAL_REDACTION")
            .unwrap();

        let removed = remove_redaction(DesktopRemoveRedactionRequest {
            path: updated.preview.path.clone(),
            input_path: updated.preview.input_path.clone(),
            output_path: updated.preview.output_path.clone(),
            audit_output_path: updated.preview.audit_output_path.clone(),
            start: manual_record.start,
            end: manual_record.end,
            replacement: manual_record.replacement.clone(),
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        assert_eq!(removed.replacements, 4);
        assert!(!removed.preview.redacted_html.contains("data-manual-number=\"1\""));
        assert!(!removed.preview.redacted_html.contains("data-manual-number=\"2\""));
    }

    #[test]
    fn apply_redaction_to_all_files_updates_matching_targets_and_preserves_synced_source() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("source.md"),
            "Jane Doe emailed jane@example.com. Later Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            input_dir.join("target.md"),
            "The coordinator emailed support@example.com and then emailed billing@example.com.",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let target_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let selection_start = source_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        let applied = apply_redaction_to_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![
                DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: target_preview.path.clone(),
                    input_path: target_preview.input_path.clone(),
                    output_path: target_preview.output_path.clone(),
                    audit_output_path: target_preview.audit_output_path.clone(),
                },
            ],
        })
        .unwrap();

        assert_eq!(applied.requested_targets, 2);
        assert_eq!(applied.updated_targets, 1);
        assert_eq!(applied.ignored_targets, 0);
        assert_eq!(applied.unchanged_targets, 1);
        assert_eq!(applied.updates.len(), 1);
        assert!(applied.updates[0].preview.redacted_html.contains("[MANUAL_REDACTION_1]"));
        assert!(
            fs::read_to_string(&target_preview.output_path)
                .unwrap()
                .contains("[MANUAL_REDACTION_1]")
        );
    }

    #[test]
    fn inspect_redaction_across_files_reports_available_actions() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("source.md"),
            "Jane Doe emailed jane@example.com. Later Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            input_dir.join("target-a.md"),
            "The coordinator emailed support@example.com and then emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            input_dir.join("target-b.md"),
            "The office emailed billing@example.com once already.",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let target_a = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target-a.md"))
            .unwrap();
        let target_b = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target-b.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let selection_start = source_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        let _applied = apply_redaction_to_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: result
                .file_previews
                .iter()
                .map(|preview| DesktopPreviewArtifactRequest {
                    path: preview.path.clone(),
                    input_path: preview.input_path.clone(),
                    output_path: preview.output_path.clone(),
                    audit_output_path: preview.audit_output_path.clone(),
                })
                .collect(),
        })
        .unwrap();

        let availability = inspect_redaction_across_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![
                DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: target_a.path.clone(),
                    input_path: target_a.input_path.clone(),
                    output_path: target_a.output_path.clone(),
                    audit_output_path: target_a.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: target_b.path.clone(),
                    input_path: target_b.input_path.clone(),
                    output_path: target_b.output_path.clone(),
                    audit_output_path: target_b.audit_output_path.clone(),
                },
            ],
        })
        .unwrap();

        assert_eq!(availability.applicable_targets, 0);
        assert_eq!(availability.removable_targets, 3);
    }

    #[test]
    fn inspect_redaction_across_files_shows_apply_only_before_sync() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("source.md"),
            "Jane Doe emailed jane@example.com. Later Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            input_dir.join("target.md"),
            "The coordinator emailed support@example.com and then emailed billing@example.com.",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let target_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let selection_start = source_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        let before_apply = inspect_redaction_across_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![
                DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: target_preview.path.clone(),
                    input_path: target_preview.input_path.clone(),
                    output_path: target_preview.output_path.clone(),
                    audit_output_path: target_preview.audit_output_path.clone(),
                },
            ],
        })
        .unwrap();

        assert_eq!(before_apply.applicable_targets, 1);
        assert_eq!(before_apply.removable_targets, 1);

        let _applied = apply_redaction_to_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![DesktopPreviewArtifactRequest {
                path: target_preview.path.clone(),
                input_path: target_preview.input_path.clone(),
                output_path: target_preview.output_path.clone(),
                audit_output_path: target_preview.audit_output_path.clone(),
            }],
        })
        .unwrap();

        let after_apply = inspect_redaction_across_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![
                DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: target_preview.path.clone(),
                    input_path: target_preview.input_path.clone(),
                    output_path: target_preview.output_path.clone(),
                    audit_output_path: target_preview.audit_output_path.clone(),
                },
            ],
        })
        .unwrap();

        assert_eq!(after_apply.applicable_targets, 0);
        assert_eq!(after_apply.removable_targets, 2);
    }

    #[test]
    fn inspect_manual_redaction_reports_single_match_for_unique_selection() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("note.md"), "alpha beta gamma").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("beta").unwrap();
        let selection_end = selection_start + "beta".len();

        let availability = inspect_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        assert_eq!(availability.exact_match_count, 1);
    }

    #[test]
    fn inspect_manual_redaction_reports_multiple_matches_for_repeated_selection() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("note.md"), "beta gamma beta").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let selection_start = original_text.find("beta").unwrap();
        let selection_end = selection_start + "beta".len();

        let availability = inspect_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        assert_eq!(availability.exact_match_count, 2);
        assert!(!availability.mergeable);
    }

    #[test]
    fn inspect_manual_redaction_marks_overlapping_original_selection_as_mergeable() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("note.md"), "alpha beta gamma").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let beta_start = original_text.find("beta").unwrap();
        let beta_end = beta_start + "beta".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start,
            selection_end: beta_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let availability = inspect_manual_redaction(DesktopAddRedactionRequest {
            path: updated.preview.path.clone(),
            input_path: updated.preview.input_path.clone(),
            output_path: updated.preview.output_path.clone(),
            audit_output_path: updated.preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start.saturating_sub(1),
            selection_end: beta_end + 1,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        assert!(availability.mergeable);
        assert_eq!(availability.exact_match_count, 0);
    }

    #[test]
    fn merge_manual_redaction_can_expand_overlapping_selection() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("note.md"), "alpha beta gamma").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let beta_start = original_text.find("beta").unwrap();
        let beta_end = beta_start + "beta".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start,
            selection_end: beta_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let merged = merge_manual_redaction(DesktopAddRedactionRequest {
            path: updated.preview.path.clone(),
            input_path: updated.preview.input_path.clone(),
            output_path: updated.preview.output_path.clone(),
            audit_output_path: updated.preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start.saturating_sub(1),
            selection_end: beta_end + 1,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        assert!(merged
            .preview
            .original_html
            .as_ref()
            .is_some_and(|html| html.contains("Manual redaction 1")));
        assert!(fs::read_to_string(&preview.output_path)
            .unwrap()
            .contains("[MANUAL_REDACTION_1]"));
    }

    #[test]
    fn merge_manual_redaction_can_merge_multiple_overlapping_redactions() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("note.md"), "alpha beta gamma delta").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let beta_start = original_text.find("beta").unwrap();
        let beta_end = beta_start + "beta".len();
        let gamma_start = original_text.find("gamma").unwrap();
        let gamma_end = gamma_start + "gamma".len();

        let first = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start,
            selection_end: beta_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();
        let second = add_manual_redaction(DesktopAddRedactionRequest {
            path: first.preview.path.clone(),
            input_path: first.preview.input_path.clone(),
            output_path: first.preview.output_path.clone(),
            audit_output_path: first.preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: gamma_start,
            selection_end: gamma_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let merged = merge_manual_redaction(DesktopAddRedactionRequest {
            path: second.preview.path.clone(),
            input_path: second.preview.input_path.clone(),
            output_path: second.preview.output_path.clone(),
            audit_output_path: second.preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start,
            selection_end: gamma_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        assert_eq!(merged.replacements, 1);
        assert!(fs::read_to_string(&preview.output_path)
            .unwrap()
            .contains("alpha [MANUAL_REDACTION_1] delta"));
    }

    #[test]
    fn merge_manual_redaction_can_start_inside_redacted_preview_token() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("note.md"), "alpha beta gamma").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let preview = &result.file_previews[0];
        let original_text = load_preview_input_as_markdown(&preview.input_path).unwrap();
        let beta_start = original_text.find("beta").unwrap();
        let beta_end = beta_start + "beta".len();

        let updated = add_manual_redaction(DesktopAddRedactionRequest {
            path: preview.path.clone(),
            input_path: preview.input_path.clone(),
            output_path: preview.output_path.clone(),
            audit_output_path: preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: beta_start,
            selection_end: beta_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let redacted_text = fs::read_to_string(&preview.output_path).unwrap();
        let token_start = redacted_text.find("MANUAL_REDACTION_1").unwrap();
        let merge_start = token_start + 3;
        let merge_end = redacted_text.find(" gamma").unwrap();

        let merged = merge_manual_redaction(DesktopAddRedactionRequest {
            path: updated.preview.path.clone(),
            input_path: updated.preview.input_path.clone(),
            output_path: updated.preview.output_path.clone(),
            audit_output_path: updated.preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Redacted,
            selection_start: merge_start,
            selection_end: merge_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        assert!(fs::read_to_string(&preview.output_path)
            .unwrap()
            .contains("alpha [MANUAL_REDACTION_1]"));
        assert_eq!(merged.replacements, 1);
    }

    #[test]
    fn apply_redaction_to_all_files_can_fill_same_file_sibling_matches() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("source.md"),
            "Elm Hall appears twice: Elm Hall.",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let source_start = source_text.find("Elm Hall").unwrap();
        let source_end = source_start + "Elm Hall".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: source_start,
            selection_end: source_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let availability = inspect_redaction_across_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: source_start,
                end: source_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![DesktopPreviewArtifactRequest {
                path: updated_source.preview.path.clone(),
                input_path: updated_source.preview.input_path.clone(),
                output_path: updated_source.preview.output_path.clone(),
                audit_output_path: updated_source.preview.audit_output_path.clone(),
            }],
        })
        .unwrap();

        assert_eq!(availability.applicable_targets, 1);
        assert_eq!(availability.removable_targets, 0);

        let applied = apply_redaction_to_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: source_start,
                end: source_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![DesktopPreviewArtifactRequest {
                path: updated_source.preview.path.clone(),
                input_path: updated_source.preview.input_path.clone(),
                output_path: updated_source.preview.output_path.clone(),
                audit_output_path: updated_source.preview.audit_output_path.clone(),
            }],
        })
        .unwrap();

        assert_eq!(applied.updated_targets, 1);
        assert!(applied.updates[0].preview.redacted_html.contains("data-manual-number=\"2\""));
    }

    #[test]
    fn apply_redaction_to_all_files_matches_case_insensitively() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("source.md"), "john appears in the source file.").unwrap();
        fs::write(input_dir.join("target.md"), "JOHN appears in the target file.").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let target_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let source_start = source_text.find("john").unwrap();
        let source_end = source_start + "john".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: source_start,
            selection_end: source_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let applied = apply_redaction_to_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: source_start,
                end: source_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![DesktopPreviewArtifactRequest {
                path: target_preview.path.clone(),
                input_path: target_preview.input_path.clone(),
                output_path: target_preview.output_path.clone(),
                audit_output_path: target_preview.audit_output_path.clone(),
            }],
        })
        .unwrap();

        assert_eq!(applied.updated_targets, 1);
        assert!(fs::read_to_string(&target_preview.output_path)
            .unwrap()
            .contains("[MANUAL_REDACTION_1]"));
    }

    #[test]
    fn find_and_redact_term_updates_workspace_case_insensitively() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("a.md"), "John appeared here.").unwrap();
        fs::write(input_dir.join("b.md"), "Later, john appeared again.").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let applied = find_and_redact_term(DesktopFindAndRedactRequest {
            term: "john".to_string(),
            targets: result
                .file_previews
                .iter()
                .map(|preview| DesktopPreviewArtifactRequest {
                    path: preview.path.clone(),
                    input_path: preview.input_path.clone(),
                    output_path: preview.output_path.clone(),
                    audit_output_path: preview.audit_output_path.clone(),
                })
                .collect(),
        })
        .unwrap();

        assert_eq!(applied.updated_targets, 2);
        assert!(applied
            .updates
            .iter()
            .all(|update| update.preview.redacted_html.contains("[MANUAL_REDACTION_1]")));
    }

    #[test]
    fn remove_redaction_term_removes_matching_workspace_entries_case_insensitively() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(input_dir.join("a.md"), "John appeared here.").unwrap();
        fs::write(input_dir.join("b.md"), "Later, JOHN appeared again.").unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let applied = find_and_redact_term(DesktopFindAndRedactRequest {
            term: "john".to_string(),
            targets: result
                .file_previews
                .iter()
                .map(|preview| DesktopPreviewArtifactRequest {
                    path: preview.path.clone(),
                    input_path: preview.input_path.clone(),
                    output_path: preview.output_path.clone(),
                    audit_output_path: preview.audit_output_path.clone(),
                })
                .collect(),
        })
        .unwrap();

        let removed = remove_redaction_term(DesktopRemoveRedactionTermRequest {
            term: "JOHN".to_string(),
            targets: applied
                .updates
                .iter()
                .map(|update| DesktopPreviewArtifactRequest {
                    path: update.preview.path.clone(),
                    input_path: update.preview.input_path.clone(),
                    output_path: update.preview.output_path.clone(),
                    audit_output_path: update.preview.audit_output_path.clone(),
                })
                .collect(),
        })
        .unwrap();

        assert_eq!(removed.updated_targets, 2);
        assert!(removed
            .updates
            .iter()
            .all(|update| !update.preview.redacted_html.contains("[MANUAL_REDACTION_")));
    }

    #[test]
    fn remove_redaction_from_all_files_removes_propagated_matches_from_source_and_targets() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("source.md"),
            "Jane Doe emailed jane@example.com. Later Jane Doe emailed billing@example.com.",
        )
        .unwrap();
        fs::write(
            input_dir.join("target.md"),
            "The coordinator emailed support@example.com and then emailed billing@example.com.",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let target_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let selection_start = source_text.find("emailed").unwrap();
        let selection_end = selection_start + "emailed".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start,
            selection_end,
            redaction_scope: ManualRedactionScope::FileExactMatches,
        })
        .unwrap();

        let _initial_apply = apply_redaction_to_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![DesktopPreviewArtifactRequest {
                path: target_preview.path.clone(),
                input_path: target_preview.input_path.clone(),
                output_path: target_preview.output_path.clone(),
                audit_output_path: target_preview.audit_output_path.clone(),
            }],
        })
        .unwrap();

        let reconciled = remove_redaction_from_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: selection_start,
                end: selection_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![
                DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: target_preview.path.clone(),
                    input_path: target_preview.input_path.clone(),
                    output_path: target_preview.output_path.clone(),
                    audit_output_path: target_preview.audit_output_path.clone(),
                },
            ],
        })
        .unwrap();

        assert_eq!(reconciled.updated_targets, 2);
        assert_eq!(reconciled.unchanged_targets, 0);
        assert_eq!(reconciled.updates.len(), 2);
        assert!(reconciled
            .updates
            .iter()
            .all(|update| !update.preview.redacted_html.contains("[MANUAL_REDACTION_")));
        assert!(!fs::read_to_string(&target_preview.output_path)
            .unwrap()
            .contains("[MANUAL_REDACTION_"));
    }

    #[test]
    fn remove_redaction_from_all_files_removes_matching_existing_target_redactions() {
        let temp = tempdir().unwrap();
        let input_dir = temp.path().join("input");

        fs::create_dir_all(&input_dir).unwrap();
        fs::write(
            input_dir.join("source.md"),
            "School note: Elm Hall appears in the source file.",
        )
        .unwrap();
        fs::write(
            input_dir.join("target.md"),
            "Mailing note: Elm Hall appears in the target file.",
        )
        .unwrap();

        let result = run_replace_job(DesktopReplaceRequest {
            input: input_dir.clone(),
            config: None,
            settings: None,
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        })
        .unwrap();

        let source_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("source.md"))
            .unwrap();
        let target_preview = result
            .file_previews
            .iter()
            .find(|preview| preview.path == PathBuf::from("target.md"))
            .unwrap();
        let source_text = load_preview_input_as_markdown(&source_preview.input_path).unwrap();
        let source_start = source_text.find("Elm Hall").unwrap();
        let source_end = source_start + "Elm Hall".len();
        let target_text = load_preview_input_as_markdown(&target_preview.input_path).unwrap();
        let target_start = target_text.find("Elm Hall").unwrap();
        let target_end = target_start + "Elm Hall".len();

        let updated_source = add_manual_redaction(DesktopAddRedactionRequest {
            path: source_preview.path.clone(),
            input_path: source_preview.input_path.clone(),
            output_path: source_preview.output_path.clone(),
            audit_output_path: source_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: source_start,
            selection_end: source_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();
        let updated_target = add_manual_redaction(DesktopAddRedactionRequest {
            path: target_preview.path.clone(),
            input_path: target_preview.input_path.clone(),
            output_path: target_preview.output_path.clone(),
            audit_output_path: target_preview.audit_output_path.clone(),
            source_preview: PreviewSelectionSource::Original,
            selection_start: target_start,
            selection_end: target_end,
            redaction_scope: ManualRedactionScope::SingleOccurrence,
        })
        .unwrap();

        let reconciled = remove_redaction_from_all_files(DesktopRedactionAcrossFilesRequest {
            source: DesktopExistingRedactionRequest {
                preview: DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                start: source_start,
                end: source_end,
                replacement: "[MANUAL_REDACTION]".to_string(),
            },
            targets: vec![
                DesktopPreviewArtifactRequest {
                    path: updated_source.preview.path.clone(),
                    input_path: updated_source.preview.input_path.clone(),
                    output_path: updated_source.preview.output_path.clone(),
                    audit_output_path: updated_source.preview.audit_output_path.clone(),
                },
                DesktopPreviewArtifactRequest {
                    path: updated_target.preview.path.clone(),
                    input_path: updated_target.preview.input_path.clone(),
                    output_path: updated_target.preview.output_path.clone(),
                    audit_output_path: updated_target.preview.audit_output_path.clone(),
                },
            ],
        })
        .unwrap();

        assert_eq!(reconciled.updated_targets, 2);
        assert!(reconciled
            .updates
            .iter()
            .all(|update| !update.preview.redacted_html.contains("[MANUAL_REDACTION_")));
        assert!(fs::read_to_string(&updated_target.preview.output_path)
            .unwrap()
            .contains("Elm Hall"));
    }

    fn write_test_pdf(path: &std::path::Path, text: &str) {
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

    fn build_test_docx_bytes(document_xml: &str) -> Vec<u8> {
        let mut buffer = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("word/document.xml", options).unwrap();
        std::io::Write::write_all(&mut zip, document_xml.as_bytes()).unwrap();
        zip.finish().unwrap();
        buffer.into_inner()
    }
}
