use crate::{
    error::{AppError, Result},
    extraction::{ExtractionStrategy, extraction_strategy_label},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtractionAttemptStatus {
    Succeeded,
    Empty,
    Failed,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractionAttemptRecord {
    pub strategy: ExtractionStrategy,
    pub status: ExtractionAttemptStatus,
    pub detail: Option<String>,
}

impl ExtractionAttemptRecord {
    pub fn succeeded(strategy: ExtractionStrategy) -> Self {
        Self {
            strategy,
            status: ExtractionAttemptStatus::Succeeded,
            detail: None,
        }
    }
}

#[derive(Debug, Clone)]
pub enum ExtractionAttempt<T> {
    Extracted {
        strategy: ExtractionStrategy,
        value: T,
    },
    Empty {
        strategy: ExtractionStrategy,
        detail: Option<String>,
    },
    Failed {
        strategy: ExtractionStrategy,
        detail: String,
    },
    Unavailable {
        strategy: ExtractionStrategy,
        detail: Option<String>,
    },
}

impl<T> ExtractionAttempt<T> {
    pub fn extracted(strategy: ExtractionStrategy, value: T) -> Self {
        Self::Extracted { strategy, value }
    }

    pub fn empty(strategy: ExtractionStrategy, detail: impl Into<Option<String>>) -> Self {
        Self::Empty {
            strategy,
            detail: detail.into(),
        }
    }

    pub fn failed(strategy: ExtractionStrategy, detail: impl Into<String>) -> Self {
        Self::Failed {
            strategy,
            detail: detail.into(),
        }
    }

    pub fn unavailable(strategy: ExtractionStrategy, detail: impl Into<Option<String>>) -> Self {
        Self::Unavailable {
            strategy,
            detail: detail.into(),
        }
    }

    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> ExtractionAttempt<U> {
        match self {
            ExtractionAttempt::Extracted { strategy, value } => ExtractionAttempt::Extracted {
                strategy,
                value: f(value),
            },
            ExtractionAttempt::Empty { strategy, detail } => {
                ExtractionAttempt::Empty { strategy, detail }
            }
            ExtractionAttempt::Failed { strategy, detail } => {
                ExtractionAttempt::Failed { strategy, detail }
            }
            ExtractionAttempt::Unavailable { strategy, detail } => {
                ExtractionAttempt::Unavailable { strategy, detail }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct SelectedExtraction<T> {
    pub strategy: ExtractionStrategy,
    pub value: T,
    pub attempts: Vec<ExtractionAttemptRecord>,
}

pub fn select_first_success<T>(
    attempts: impl IntoIterator<Item = ExtractionAttempt<T>>,
    exhausted_message: &str,
) -> Result<SelectedExtraction<T>> {
    let mut attempt_records = Vec::new();

    for attempt in attempts {
        match attempt {
            ExtractionAttempt::Extracted { strategy, value } => {
                attempt_records.push(ExtractionAttemptRecord::succeeded(strategy));
                return Ok(SelectedExtraction {
                    strategy,
                    value,
                    attempts: attempt_records,
                });
            }
            ExtractionAttempt::Empty { strategy, detail } => {
                attempt_records.push(ExtractionAttemptRecord {
                    strategy,
                    status: ExtractionAttemptStatus::Empty,
                    detail,
                });
            }
            ExtractionAttempt::Failed { strategy, detail } => {
                attempt_records.push(ExtractionAttemptRecord {
                    strategy,
                    status: ExtractionAttemptStatus::Failed,
                    detail: Some(detail),
                });
            }
            ExtractionAttempt::Unavailable { strategy, detail } => {
                attempt_records.push(ExtractionAttemptRecord {
                    strategy,
                    status: ExtractionAttemptStatus::Unavailable,
                    detail,
                });
            }
        }
    }

    let details = attempt_records
        .iter()
        .map(|record| match &record.detail {
            Some(detail) => format!("{}: {}", extraction_strategy_label(record.strategy), detail),
            None => format!(
                "{}: {}",
                extraction_strategy_label(record.strategy),
                extraction_attempt_status_label(record.status)
            ),
        })
        .collect::<Vec<_>>();

    let suffix = if details.is_empty() {
        String::new()
    } else {
        format!(" ({})", details.join("; "))
    };

    Err(AppError::Analysis(format!("{exhausted_message}{suffix}")))
}

fn extraction_attempt_status_label(status: ExtractionAttemptStatus) -> &'static str {
    match status {
        ExtractionAttemptStatus::Succeeded => "succeeded",
        ExtractionAttemptStatus::Empty => "no text extracted",
        ExtractionAttemptStatus::Failed => "failed",
        ExtractionAttemptStatus::Unavailable => "tool unavailable",
    }
}

#[cfg(test)]
mod tests {
    use super::{ExtractionAttempt, ExtractionAttemptStatus, select_first_success};
    use crate::extraction::ExtractionStrategy;

    #[test]
    fn select_first_success_returns_first_successful_attempt() {
        let selected = select_first_success(
            [
                ExtractionAttempt::empty(ExtractionStrategy::PdfLopdf, Some("no text".to_string())),
                ExtractionAttempt::extracted(ExtractionStrategy::PdfPdftotext, "hello".to_string()),
            ],
            "no extraction strategies succeeded",
        )
        .unwrap();

        assert_eq!(selected.strategy, ExtractionStrategy::PdfPdftotext);
        assert_eq!(selected.value, "hello");
        assert_eq!(selected.attempts.len(), 2);
        assert_eq!(selected.attempts[0].status, ExtractionAttemptStatus::Empty);
        assert_eq!(
            selected.attempts[1].status,
            ExtractionAttemptStatus::Succeeded
        );
    }

    #[test]
    fn select_first_success_reports_attempt_details_when_exhausted() {
        let error = select_first_success::<String>(
            [
                ExtractionAttempt::failed(
                    ExtractionStrategy::PdfLopdf,
                    "failed to extract PDF text: broken xref",
                ),
                ExtractionAttempt::unavailable(
                    ExtractionStrategy::PdfPdftotext,
                    Some("pdftotext not installed".to_string()),
                ),
            ],
            "PDF contains no extractable text; treat as non-extractable or low-confidence",
        )
        .unwrap_err();

        let message = error.to_string();
        assert!(message.contains("PDF contains no extractable text"));
        assert!(message.contains("pdf_lopdf: failed to extract PDF text: broken xref"));
        assert!(message.contains("pdf_pdftotext: pdftotext not installed"));
    }
}
