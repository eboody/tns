use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractionStatus {
    CleanText,
    NonTextOmissions,
    TextDegraded,
    TextDegradedWithNonTextOmissions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FindingSource {
    RedactCore,
    Policy,
    Configured,
    Custom,
    Ml,
}

impl FindingSource {
    pub fn summary_label(self) -> &'static str {
        match self {
            FindingSource::RedactCore => "redact-core",
            FindingSource::Policy => "policy",
            FindingSource::Configured => "configured",
            FindingSource::Custom => "custom",
            FindingSource::Ml => "ml",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Finding {
    pub source: FindingSource,
    pub entity_type: String,
    pub matched_text: String,
    pub replacement: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
    pub start: usize,
    pub end: usize,
}

impl Finding {
    pub fn into_audit_record(self) -> AuditRecord {
        AuditRecord {
            source: self.source,
            entity_type: self.entity_type,
            matched_text: self.matched_text,
            replacement: self.replacement,
            reason: self.reason,
            score: self.score,
            start: self.start,
            end: self.end,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditRecord {
    pub source: FindingSource,
    pub entity_type: String,
    pub matched_text: String,
    pub replacement: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditReport {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub review_flags: ReviewFlags,
    pub replacements: Vec<AuditRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewFlags {
    pub ml_active: bool,
    pub has_ml_findings: bool,
    pub non_text_omissions_detected: bool,
    pub text_degraded_detected: bool,
    pub extraction_status: ExtractionStatus,
    pub residual_review_gaps: Vec<String>,
}

impl AuditReport {
    pub fn new(
        input_path: PathBuf,
        output_path: PathBuf,
        findings: Vec<Finding>,
        review_flags: ReviewFlags,
    ) -> Self {
        Self {
            input_path,
            output_path,
            review_flags,
            replacements: findings
                .into_iter()
                .map(Finding::into_audit_record)
                .collect(),
        }
    }
}
