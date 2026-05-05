use redact_core::{RecognizerResult, types::EntityType};
use regex::Regex;

use crate::audit::{Finding, FindingSource};

pub fn apply(input_text: &str, entities: &[RecognizerResult]) -> (String, Vec<Finding>) {
    let mut segments = collect_segments(input_text, entities);
    segments.sort_by_key(|segment| (segment.start(), std::cmp::Reverse(segment.len())));

    if segments.is_empty() {
        return (input_text.to_string(), Vec::new());
    }

    let mut output = String::with_capacity(input_text.len());
    let mut last_end = 0;
    let mut records = Vec::new();

    for segment in segments {
        if segment.start() < last_end || segment.end() > input_text.len() {
            continue;
        }

        if segment.start() > last_end {
            output.push_str(&input_text[last_end..segment.start()]);
        }

        let finding = segment.to_finding(input_text);

        output.push_str(&finding.replacement);
        records.push(finding);

        last_end = segment.end();
    }

    if last_end < input_text.len() {
        output.push_str(&input_text[last_end..]);
    }

    (output, records)
}

#[derive(Debug, Clone)]
enum Segment {
    Library(RecognizerResult),
    Custom(CustomSegment),
}

#[derive(Debug, Clone)]
struct CustomSegment {
    entity_type: String,
    matched_text: String,
    replacement: String,
    reason: String,
    start: usize,
    end: usize,
}

impl Segment {
    fn start(&self) -> usize {
        match self {
            Segment::Library(entity) => entity.start,
            Segment::Custom(segment) => segment.start,
        }
    }

    fn end(&self) -> usize {
        match self {
            Segment::Library(entity) => entity.end,
            Segment::Custom(segment) => segment.end,
        }
    }

    fn len(&self) -> usize {
        self.end() - self.start()
    }

    fn to_finding(&self, input_text: &str) -> Finding {
        match self {
            Segment::Library(entity) => {
                let matched_text = entity
                    .text
                    .clone()
                    .unwrap_or_else(|| input_text[entity.start..entity.end].to_string());
                let classified_entity_type =
                    classify_entity_type(input_text, entity, &matched_text);
                let replacement = replacement_for(&classified_entity_type, &matched_text);
                let reason =
                    classification_reason(&classified_entity_type, &entity.recognizer_name);
                let source = classify_source(
                    &classified_entity_type,
                    &replacement,
                    &entity.recognizer_name,
                );

                Finding {
                    source,
                    entity_type: classified_entity_type,
                    matched_text,
                    replacement,
                    reason,
                    score: Some(entity.score),
                    start: entity.start,
                    end: entity.end,
                }
            }
            Segment::Custom(segment) => Finding {
                source: FindingSource::Custom,
                entity_type: segment.entity_type.clone(),
                matched_text: segment.matched_text.clone(),
                replacement: segment.replacement.clone(),
                reason: segment.reason.clone(),
                score: None,
                start: segment.start,
                end: segment.end,
            },
        }
    }
}

fn collect_segments(input_text: &str, entities: &[RecognizerResult]) -> Vec<Segment> {
    let mut segments: Vec<Segment> = entities.iter().cloned().map(Segment::Library).collect();
    segments.extend(
        detect_custom_segments(input_text)
            .into_iter()
            .map(Segment::Custom),
    );
    segments
}

fn detect_custom_segments(input_text: &str) -> Vec<CustomSegment> {
    let mut segments = Vec::new();

    let labeled_client_regex = Regex::new(r"(?im)^(?:client|patient):\s*(?P<value>[^\r\n]+)")
        .expect("custom client label regex should compile");
    for captures in labeled_client_regex.captures_iter(input_text) {
        let Some(value) = captures.name("value") else {
            continue;
        };
        let text = value.as_str().trim().to_string();
        if text.is_empty() {
            continue;
        }
        segments.push(CustomSegment {
            entity_type: "CLIENT_NAME".to_string(),
            matched_text: text,
            replacement: "[CLIENT]".to_string(),
            reason: "custom labeled client field classification for psychology-specific context"
                .to_string(),
            start: value.start(),
            end: value.end(),
        });
    }

    let labeled_provider_regex = Regex::new(
        r"(?im)^(?:provider|examiner|clinician|therapist|psychologist):\s*(?P<value>[^\r\n]+)",
    )
    .expect("custom provider label regex should compile");
    for captures in labeled_provider_regex.captures_iter(input_text) {
        let Some(value) = captures.name("value") else {
            continue;
        };
        let text = value.as_str().trim().to_string();
        if text.is_empty() {
            continue;
        }
        segments.push(CustomSegment {
            entity_type: "PROVIDER_NAME".to_string(),
            matched_text: text,
            replacement: "[PROVIDER]".to_string(),
            reason: "custom labeled provider field classification for psychology-specific context"
                .to_string(),
            start: value.start(),
            end: value.end(),
        });
    }

    let labeled_family_regex = Regex::new(
        r"(?im)^(?:mother|father|parent|guardian|caregiver|spouse|sibling):\s*(?P<value>[^\r\n]+)",
    )
    .expect("custom family label regex should compile");
    for captures in labeled_family_regex.captures_iter(input_text) {
        let Some(value) = captures.name("value") else {
            continue;
        };
        let text = value.as_str().trim().to_string();
        if text.is_empty() {
            continue;
        }
        segments.push(CustomSegment {
            entity_type: "FAMILY_NAME".to_string(),
            matched_text: text,
            replacement: "[FAMILY_MEMBER]".to_string(),
            reason: "custom labeled family field classification for psychology-specific context"
                .to_string(),
            start: value.start(),
            end: value.end(),
        });
    }

    let labeled_institution_regex = Regex::new(
        r"(?im)^(?:school|clinic|hospital|institution|employer|workplace|university|college):\s*(?P<value>[^\r\n]+)",
    )
    .expect("custom institution label regex should compile");
    for captures in labeled_institution_regex.captures_iter(input_text) {
        let Some(value) = captures.name("value") else {
            continue;
        };
        let text = value.as_str().trim().to_string();
        if text.is_empty() {
            continue;
        }
        segments.push(CustomSegment {
            entity_type: "INSTITUTION_NAME".to_string(),
            matched_text: text,
            replacement: "[INSTITUTION]".to_string(),
            reason:
                "custom labeled institution field classification for psychology-specific context"
                    .to_string(),
            start: value.start(),
            end: value.end(),
        });
    }

    let address_regex = Regex::new(
        r"(?i)\b\d{1,5}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Z0-9][A-Za-z0-9.'-]*)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)(?:,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5})?\b",
    )
    .expect("custom address regex should compile");

    for matched in address_regex.find_iter(input_text) {
        let text = matched.as_str().to_string();
        segments.push(CustomSegment {
            entity_type: "ADDRESS".to_string(),
            matched_text: text,
            replacement: "[ADDRESS]".to_string(),
            reason: "custom address classification for sub-state geographic detail".to_string(),
            start: matched.start(),
            end: matched.end(),
        });
    }

    segments
}

fn classify_entity_type(
    input_text: &str,
    entity: &RecognizerResult,
    _matched_text: &str,
) -> String {
    if entity.entity_type == EntityType::PhoneNumber && looks_like_fax(input_text, entity.start) {
        return "FAX_NUMBER".to_string();
    }

    entity.entity_type.as_str().to_string()
}

fn replacement_for(entity_type: &str, matched_text: &str) -> String {
    match entity_type {
        "DATE_TIME" => {
            preserve_only_year(matched_text).unwrap_or_else(|| "[DATE_TIME]".to_string())
        }
        "AGE" => safe_harbor_age_replacement(matched_text).unwrap_or_else(|| "[AGE]".to_string()),
        "FAX_NUMBER" => "[FAX_NUMBER]".to_string(),
        _ => format!("[{entity_type}]"),
    }
}

fn classification_reason(entity_type: &str, recognizer_name: &str) -> String {
    match entity_type {
        "FAX_NUMBER" => format!(
            "custom fax classification layered on redact-core detection via {recognizer_name}"
        ),
        _ => format!("redact-core pattern detection via {recognizer_name}"),
    }
}

fn classify_source(entity_type: &str, replacement: &str, recognizer_name: &str) -> FindingSource {
    match entity_type {
        "FAX_NUMBER" => FindingSource::Custom,
        "DATE_TIME" if replacement != "[DATE_TIME]" => FindingSource::Policy,
        "AGE" if replacement != "[AGE]" => FindingSource::Policy,
        _ if recognizer_name.to_ascii_lowercase().contains("ner") => FindingSource::Ml,
        _ => FindingSource::RedactCore,
    }
}

fn looks_like_fax(input_text: &str, start: usize) -> bool {
    let context_start = start.saturating_sub(12);
    let context = input_text[context_start..start].to_ascii_lowercase();
    context.contains("fax")
}

fn preserve_only_year(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.len() >= 4 {
        let year = &trimmed[0..4];
        if year.chars().all(|ch| ch.is_ascii_digit()) {
            return Some(year.to_string());
        }
    }

    None
}

fn safe_harbor_age_replacement(text: &str) -> Option<String> {
    let digits: String = text.chars().filter(|ch| ch.is_ascii_digit()).collect();
    let age: u16 = digits.parse().ok()?;

    if age > 89 {
        Some("90 or older".to_string())
    } else {
        None
    }
}
