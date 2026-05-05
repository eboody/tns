# HIPAA Safe Harbor Coverage Matrix

This matrix captures the honest coverage story for a self-contained Rust CLI
that processes a directory of source documents and emits de-identified Markdown.

The target architecture is:

- `redact-core` as the default structured-identifier detection/anonymization engine
- deterministic configured replacements for known case-specific entities
- custom Safe Harbor gap recognizers and policy rules where `redact-core` is not enough
- explicit review output for identifiers that cannot be guaranteed by deterministic rules alone

## Coverage categories

- **redact-core**: built-in crate coverage appears to exist directly
- **config supplement**: requires user-supplied known names/aliases/locations/etc.
- **custom recognizer/policy**: requires project-specific deterministic logic beyond stock crate use
- **review required**: cannot be honestly guaranteed by non-AI rules alone in all free text

| Safe Harbor identifier | Coverage strategy | Notes |
|---|---|---|
| 1. Names | config supplement + review required | `redact-core` has `Person`, but non-AI use should not rely on generic NER. Known client/family/provider/institution/person aliases must be config-driven. Residual unknown names still require review. |
| 2. Geographic subdivisions smaller than a state | config supplement + custom recognizer/policy + review required | Known schools/clinics/cities/streets can be configured. Stock `Location` is not enough without AI. Address-like patterns can be custom-detected, but neighborhood/city/place mentions remain review-sensitive. |
| 3. All elements of dates except year, and ages >89 | redact-core + custom recognizer/policy + review required | `DateTime` helps for structured dates. We still need policy logic to preserve only year, suppress month/day, and collapse ages over 89 into the required aggregated bucket. Free-text relative date references remain review-sensitive. |
| 4. Telephone numbers | redact-core | `PhoneNumber` support appears built in. |
| 5. Fax numbers | custom recognizer/policy | A phone-pattern detector may catch the number, but fax-specific treatment should be explicit in policy and review output. |
| 6. Email addresses | redact-core | `EmailAddress` support appears built in. |
| 7. Social Security numbers | redact-core | `UsSsn` support appears built in. |
| 8. Medical record numbers | redact-core + review required | `MedicalRecordNumber` support appears built in, but pattern quality may depend on context and local formatting. |
| 9. Health plan beneficiary numbers | custom recognizer/policy + review required | No direct stock entity was confirmed. Likely requires custom deterministic patterns and/or configured labels. |
| 10. Account numbers | redact-core + custom recognizer/policy + review required | `UsBankNumber` exists, but broader account-number coverage is not guaranteed. Custom policy is needed for generic account identifiers. |
| 11. Certificate/license numbers | redact-core + custom recognizer/policy + review required | Some license/passport entities exist, but Safe Harbor is broader than the built-in set. Additional deterministic recognizers are needed. |
| 12. Vehicle identifiers and serial numbers, including plate numbers | custom recognizer/policy + review required | No direct comprehensive stock vehicle/plate coverage was confirmed. |
| 13. Device identifiers and serial numbers | redact-core + custom recognizer/policy + review required | `MacAddress` and `Guid` exist, but general device serial coverage is broader. |
| 14. Web URLs | redact-core | `Url` and `DomainName` support appears built in. |
| 15. IP addresses | redact-core | `IpAddress` support appears built in. |
| 16. Biometric identifiers | review required / generally out of text scope | Text-first Markdown output cannot guarantee biometric removal unless the extraction pipeline suppresses such material or explicitly reviews it. |
| 17. Full-face photos and comparable images | custom extraction policy + review required | Markdown output should omit embedded images by default or replace them with a placeholder note. Visual content requires extraction-policy handling, not just text redaction. |
| 18. Any other unique identifying number, characteristic, or code | custom recognizer/policy + review required | This category is intentionally open-ended; no deterministic system can guarantee universal capture without a residual review path. |

## Practical conclusion

`redact-core` is a strong foundation for structured identifiers, but it does not by itself satisfy a full non-AI Safe Harbor promise.

The honest product claim should be:

> The tool applies a deterministic Safe Harbor-oriented de-identification policy using `redact-core`, configured known-entity replacement, custom gap recognizers, and explicit review output for residual risk.

## Output implication

Because the target output is Markdown documents, the pipeline must also make explicit decisions about:

- how DOCX and PDF text are extracted
- whether embedded images are omitted by default
- how non-text artifacts are represented in output
- how unsupported/low-confidence cases are surfaced to the operator
