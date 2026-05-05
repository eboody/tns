use std::path::PathBuf;

use clap::Parser;

use tns_deid::{RunMode, RunOptions, run};

#[derive(Debug, Parser)]
#[command(name = "tns-deid")]
#[command(about = "Deterministic document de-identification CLI")]
struct Args {
    #[arg(long)]
    input: PathBuf,
    #[arg(long)]
    config: Option<PathBuf>,
    #[arg(long = "include")]
    include_patterns: Vec<String>,
    #[arg(long = "exclude")]
    exclude_patterns: Vec<String>,
    #[arg(long)]
    output: Option<PathBuf>,
    #[arg(long = "audit-output")]
    audit_output: Option<PathBuf>,
    #[arg(long, default_value = "replace", value_parser = ["replace", "dry-run", "review"])]
    mode: String,
}

fn main() {
    let args = Args::parse();

    let summary = run(RunOptions {
        input: args.input,
        output: args.output,
        audit_output: args.audit_output,
        config: args.config,
        include_patterns: args.include_patterns,
        exclude_patterns: args.exclude_patterns,
        mode: parse_mode(&args.mode),
    });

    match summary {
        Ok(summary) => match summary.mode {
            RunMode::Replace => {
                println!("mode: replace");
                println!(
                    "output: {}",
                    summary.output_path.expect("replace output path").display()
                );
                println!(
                    "audit: {}",
                    summary
                        .audit_output_path
                        .expect("replace audit path")
                        .display()
                );
                println!("replacements: {}", summary.replacements);
                if !summary.review_summary.is_empty() {
                    println!("{}", summary.review_summary);
                }
                println!("note: {}", summary.coverage_note);
            }
            RunMode::DryRun => {
                println!("mode: dry-run");
                println!("no files written");
                println!("{}", summary.review_summary);
                println!("note: {}", summary.coverage_note);
            }
            RunMode::Review => {
                println!("mode: review");
                println!("no files written");
                println!("{}", summary.review_summary);
                println!("note: {}", summary.coverage_note);
            }
        },
        Err(error) => {
            eprintln!("error: {error}");
            std::process::exit(1);
        }
    }
}

fn parse_mode(mode: &str) -> RunMode {
    match mode {
        "dry-run" => RunMode::DryRun,
        "review" => RunMode::Review,
        _ => RunMode::Replace,
    }
}
