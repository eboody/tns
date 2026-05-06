use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Config {
    #[serde(default)]
    pub client: Option<ClientConfig>,
    #[serde(default)]
    pub exact_entities: Vec<ExactEntityConfig>,
    #[serde(default)]
    pub patterns: PatternConfig,
    #[serde(default)]
    pub ner: Option<NerConfig>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct DeidProfileConfig {
    #[serde(default)]
    pub patterns: PatternConfig,
    #[serde(default)]
    pub ner: Option<NerConfig>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct CaseContextConfig {
    #[serde(default)]
    pub client: Option<ClientConfig>,
    #[serde(default)]
    pub exact_entities: Vec<ExactEntityConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ClientConfig {
    pub replacement: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
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

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct PatternConfig {
    pub dates: Option<PatternRuleConfig>,
    pub emails: Option<PatternRuleConfig>,
    pub phones: Option<PatternRuleConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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

        config.validate()?;

        Ok(config)
    }

    pub fn validate(&self) -> Result<()> {
        if let Some(client) = self.client.as_ref() {
            validate_entity("client", &client.replacement, &client.variants)?;
        }

        for entity in &self.exact_entities {
            validate_entity(&entity.entity_type, &entity.replacement, &entity.variants)?;
        }

        validate_pattern_rule("date", self.patterns.dates.as_ref())?;
        validate_pattern_rule("email", self.patterns.emails.as_ref())?;
        validate_pattern_rule("phone", self.patterns.phones.as_ref())?;
        validate_ner_config(self.ner.as_ref())?;

        Ok(())
    }

    pub fn from_profile_and_case_context(
        profile: DeidProfileConfig,
        case_context: CaseContextConfig,
    ) -> Self {
        Self {
            client: case_context.client,
            exact_entities: case_context.exact_entities,
            patterns: profile.patterns,
            ner: profile.ner,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.client.is_none()
            && self.exact_entities.is_empty()
            && self.patterns.dates.is_none()
            && self.patterns.emails.is_none()
            && self.patterns.phones.is_none()
            && self.ner.is_none()
    }

    pub fn entity_rule_configs(&self) -> Vec<EntityRuleConfig> {
        let mut entities = Vec::new();

        if let Some(client) = self.client.as_ref() {
            entities.push(EntityRuleConfig {
                entity_type: "client".into(),
                replacement: client.replacement.clone(),
                variants: client.variants.clone(),
            });
        }

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

#[cfg(test)]
mod tests {
    use super::{
        CaseContextConfig, ClientConfig, Config, DeidProfileConfig, ExactEntityConfig, NerConfig,
        PatternConfig, PatternRuleConfig,
    };
    use std::path::PathBuf;

    #[test]
    fn config_composes_profile_and_case_context_into_effective_runtime_config() {
        let profile = DeidProfileConfig {
            patterns: PatternConfig {
                dates: Some(PatternRuleConfig {
                    enabled: true,
                    replacement: "[DATE]".into(),
                }),
                emails: None,
                phones: Some(PatternRuleConfig {
                    enabled: true,
                    replacement: "[PHONE]".into(),
                }),
            },
            ner: Some(NerConfig {
                enabled: true,
                model_path: PathBuf::from("/tmp/model.onnx"),
                tokenizer_path: Some(PathBuf::from("/tmp/tokenizer.json")),
                min_confidence: 0.82,
            }),
        };
        let case_context = CaseContextConfig {
            client: Some(ClientConfig {
                replacement: "CLIENT".into(),
                variants: vec!["Jane Doe".into()],
            }),
            exact_entities: vec![ExactEntityConfig {
                entity_type: "provider".into(),
                replacement: "[PROVIDER]".into(),
                variants: vec!["Dr. Smith".into()],
            }],
        };

        let config = Config::from_profile_and_case_context(profile, case_context);

        assert_eq!(config.client.as_ref().map(|client| client.replacement.as_str()), Some("CLIENT"));
        assert_eq!(config.exact_entities.len(), 1);
        assert_eq!(config.patterns.dates.as_ref().map(|rule| rule.replacement.as_str()), Some("[DATE]"));
        assert_eq!(config.patterns.phones.as_ref().map(|rule| rule.replacement.as_str()), Some("[PHONE]"));
        assert_eq!(config.ner.as_ref().map(|ner| ner.min_confidence), Some(0.82));
        config.validate().unwrap();
        assert!(!config.is_empty());
    }
}
