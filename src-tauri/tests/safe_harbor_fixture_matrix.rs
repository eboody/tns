use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use lopdf::content::{Content, Operation};
use lopdf::{Document, Object, Stream, dictionary};
use serde::Deserialize;
use tempfile::tempdir;
use tns_deid::{RunMode, RunOptions, run};
use zip::ZipWriter;
use zip::write::SimpleFileOptions;

#[derive(Debug, Deserialize)]
struct FixtureCase {
    name: String,
    kind: String,
    input: String,
    config: Option<String>,
    mode: String,
    expected_output_contains: Option<Vec<String>>,
    expected_audit_contains: Option<Vec<String>>,
    expected_review_contains: Option<Vec<String>>,
    expected_error_contains: Option<String>,
}

#[test]
fn safe_harbor_fixture_matrix() {
    let manifest_path = fixture_path("safe_harbor_matrix.json");
    let manifest: Vec<FixtureCase> =
        serde_json::from_str(&fs::read_to_string(manifest_path).unwrap()).unwrap();

    for case in manifest {
        run_case(&case);
    }
}

fn run_case(case: &FixtureCase) {
    let temp = tempdir().unwrap();
    let input_path = materialize_input(temp.path(), case);
    let config_path = case
        .config
        .as_ref()
        .map(|name| copy_fixture(temp.path(), name, "config.toml"));

    let result = run(RunOptions {
        input: input_path.clone(),
        output: None,
        audit_output: None,
        config: config_path,
        include_patterns: Vec::new(),
        exclude_patterns: Vec::new(),
        mode: parse_mode(&case.mode),
    });

    if let Some(expected_error) = &case.expected_error_contains {
        let error = result.expect_err(&format!("{} should fail", case.name));
        assert!(
            error.to_string().contains(expected_error),
            "{} error `{}` did not contain `{}`",
            case.name,
            error,
            expected_error
        );
        return;
    }

    let summary = result.expect(&format!("{} should succeed", case.name));

    if let Some(expected) = &case.expected_output_contains {
        let output_path = summary.output_path.expect("replace mode output path");
        let output = fs::read_to_string(output_path).unwrap();
        for snippet in expected {
            assert!(
                output.contains(snippet),
                "{} output `{}` missing `{}`",
                case.name,
                output,
                snippet
            );
        }
    }

    if let Some(expected) = &case.expected_audit_contains {
        let audit = summary
            .preview_artifacts
            .iter()
            .map(|artifact| serde_json::to_string_pretty(&artifact.audit_report).unwrap())
            .collect::<Vec<_>>()
            .join("\n");
        for snippet in expected {
            assert!(
                audit.contains(snippet),
                "{} audit `{}` missing `{}`",
                case.name,
                audit,
                snippet
            );
        }
    }

    if let Some(expected) = &case.expected_review_contains {
        for snippet in expected {
            assert!(
                summary.review_summary.contains(snippet),
                "{} review `{}` missing `{}`",
                case.name,
                summary.review_summary,
                snippet
            );
        }
    }
}

fn materialize_input(temp_root: &Path, case: &FixtureCase) -> PathBuf {
    match case.kind.as_str() {
        "text" => copy_fixture(temp_root, &case.input, &case.input),
        "docx" => {
            let xml = fs::read_to_string(fixture_path(&case.input)).unwrap();
            let path = temp_root.join("input.docx");
            write_test_docx(&path, &xml);
            path
        }
        "pdf" => {
            let text = fs::read_to_string(fixture_path(&case.input)).unwrap();
            let path = temp_root.join("input.pdf");
            write_test_pdf(&path, text.trim());
            path
        }
        "invalid_pdf" => copy_fixture(temp_root, &case.input, "input.pdf"),
        other => panic!("unknown fixture kind: {other}"),
    }
}

fn copy_fixture(temp_root: &Path, fixture_name: &str, output_name: &str) -> PathBuf {
    let source = fixture_path(fixture_name);
    let target = temp_root.join(output_name);
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    fs::copy(source, &target).unwrap();
    target
}

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

fn parse_mode(mode: &str) -> RunMode {
    match mode {
        "dry-run" => RunMode::DryRun,
        "review" => RunMode::Review,
        _ => RunMode::Replace,
    }
}

fn write_test_docx(path: &Path, document_xml: &str) {
    let file = fs::File::create(path).unwrap();
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    zip.start_file("word/document.xml", options).unwrap();
    zip.write_all(document_xml.as_bytes()).unwrap();
    zip.finish().unwrap();
}

fn write_test_pdf(path: &Path, text: &str) {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Courier",
    });
    let resources_id = doc.add_object(dictionary! {
        "Font" => dictionary! {
            "F1" => font_id,
        },
    });
    let content = Content {
        operations: vec![
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec!["F1".into(), 12.into()]),
            Operation::new("Td", vec![50.into(), 700.into()]),
            Operation::new("Tj", vec![Object::string_literal(text)]),
            Operation::new("ET", vec![]),
        ],
    };
    let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
    let page_id = doc.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "Contents" => content_id,
        "Resources" => resources_id,
        "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
    });
    let pages = dictionary! {
        "Type" => "Pages",
        "Kids" => vec![page_id.into()],
        "Count" => 1,
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();
    doc.save(path).unwrap();
}
