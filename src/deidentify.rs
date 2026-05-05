use regex::{Captures, Regex};

use crate::audit::{Finding, FindingSource};
use crate::config::Config;
use crate::error::{AppError, Result};

#[derive(Debug, Clone)]
pub struct ReplacementRule {
    pub entity_type: String,
    pub variant: String,
    pub replacement: String,
    pub reason: String,
    pub regex: Regex,
}

#[derive(Debug, Clone)]
pub struct DeidentifyResult {
    pub text: String,
    pub findings: Vec<Finding>,
}

pub fn build_rules(config: &Config) -> Result<Vec<ReplacementRule>> {
    let mut rules = Vec::new();

    for entity in config.entity_rule_configs() {
        let mut variants = entity.variants;
        variants.sort_by_key(|variant| std::cmp::Reverse(variant.len()));
        variants.dedup();

        for variant in variants {
            let escaped = regex::escape(&variant);
            let pattern = format!(r"(?m)(^|[^[:alnum:]_])({escaped})([^[:alnum:]_]|$)");
            let regex = Regex::new(&pattern)
                .map_err(|source| AppError::InvalidPattern { pattern, source })?;

            rules.push(ReplacementRule {
                entity_type: entity.entity_type.clone(),
                variant,
                replacement: entity.replacement.clone(),
                reason: format!("configured {} variant exact match", entity.entity_type),
                regex,
            });
        }
    }

    for pattern_rule in config.pattern_rule_definitions() {
        let entity_type = pattern_rule.entity_type.clone();
        let pattern = format!(
            r"(?im)(^|[^[:alnum:]_])({})([^[:alnum:]_]|$)",
            pattern_rule.pattern
        );
        let regex =
            Regex::new(&pattern).map_err(|source| AppError::InvalidPattern { pattern, source })?;

        rules.push(ReplacementRule {
            entity_type: entity_type.clone(),
            variant: "<pattern>".into(),
            replacement: pattern_rule.replacement,
            reason: format!("configured {entity_type} pattern match"),
            regex,
        });
    }

    Ok(rules)
}

pub fn apply_rules(input: &str, rules: &[ReplacementRule]) -> DeidentifyResult {
    let mut current = input.to_string();
    let mut records = Vec::new();

    for rule in rules {
        let replacement = rule.replacement.clone();
        let variant = rule.variant.clone();
        let entity_type = rule.entity_type.clone();
        let reason = rule.reason.clone();

        current = rule
            .regex
            .replace_all(&current, |captures: &Captures| {
                let prefix = captures.get(1).map(|m| m.as_str()).unwrap_or("");
                let matched = captures.get(2).expect("configured match group");
                let suffix = captures.get(3).map(|m| m.as_str()).unwrap_or("");

                records.push(Finding {
                    source: FindingSource::Configured,
                    entity_type: entity_type.clone(),
                    matched_text: matched.as_str().to_string(),
                    replacement: replacement.clone(),
                    reason: reason.clone(),
                    start: matched.start(),
                    end: matched.end(),
                });

                format!("{prefix}{replacement}{suffix}")
            })
            .into_owned();

        records.sort_by_key(|record| (record.start, record.end));

        // If a shorter alias would target the replacement token itself, preserve the already-redacted value.
        if variant == replacement {
            continue;
        }
    }

    DeidentifyResult {
        text: current,
        findings: records,
    }
}

#[cfg(test)]
mod tests {
    use crate::config::{
        ClientConfig, Config, ExactEntityConfig, PatternConfig, PatternRuleConfig,
    };

    use super::{apply_rules, build_rules};

    #[test]
    fn apply_rules_replaces_variants_without_touching_embedded_words() {
        let config = Config {
            client: ClientConfig {
                replacement: "CLIENT".into(),
                variants: vec!["Jane Doe".into(), "Jane".into()],
            },
            exact_entities: vec![],
            patterns: Default::default(),
            ner: None,
        };

        let rules = build_rules(&config).unwrap();
        let result = apply_rules("Jane Doe met Jane. Janet stayed.", &rules);

        assert_eq!(result.text, "CLIENT met CLIENT. Janet stayed.");
        assert_eq!(result.findings.len(), 2);
    }

    #[test]
    fn apply_rules_replaces_multiple_exact_entity_classes() {
        let config = Config {
            client: ClientConfig {
                replacement: "CLIENT".into(),
                variants: vec!["Jane Doe".into()],
            },
            exact_entities: vec![
                ExactEntityConfig {
                    entity_type: "provider".into(),
                    replacement: "PROVIDER_1".into(),
                    variants: vec!["Dr. Smith".into()],
                },
                ExactEntityConfig {
                    entity_type: "institution".into(),
                    replacement: "UNIVERSITY".into(),
                    variants: vec!["USC".into()],
                },
            ],
            patterns: Default::default(),
            ner: None,
        };

        let rules = build_rules(&config).unwrap();
        let result = apply_rules("Jane Doe met Dr. Smith at USC.", &rules);

        assert_eq!(result.text, "CLIENT met PROVIDER_1 at UNIVERSITY.");
        assert_eq!(result.findings.len(), 3);
        assert_eq!(result.findings[1].entity_type, "provider");
        assert_eq!(result.findings[2].entity_type, "institution");
    }

    #[test]
    fn apply_rules_replaces_enabled_pattern_entities() {
        let config = Config {
            client: ClientConfig {
                replacement: "CLIENT".into(),
                variants: vec!["Jane Doe".into()],
            },
            exact_entities: vec![],
            patterns: PatternConfig {
                dates: Some(PatternRuleConfig {
                    enabled: true,
                    replacement: "DATE".into(),
                }),
                emails: Some(PatternRuleConfig {
                    enabled: true,
                    replacement: "EMAIL".into(),
                }),
                phones: Some(PatternRuleConfig {
                    enabled: true,
                    replacement: "PHONE".into(),
                }),
            },
            ner: None,
        };

        let rules = build_rules(&config).unwrap();
        let result = apply_rules(
            "Reach Jane Doe on 01/02/2003 at jane@example.com or 310-555-1212.",
            &rules,
        );

        assert_eq!(result.text, "Reach CLIENT on DATE at EMAIL or PHONE.");
        assert_eq!(result.findings.len(), 4);
        assert_eq!(result.findings[1].entity_type, "date");
        assert_eq!(result.findings[2].entity_type, "email");
        assert_eq!(result.findings[3].entity_type, "phone");
    }
}
