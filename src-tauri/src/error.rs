use std::fmt;
use std::io;
use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    ReadFile {
        path: PathBuf,
        source: io::Error,
    },
    WriteFile {
        path: PathBuf,
        source: io::Error,
    },
    CreateDirectory {
        path: PathBuf,
        source: io::Error,
    },
    ParseConfig(toml::de::Error),
    InvalidConfig(String),
    InvalidPattern {
        pattern: String,
        source: regex::Error,
    },
    NerInitialization(String),
    Analysis(String),
    UnsupportedInputFormat(PathBuf),
    UnsafeOutputPath(PathBuf),
    SerializeAuditReport(serde_json::Error),
    InvalidPreviewEdit(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::ReadFile { path, source } => {
                write!(f, "failed to read {}: {source}", path.display())
            }
            AppError::WriteFile { path, source } => {
                write!(f, "failed to write {}: {source}", path.display())
            }
            AppError::CreateDirectory { path, source } => {
                write!(f, "failed to create directory {}: {source}", path.display())
            }
            AppError::ParseConfig(source) => write!(f, "failed to parse config: {source}"),
            AppError::InvalidConfig(message) => write!(f, "invalid config: {message}"),
            AppError::InvalidPattern { pattern, source } => {
                write!(f, "invalid replacement pattern `{pattern}`: {source}")
            }
            AppError::NerInitialization(message) => {
                write!(f, "failed to initialize NER: {message}")
            }
            AppError::Analysis(message) => write!(f, "analysis failed: {message}"),
            AppError::UnsupportedInputFormat(path) => write!(
                f,
                "unsupported input format for {}: current exact-entity slices support Markdown and plain text files only",
                path.display()
            ),
            AppError::UnsafeOutputPath(path) => write!(
                f,
                "refusing to overwrite input file; choose a separate output path instead: {}",
                path.display()
            ),
            AppError::SerializeAuditReport(source) => {
                write!(f, "failed to serialize audit report: {source}")
            }
            AppError::InvalidPreviewEdit(message) => write!(f, "invalid preview edit: {message}"),
        }
    }
}

impl std::error::Error for AppError {}
