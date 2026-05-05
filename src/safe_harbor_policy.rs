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
    let mut segments: Vec<Segment> = entities
        .iter()
        .filter(|entity| should_keep_library_entity(input_text, entity))
        .cloned()
        .map(Segment::Library)
        .collect();
    segments.extend(
        detect_custom_segments(input_text)
            .into_iter()
            .map(Segment::Custom),
    );
    segments
}

fn detect_custom_segments(input_text: &str) -> Vec<CustomSegment> {
    let mut segments = Vec::new();
    let has_line_breaks = input_text.contains(['\n', '\r']);

    if !has_line_breaks {
        push_labeled_segments(
            &mut segments,
            input_text,
            &["student"],
            transcript_label_terminators(),
            "STUDENT_NAME",
            "[STUDENT]",
            "custom labeled student field classification for transcript-style context",
        );

        push_labeled_segments(
            &mut segments,
            input_text,
            &["school"],
            transcript_label_terminators(),
            "INSTITUTION_NAME",
            "[INSTITUTION]",
            "custom labeled school field classification for transcript-style context",
        );

        push_labeled_segments(
            &mut segments,
            input_text,
            &["school address", "street address", "city/state/zip"],
            transcript_label_terminators(),
            "ADDRESS",
            "[ADDRESS]",
            "custom labeled address field classification for transcript-style context",
        );

        push_labeled_segments(
            &mut segments,
            input_text,
            &["phone"],
            transcript_label_terminators(),
            "PHONE_NUMBER",
            "[PHONE_NUMBER]",
            "custom labeled phone field classification for transcript-style context",
        );

        push_labeled_segments(
            &mut segments,
            input_text,
            &["date of birth"],
            transcript_label_terminators(),
            "DATE_OF_BIRTH",
            "[DATE_OF_BIRTH]",
            "custom labeled date-of-birth field classification for transcript-style context",
        );

        push_labeled_segments(
            &mut segments,
            input_text,
            &["place of birth"],
            transcript_label_terminators(),
            "BIRTH_PLACE",
            "[BIRTH_PLACE]",
            "custom labeled place-of-birth field classification for transcript-style context",
        );

        push_labeled_segments(
            &mut segments,
            input_text,
            &["certified by"],
            transcript_label_terminators(),
            "CERTIFIER_NAME",
            "[CERTIFIER]",
            "custom labeled certifier field classification for transcript-style context",
        );
    }

    if has_line_breaks {
        let labeled_name_regex = Regex::new(r"(?im)^(?:name):\s*(?P<value>[^\r\n]+)")
            .expect("custom report name regex should compile");
        for captures in labeled_name_regex.captures_iter(input_text) {
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
                reason: "custom labeled report name classification".to_string(),
                start: value.start(),
                end: value.end(),
            });
        }

        let labeled_referral_source_regex =
            Regex::new(r"(?im)^(?:referral source):\s*(?P<value>[^\r\n]+)")
                .expect("custom referral source regex should compile");
        for captures in labeled_referral_source_regex.captures_iter(input_text) {
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
                reason: "custom labeled referral source classification".to_string(),
                start: value.start(),
                end: value.end(),
            });
        }

        let labeled_date_regex = Regex::new(
            r"(?im)^(?:date of birth|evaluation date\(s\)|evaluation dates|reportdate|report date):\s*(?P<value>[^\r\n]+)",
        )
        .expect("custom labeled report date regex should compile");
        for captures in labeled_date_regex.captures_iter(input_text) {
            let Some(value) = captures.name("value") else {
                continue;
            };
            let text = value.as_str().trim().to_string();
            if text.is_empty() {
                continue;
            }
            let full_match = captures
                .get(0)
                .expect("regex should provide a full match")
                .as_str()
                .to_ascii_lowercase();
            let (entity_type, replacement) = if full_match.starts_with("date of birth:") {
                ("DATE_OF_BIRTH", "[DATE_OF_BIRTH]")
            } else {
                ("DATE_TIME", "[DATE_TIME]")
            };

            segments.push(CustomSegment {
                entity_type: entity_type.to_string(),
                matched_text: text,
                replacement: replacement.to_string(),
                reason: "custom labeled report date classification".to_string(),
                start: value.start(),
                end: value.end(),
            });
        }

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
                reason:
                    "custom labeled client field classification for psychology-specific context"
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
                reason:
                    "custom labeled provider field classification for psychology-specific context"
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
                reason:
                    "custom labeled family field classification for psychology-specific context"
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
    }

    segments.extend(propagate_custom_exact_matches(input_text, &segments));

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

fn should_keep_library_entity(input_text: &str, entity: &RecognizerResult) -> bool {
    let matched_text = entity
        .text
        .clone()
        .unwrap_or_else(|| input_text[entity.start..entity.end].to_string());

    match entity.entity_type.as_str() {
        "DOMAIN_NAME" => looks_like_real_domain(&matched_text),
        _ => true,
    }
}

fn looks_like_real_domain(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.chars().any(|ch| ch.is_whitespace()) {
        return false;
    }
    if trimmed
        .chars()
        .any(|ch| !(ch.is_ascii_alphanumeric() || ch == '.' || ch == '-'))
    {
        return false;
    }
    if trimmed.chars().any(|ch| ch.is_ascii_uppercase()) {
        return false;
    }

    let mut labels = trimmed.split('.');
    let Some(tld) = labels.next_back() else {
        return false;
    };
    if tld.len() < 2 || tld.len() > 10 || !tld.chars().all(|ch| ch.is_ascii_lowercase()) {
        return false;
    }

    labels.any(|label| !label.is_empty())
}

fn propagate_custom_exact_matches(input_text: &str, seeds: &[CustomSegment]) -> Vec<CustomSegment> {
    let mut propagated = Vec::new();

    for seed in seeds.iter().filter(|seed| {
        matches!(
            seed.entity_type.as_str(),
            "CLIENT_NAME"
                | "PROVIDER_NAME"
                | "FAMILY_NAME"
                | "INSTITUTION_NAME"
                | "STUDENT_NAME"
                | "CERTIFIER_NAME"
                | "BIRTH_PLACE"
                | "DATE_OF_BIRTH"
        )
    }) {
        let mut search_from = 0usize;
        while let Some(relative_start) = input_text[search_from..].find(&seed.matched_text) {
            let start = search_from + relative_start;
            let end = start + seed.matched_text.len();
            if start != seed.start {
                propagated.push(CustomSegment {
                    start,
                    end,
                    ..seed.clone()
                });
            }
            search_from = end;
        }
    }

    propagated
}

fn push_labeled_segments(
    segments: &mut Vec<CustomSegment>,
    input_text: &str,
    labels: &[&str],
    terminators: &[&str],
    entity_type: &str,
    replacement: &str,
    reason: &str,
) {
    let lowercase = input_text.to_ascii_lowercase();

    for label in labels {
        let marker = format!("{label}:");
        let marker = marker.to_ascii_lowercase();
        let mut search_from = 0usize;

        while let Some(relative_start) = lowercase[search_from..].find(&marker) {
            let label_start = search_from + relative_start;
            let value_start = label_start + marker.len();
            let value_end = next_terminator_index(&lowercase, value_start, terminators)
                .unwrap_or(input_text.len());

            let raw_value = &input_text[value_start..value_end];
            let trimmed = raw_value.trim();
            if !trimmed.is_empty() {
                let leading_ws = raw_value.len() - raw_value.trim_start().len();
                let trailing_ws = raw_value.len() - raw_value.trim_end().len();
                segments.push(CustomSegment {
                    entity_type: entity_type.to_string(),
                    matched_text: trimmed.to_string(),
                    replacement: replacement.to_string(),
                    reason: reason.to_string(),
                    start: value_start + leading_ws,
                    end: value_end - trailing_ws,
                });
            }

            search_from = value_start;
        }
    }
}

fn next_terminator_index(
    input_text: &str,
    search_from: usize,
    terminators: &[&str],
) -> Option<usize> {
    terminators
        .iter()
        .filter_map(|label| {
            let marker = format!("{label}:").to_ascii_lowercase();
            input_text[search_from..]
                .find(&marker)
                .map(|relative| search_from + relative)
        })
        .min()
}

fn transcript_label_terminators() -> &'static [&'static str] {
    &[
        "school",
        "school address",
        "student",
        "street address",
        "city/state/zip",
        "phone",
        "date of birth",
        "place of birth",
        "gender",
        "graduated",
        "credits earned",
        "gpa",
        "unweighted gpa",
        "class record",
        "course record",
        "exams / tests",
        "activities / honors",
        "certified by",
        "notes",
    ]
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
