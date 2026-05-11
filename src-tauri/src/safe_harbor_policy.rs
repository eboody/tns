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
        push_regex_segments(
            &mut segments,
            input_text,
            r"(?im)^(?:full name|name of person filling out this form|name):\s*(?P<value>[^\r\n]+)$",
            "CLIENT_NAME",
            "[CLIENT]",
            "custom labeled intake name classification",
        );
        push_regex_segments(
            &mut segments,
            input_text,
            r"(?im)^(?:phone|teacher'?s phone):\s*(?P<value>(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10}))$",
            "PHONE_NUMBER",
            "[PHONE_NUMBER]",
            "custom labeled intake phone classification",
        );
        push_regex_segments(
            &mut segments,
            input_text,
            r"(?im)^(?:email|teacher'?s email address):\s*(?P<value>[^\r\n]+)$",
            "EMAIL_ADDRESS",
            "[EMAIL_ADDRESS]",
            "custom labeled intake email classification",
        );
        push_regex_segments(
            &mut segments,
            input_text,
            r"(?im)^(?:school|name of school|current school/teachers|primary physician/clinic):\s*(?P<value>[^\r\n]+)$",
            "INSTITUTION_NAME",
            "[INSTITUTION]",
            "custom labeled intake institution classification",
        );
        push_regex_segments(
            &mut segments,
            input_text,
            r"(?im)^(?:name of current primary teacher|primary teacher'?s name|tutor'?s name|place of employment):\s*(?P<value>[^\r\n]+)$",
            "PROVIDER_NAME",
            "[PROVIDER]",
            "custom labeled intake contact/person classification",
        );
        push_regex_segments(
            &mut segments,
            input_text,
            r"(?im)^(?:child'?s place of birth|birthplace|address):\s*(?P<value>[^\r\n]+?)(?:(?:\.\s*(?:email|phone|fax)\b)|$)",
            "ADDRESS",
            "[ADDRESS]",
            "custom labeled intake birthplace/address classification",
        );
        push_multiline_labeled_segments(
            &mut segments,
            input_text,
            &["dob", "patient's date of birth", "patient\n'\ns date of birth", "date of birth"],
            "DATE_OF_BIRTH",
            "[DATE_OF_BIRTH]",
            "custom multiline labeled date-of-birth classification",
        );
        push_multiline_labeled_segments(
            &mut segments,
            input_text,
            &["client", "patient", "provider", "full name", "name of person filling out this form"],
            "CLIENT_NAME",
            "[CLIENT]",
            "custom multiline labeled intake person classification",
        );

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

    let city_state_regex = Regex::new(r"(?i)\b[A-Za-z .'-]+,\s*[A-Z]{2}\b")
        .expect("city/state regex should compile");
    for matched in city_state_regex.find_iter(input_text) {
        let text = matched.as_str().trim().to_string();
        if text.len() < 6 || looks_like_city_state_zip_line(&text) {
            continue;
        }
        segments.push(CustomSegment {
            entity_type: "ADDRESS".to_string(),
            matched_text: text,
            replacement: "[ADDRESS]".to_string(),
            reason: "custom city/state classification for birthplace and sub-state geography"
                .to_string(),
            start: matched.start(),
            end: matched.end(),
        });
    }

    segments.extend(detect_household_roster_segments(input_text));

    if has_line_breaks {
        segments.extend(detect_change_of_name_form_segments(input_text));
        segments.extend(detect_student_score_report_segments(input_text));
    }

    segments
}

fn detect_change_of_name_form_segments(input_text: &str) -> Vec<CustomSegment> {
    if !input_text.contains("ORDER TO SHOW CAUSE—CHANGE OF NAME") {
        return Vec::new();
    }

    let mut segments = Vec::new();
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^NAME:\s*(?P<value>[^\r\n]+)$",
        "CLIENT_NAME",
        "[CLIENT]",
        "custom labeled petitioner name classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^STREET ADDRESS:\s*(?P<value>[^\r\n]+)$",
        "ADDRESS",
        "[ADDRESS]",
        "custom labeled street address classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^CITY:\s*(?P<value>.+?)\s+STATE:\s*[A-Z]{2}\s+ZIP CODE:\s*\d{5}$",
        "ADDRESS",
        "[ADDRESS]",
        "custom labeled city/state/zip classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^TELEPHONE NO\.:\s*(?P<value>.+?)(?:\s+FAX NO\.:.*)?$",
        "PHONE_NUMBER",
        "[PHONE_NUMBER]",
        "custom labeled telephone classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^E-MAIL ADDRESS:\s*(?P<value>[^\r\n]+)$",
        "EMAIL_ADDRESS",
        "[EMAIL_ADDRESS]",
        "custom labeled email classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^SUPERIOR COURT OF CALIFORNIA, COUNTY OF\s*(?P<value>[^\r\n]+)$",
        "INSTITUTION_NAME",
        "[INSTITUTION]",
        "custom labeled county court classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^CITY AND ZIP CODE:\s*(?P<value>[^\r\n]+)$",
        "ADDRESS",
        "[ADDRESS]",
        "custom labeled court city/zip classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^BRANCH NAME:\s*(?P<value>[^\r\n]+)$",
        "INSTITUTION_NAME",
        "[INSTITUTION]",
        "custom labeled court branch classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^PETITION OF \(name of each petitioner\):\s*(?P<value>[^\r\n]+)$",
        "CLIENT_NAME",
        "[CLIENT]",
        "custom labeled petition-of classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^1\. Petitioner \(name\):\s*(?P<value>.+?)\s+filed a petition with this court$",
        "CLIENT_NAME",
        "[CLIENT]",
        "custom labeled petitioner classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^\s*a\.\s*(?P<value>[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)+\s+to\s+[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)+)\s*$",
        "CLIENT_NAME",
        "[CLIENT]",
        "custom present/proposed petitioner classification for change-of-name form",
    );
    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)specify paper\):\s*(?P<value>[^\r\n]+)$",
        "INSTITUTION_NAME",
        "[INSTITUTION]",
        "custom newspaper classification for change-of-name form",
    );

    let mut repeated_name_counts = std::collections::HashMap::<String, usize>::new();
    let line_spans = line_spans(input_text);

    for (_, _, line) in &line_spans {
        if looks_like_form_person_line(line) {
            *repeated_name_counts.entry(line.trim().to_string()).or_default() += 1;
        }
    }

    let institution_keywords = [
        "court",
        "justice center",
        "register",
        "county",
        "branch",
        "newspaper",
    ];

    for (index, (start, end, line)) in line_spans.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.len() < 3 {
            continue;
        }

        if looks_like_form_person_line(trimmed)
            && repeated_name_counts.get(trimmed).copied().unwrap_or(0) >= 2
        {
            segments.push(CustomSegment {
                entity_type: "CLIENT_NAME".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[CLIENT]".to_string(),
                reason: "custom repeated petitioner name classification for change-of-name form"
                    .to_string(),
                start: *start,
                end: *end,
            });
            continue;
        }

        if looks_like_city_state_zip_line(trimmed) {
            segments.push(CustomSegment {
                entity_type: "ADDRESS".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[ADDRESS]".to_string(),
                reason: "custom city/state/zip classification for change-of-name form".to_string(),
                start: *start,
                end: *end,
            });
            continue;
        }

        if trimmed.eq_ignore_ascii_case("orange") || trimmed.eq_ignore_ascii_case("mission viejo") {
            segments.push(CustomSegment {
                entity_type: "ADDRESS".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[ADDRESS]".to_string(),
                reason: "custom standalone county/city classification for change-of-name form".to_string(),
                start: *start,
                end: *end,
            });
            continue;
        }

        if Regex::new(r"(?i)^[A-Z]{2}\s+\d{5}$")
            .expect("state zip regex should compile")
            .is_match(trimmed)
        {
            segments.push(CustomSegment {
                entity_type: "ADDRESS".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[ADDRESS]".to_string(),
                reason: "custom standalone state/zip classification for change-of-name form".to_string(),
                start: *start,
                end: *end,
            });
            continue;
        }

        if index + 1 < line_spans.len() {
            let (_, _, next_line) = line_spans[index + 1];
            let next_trimmed = next_line.trim();
            if looks_like_title_case_phrase(trimmed)
                && Regex::new(r"(?i)^[A-Z]{2}\s+\d{5}$")
                    .expect("state zip regex should compile")
                    .is_match(next_trimmed)
            {
                segments.push(CustomSegment {
                    entity_type: "ADDRESS".to_string(),
                    matched_text: trimmed.to_string(),
                    replacement: "[ADDRESS]".to_string(),
                    reason: "custom city line paired with following state/zip classification for change-of-name form".to_string(),
                    start: *start,
                    end: *end,
                });
            }
        }

        let lowered = trimmed.to_ascii_lowercase();
        if institution_keywords.iter().any(|keyword| lowered.contains(keyword))
            && looks_like_title_case_phrase(trimmed)
            && !trimmed.contains(':')
        {
            segments.push(CustomSegment {
                entity_type: "INSTITUTION_NAME".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[INSTITUTION]".to_string(),
                reason: "custom institution classification for change-of-name form".to_string(),
                start: *start,
                end: *end,
            });
        }
    }

    segments
}

fn detect_student_score_report_segments(input_text: &str) -> Vec<CustomSegment> {
    if !input_text.contains("CAASPP") && !input_text.contains("Student Score Report") {
        return Vec::new();
    }

    let mut segments = Vec::new();
    let lines = line_spans(input_text);

    push_regex_segments(
        &mut segments,
        input_text,
        r"(?im)^SSID:\s*(?P<value>\d+)$",
        "STUDENT_ID",
        "[STUDENT_ID]",
        "custom SSID classification for student score report",
    );

    for (index, (start, end, line)) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed == "FOR THE FAMILY OF:" {
            if let Some((name_start, name_end, name_line)) = next_nonempty_line(&lines, index + 1) {
                if looks_like_form_person_line(name_line.trim()) {
                    segments.push(CustomSegment {
                        entity_type: "CLIENT_NAME".to_string(),
                        matched_text: name_line.trim().to_string(),
                        replacement: "[CLIENT]".to_string(),
                        reason: "custom family-of name classification for student score report"
                            .to_string(),
                        start: name_start,
                        end: name_end,
                    });
                }

                if let Some((addr_start, addr_end, addr_line)) = next_nonempty_line(&lines, index + 2) {
                    if looks_like_street_address(addr_line.trim()) {
                        segments.push(CustomSegment {
                            entity_type: "ADDRESS".to_string(),
                            matched_text: addr_line.trim().to_string(),
                            replacement: "[ADDRESS]".to_string(),
                            reason: "custom street address classification for student score report"
                                .to_string(),
                            start: addr_start,
                            end: addr_end,
                        });
                    }
                }

                if let Some((city_start, city_end, city_line)) = next_nonempty_line(&lines, index + 3) {
                    if looks_like_city_state_zip_line(city_line.trim()) {
                        segments.push(CustomSegment {
                            entity_type: "ADDRESS".to_string(),
                            matched_text: city_line.trim().to_string(),
                            replacement: "[ADDRESS]".to_string(),
                            reason: "custom city/state/zip classification for student score report"
                                .to_string(),
                            start: city_start,
                            end: city_end,
                        });
                    }
                }
            }
            continue;
        }

        if looks_like_school_report_institution(trimmed) {
            segments.push(CustomSegment {
                entity_type: "INSTITUTION_NAME".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[INSTITUTION]".to_string(),
                reason: "custom institution classification for student score report".to_string(),
                start: *start,
                end: *end,
            });
            continue;
        }

        if looks_like_student_footer_name(trimmed) {
            segments.push(CustomSegment {
                entity_type: "CLIENT_NAME".to_string(),
                matched_text: trimmed.to_string(),
                replacement: "[CLIENT]".to_string(),
                reason: "custom footer/header student name classification for student score report"
                    .to_string(),
                start: *start,
                end: *end,
            });
        }
    }

    segments
}

fn push_regex_segments(
    segments: &mut Vec<CustomSegment>,
    input_text: &str,
    pattern: &str,
    entity_type: &str,
    replacement: &str,
    reason: &str,
) {
    let regex = Regex::new(pattern).expect("custom form regex should compile");
    for captures in regex.captures_iter(input_text) {
        let Some(value) = captures.name("value") else {
            continue;
        };
        let text = value.as_str().trim().to_string();
        if text.is_empty() {
            continue;
        }
        segments.push(CustomSegment {
            entity_type: entity_type.to_string(),
            matched_text: text,
            replacement: replacement.to_string(),
            reason: reason.to_string(),
            start: value.start(),
            end: value.end(),
        });
    }
}

fn should_keep_library_entity(input_text: &str, entity: &RecognizerResult) -> bool {
    let matched_text = entity
        .text
        .clone()
        .unwrap_or_else(|| input_text[entity.start..entity.end].to_string());

    match entity.entity_type.as_str() {
        "DOMAIN_NAME" => looks_like_real_domain(&matched_text),
        "PERSON" | "ORGANIZATION" | "LOCATION" => {
            !is_suppressed_labeled_field(input_text, entity.start)
        }
        "US_ZIP_CODE" => !looks_like_license_context(input_text, entity.start),
        _ => true,
    }
}

fn is_suppressed_labeled_field(input_text: &str, start: usize) -> bool {
    let context_start = start.saturating_sub(64);
    let context = input_text[context_start..start].to_ascii_lowercase();
    [
        "race/ethnicity:",
        "primary language:",
        "first language:",
        "highest degree/grade completed:",
        "relationship to patient:",
        "provider license:",
    ]
    .iter()
    .any(|label| context.contains(label))
}

fn looks_like_license_context(input_text: &str, start: usize) -> bool {
    let context_start = start.saturating_sub(32);
    let context = input_text[context_start..start].to_ascii_lowercase();
    context.contains("license")
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

fn line_spans(input_text: &str) -> Vec<(usize, usize, &str)> {
    let mut spans = Vec::new();
    let mut cursor = 0usize;

    for line in input_text.lines() {
        let start = cursor;
        let end = start + line.len();
        spans.push((start, end, line));
        cursor = end + 1;
    }

    spans
}

fn looks_like_title_case_phrase(text: &str) -> bool {
    let words = text
        .split_whitespace()
        .filter(|word| word.chars().any(|ch| ch.is_alphabetic()))
        .collect::<Vec<_>>();
    if words.is_empty() {
        return false;
    }

    words.iter().all(|word| {
        let cleaned = word.trim_matches(|ch: char| !ch.is_alphanumeric() && ch != '#' && ch != '-');
        !cleaned.is_empty()
            && cleaned
                .chars()
                .next()
                .is_some_and(|first| first.is_uppercase() || first.is_ascii_digit())
    })
}

fn looks_like_form_person_line(text: &str) -> bool {
    let words = text
        .split_whitespace()
        .filter(|word| word.chars().any(|ch| ch.is_alphabetic()))
        .collect::<Vec<_>>();

    (2..=4).contains(&words.len())
        && !text.contains(',')
        && words.iter().all(|word| {
            let cleaned = word.trim_matches(|ch: char| !ch.is_alphabetic() && ch != '-' && ch != '\'');
            !cleaned.is_empty()
                && cleaned
                    .chars()
                    .next()
                    .is_some_and(|first| first.is_uppercase())
        })
}

fn looks_like_city_state_zip_line(text: &str) -> bool {
    Regex::new(r"(?i)^[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}$")
        .expect("city/state/zip regex should compile")
        .is_match(text)
}

fn looks_like_street_address(text: &str) -> bool {
    Regex::new(r"(?i)^\d{1,6}\s+[A-Z0-9][A-Za-z0-9 .'#-]+$")
        .expect("street address regex should compile")
        .is_match(text)
}

fn looks_like_school_report_institution(text: &str) -> bool {
    let normalized = text.trim();
    !normalized.is_empty()
        && normalized == normalized.to_ascii_uppercase()
        && normalized.chars().any(|ch| ch.is_alphabetic())
        && (normalized.contains("UNIFIED")
            || normalized.contains("ELEMENTARY")
            || normalized.contains("MIDDLE")
            || normalized.contains("HIGH SCHOOL")
            || normalized.contains("ACADEMY"))
}

fn looks_like_student_footer_name(text: &str) -> bool {
    let Some((name, _rest)) = text.split_once('|') else {
        return false;
    };

    looks_like_form_person_line(name.trim())
}

fn next_nonempty_line<'a>(
    lines: &'a [(usize, usize, &'a str)],
    start_index: usize,
) -> Option<(usize, usize, &'a str)> {
    lines[start_index..]
        .iter()
        .find(|(_, _, line)| !line.trim().is_empty())
        .map(|(start, end, line)| (*start, *end, *line))
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
            if start != seed.start && has_exact_match_boundaries(input_text, start, end, &seed.matched_text) {
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

fn push_multiline_labeled_segments(
    segments: &mut Vec<CustomSegment>,
    input_text: &str,
    labels: &[&str],
    entity_type: &str,
    replacement: &str,
    reason: &str,
) {
    let lines = line_spans(input_text);
    for (index, (_start, _end, line)) in lines.iter().enumerate() {
        let lowered = line.trim().to_ascii_lowercase();
        if !labels.iter().any(|label| lowered == *label || lowered == format!("{label}:")) {
            continue;
        }

        if let Some((value_start, value_end, value_line)) = next_nonempty_line(&lines, index + 1) {
            let trimmed = value_line.trim();
            if trimmed.is_empty() {
                continue;
            }

            segments.push(CustomSegment {
                entity_type: entity_type.to_string(),
                matched_text: trimmed.to_string(),
                replacement: replacement.to_string(),
                reason: reason.to_string(),
                start: value_start,
                end: value_end,
            });
        }
    }
}

fn detect_household_roster_segments(input_text: &str) -> Vec<CustomSegment> {
    let regex = Regex::new(
        r"(?i)\b(?:mom|mother|dad|father|sister|brother|guardian|caregiver)\s*-\s*(?P<value>[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z.'-]+)*)",
    )
    .expect("household roster regex should compile");
    let mut segments = Vec::new();

    for captures in regex.captures_iter(input_text) {
        let Some(value) = captures.name("value") else {
            continue;
        };
        segments.push(CustomSegment {
            entity_type: "FAMILY_NAME".to_string(),
            matched_text: value.as_str().trim().to_string(),
            replacement: "[FAMILY_MEMBER]".to_string(),
            reason: "custom household roster family-name classification".to_string(),
            start: value.start(),
            end: value.end(),
        });
    }

    segments
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
    if looks_like_labeled_student_identifier(input_text, entity.start) {
        return "STUDENT_ID".to_string();
    }

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

fn looks_like_labeled_student_identifier(input_text: &str, start: usize) -> bool {
    let context_start = start.saturating_sub(24);
    let context = input_text[context_start..start].to_ascii_lowercase();
    context.contains("ssid:")
        || context.contains("student id:")
        || context.contains("student identifier:")
        || context.contains("state student id:")
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
