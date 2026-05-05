use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub client: ClientConfig,
    #[serde(default)]
    pub exact_entities: Vec<ExactEntityConfig>,
    #[serde(default)]
    pub patterns: PatternConfig,
    #[serde(default)]
    pub ner: Option<NerConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientConfig {
    pub replacement: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExactEntityConfig {
    pub entity_type: String,
    pub replacement: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct EntityRuleConfig {
    pub entity_type: String,
    pub replacement: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PatternConfig {
    pub dates: Option<PatternRuleConfig>,
    pub emails: Option<PatternRuleConfig>,
    pub phones: Option<PatternRuleConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PatternRuleConfig {
    pub enabled: bool,
    pub replacement: String,
}

#[derive(Debug, Clone)]
pub struct PatternRuleDefinition {
    pub entity_type: String,
    pub replacement: String,
    pub pattern: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NerConfig {
    pub enabled: bool,
    pub model_path: PathBuf,
    pub tokenizer_path: Option<PathBuf>,
    #[serde(default = "default_ner_min_confidence")]
    pub min_confidence: f32,
}

impl Config {
    pub fn from_path(path: &Path) -> Result<Self> {
        let raw = fs::read_to_string(path).map_err(|source| AppError::ReadFile {
            path: PathBuf::from(path),
            source,
        })?;

        let config: Config = toml::from_str(&raw).map_err(AppError::ParseConfig)?;

        validate_entity(
            "client",
            &config.client.replacement,
            &config.client.variants,
        )?;

        for entity in &config.exact_entities {
            validate_entity(&entity.entity_type, &entity.replacement, &entity.variants)?;
        }

        validate_pattern_rule("date", config.patterns.dates.as_ref())?;
        validate_pattern_rule("email", config.patterns.emails.as_ref())?;
        validate_pattern_rule("phone", config.patterns.phones.as_ref())?;
        validate_ner_config(config.ner.as_ref())?;

        Ok(config)
    }

    pub fn entity_rule_configs(&self) -> Vec<EntityRuleConfig> {
        let mut entities = vec![EntityRuleConfig {
            entity_type: "client".into(),
            replacement: self.client.replacement.clone(),
            variants: self.client.variants.clone(),
        }];

        entities.extend(self.exact_entities.iter().map(|entity| EntityRuleConfig {
            entity_type: entity.entity_type.clone(),
            replacement: entity.replacement.clone(),
            variants: entity.variants.clone(),
        }));

        entities
    }

    pub fn pattern_rule_definitions(&self) -> Vec<PatternRuleDefinition> {
        let mut definitions = Vec::new();

        if let Some(rule) = self.patterns.dates.as_ref().filter(|rule| rule.enabled) {
            definitions.push(PatternRuleDefinition {
                entity_type: "date".into(),
                replacement: rule.replacement.clone(),
                pattern: r"(?:\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4})".into(),
            });
        }

        if let Some(rule) = self.patterns.emails.as_ref().filter(|rule| rule.enabled) {
            definitions.push(PatternRuleDefinition {
                entity_type: "email".into(),
                replacement: rule.replacement.clone(),
                pattern: r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}".into(),
            });
        }

        if let Some(rule) = self.patterns.phones.as_ref().filter(|rule| rule.enabled) {
            definitions.push(PatternRuleDefinition {
                entity_type: "phone".into(),
                replacement: rule.replacement.clone(),
                pattern: r"(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}".into(),
            });
        }

        definitions
    }
}

fn default_ner_min_confidence() -> f32 {
    0.7
}

fn validate_entity(entity_type: &str, replacement: &str, variants: &[String]) -> Result<()> {
    if entity_type.trim().is_empty() {
        return Err(AppError::InvalidConfig(
            "exact entity type must not be empty".into(),
        ));
    }

    if replacement.trim().is_empty() {
        return Err(AppError::InvalidConfig(format!(
            "{entity_type}.replacement must not be empty"
        )));
    }

    if variants.is_empty() {
        return Err(AppError::InvalidConfig(format!(
            "{entity_type}.variants must include at least one configured variant"
        )));
    }

    Ok(())
}

fn validate_pattern_rule(entity_type: &str, rule: Option<&PatternRuleConfig>) -> Result<()> {
    let Some(rule) = rule else {
        return Ok(());
    };

    if rule.enabled && rule.replacement.trim().is_empty() {
        return Err(AppError::InvalidConfig(format!(
            "pattern {entity_type} replacement must not be empty when enabled"
        )));
    }

    Ok(())
}

fn validate_ner_config(rule: Option<&NerConfig>) -> Result<()> {
    let Some(rule) = rule else {
        return Ok(());
    };

    if !rule.enabled {
        return Ok(());
    }

    if rule.model_path.as_os_str().is_empty() {
        return Err(AppError::InvalidConfig(
            "ner.model_path must not be empty when ner is enabled".into(),
        ));
    }

    if !(0.0..=1.0).contains(&rule.min_confidence) {
        return Err(AppError::InvalidConfig(
            "ner.min_confidence must be between 0.0 and 1.0".into(),
        ));
    }

    Ok(())
}
