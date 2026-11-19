use clap::{Parser, Subcommand};
use localvault_core::{LvError, LvResult};
use localvault_storage::VaultPaths;
use localvault_vault::{create_vault, unlock_vault};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus};

#[derive(Parser)]
#[command(name = "localvault")]
#[command(author = "SeloraX")]
#[command(version = "0.1.0")]
#[command(about = "Local-first, encrypted zero-knowledge secrets & environment manager", long_about = None)]
struct Cli {
    #[arg(short, long, help = "Custom vault directory path")]
    vault_path: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Initialize a new encrypted LocalVault")]
    Init,

    #[command(about = "Check current vault and user session status")]
    Status,

    #[command(about = "Execute a command with decrypted environment variables injected directly into memory")]
    Run {
        #[arg(short, long, help = "Project name or ID")]
        project: String,

        #[arg(short, long, help = "Environment name (e.g. development, staging, production)")]
        env: String,

        #[arg(last = true, required = true, help = "Command and arguments to execute")]
        command: Vec<String>,
    },

    #[command(about = "Generate a sanitized .env.example with placeholder values safe for git")]
    Example {
        #[arg(short, long, help = "Project name or ID")]
        project: String,

        #[arg(short, long, help = "Environment name")]
        env: String,

        #[arg(short, long, default_value = ".env.example", help = "Output file path")]
        output: String,
    },

    #[command(about = "Scan directory for unencrypted .env files and hardcoded API secrets")]
    Scan {
        #[arg(short, long, default_value = ".", help = "Target directory to scan")]
        path: String,
    },

    #[command(about = "Manage Git pre-commit security hooks to prevent accidental secret leaks")]
    Hook {
        #[command(subcommand)]
        action: HookAction,
    },
}

#[derive(Subcommand)]
enum HookAction {
    #[command(about = "Install Git pre-commit hook in the current repository")]
    Install,

    #[command(about = "Uninstall LocalVault Git pre-commit hook")]
    Uninstall,

    #[command(about = "Run security check against staged Git files")]
    Run,
}

fn prompt_masked_password(prompt: &str) -> LvResult<String> {
    rpassword::prompt_password(format!("{prompt}: "))
        .map_err(|e| LvError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
}

fn resolve_paths(custom: Option<String>) -> LvResult<VaultPaths> {
    if let Some(p) = custom {
        return Ok(VaultPaths::new(PathBuf::from(p)));
    }

    let default_dir = VaultPaths::default_vault_dir()?;

    // Check for active user session from desktop app
    let session_path = default_dir.join("config").join("active_session.json");
    if session_path.exists() {
        if let Ok(content) = fs::read_to_string(&session_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                let user_id = val.get("userId")
                    .or_else(|| val.get("user_id"))
                    .and_then(|v| v.as_str());

                if let Some(uid) = user_id {
                    let user_vault = default_dir.join("users").join(uid).join("vault");
                    if user_vault.exists() {
                        return Ok(VaultPaths::new(user_vault));
                    }
                }
            }
        }
    }

    Ok(VaultPaths::new(default_dir))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let paths = resolve_paths(cli.vault_path)?;

    match cli.command {
        Commands::Init => {
            if paths.vault_exists() {
                eprintln!("Error: Vault already exists at {}", paths.root_dir.display());
                std::process::exit(1);
            }

            println!("Creating new LocalVault at {}", paths.root_dir.display());
            let password = prompt_masked_password("Set master password (min 10 chars)")?;
            let confirm = prompt_masked_password("Confirm master password")?;

            if password != confirm {
                eprintln!("Error: Passwords do not match.");
                std::process::exit(1);
            }

            let created = create_vault(&paths, &password, None)?;
            println!("\n✅ Vault created successfully!");
            println!("Vault ID: {}", created.vault_id);
            println!("\n⚠️  IMPORTANT: Save your recovery key in a secure location!");
            println!("Recovery Key:\n{}", created.recovery_key);
            println!("\nThis key is displayed ONCE and cannot be recovered.");
        }

        Commands::Status => {
            let exists = paths.vault_exists();
            println!("LocalVault Location : {}", paths.root_dir.display());
            println!("Vault Exists       : {}", if exists { "Yes (Encrypted)" } else { "No" });

            if exists {
                let base_dir = VaultPaths::default_vault_dir()?;
                let session_path = base_dir.join("config").join("active_session.json");
                if session_path.exists() {
                    if let Ok(content) = fs::read_to_string(&session_path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(email) = val.get("email").and_then(|v| v.as_str()) {
                                println!("Active User        : {}", email);
                            }
                        }
                    }
                }
            }
        }

        Commands::Run { project, env, command } => {
            if !paths.vault_exists() {
                eprintln!("Error: Vault not found at {}. Please log in via LocalVault desktop app.", paths.root_dir.display());
                std::process::exit(1);
            }

            let password = prompt_masked_password("Enter master password")?;
            let unlocked = unlock_vault(&paths, &password)?;

            // 1. Match project by name or ID
            let mut matched_project_id = None;
            for p_entry in &unlocked.manifest.projects {
                if let Ok(p_rec) = localvault_projects::ProjectRecord::load(
                    &p_entry.record_id,
                    &unlocked.vek,
                    &paths,
                ) {
                    if p_rec.name.eq_ignore_ascii_case(&project) || p_rec.id.to_string_repr().eq_ignore_ascii_case(&project) {
                        matched_project_id = Some(p_rec.id);
                        break;
                    }
                }
            }

            // 2. Match environment
            let mut matched_env = None;
            for env_entry in &unlocked.manifest.environments {
                if let Ok(rec) = localvault_environments::EnvironmentRecord::load(
                    &env_entry.record_id,
                    &unlocked.vek,
                    &paths,
                ) {
                    let project_matches = match &matched_project_id {
                        Some(pid) => rec.project_id == *pid,
                        None => true,
                    };

                    if project_matches && (rec.name.eq_ignore_ascii_case(&env) || rec.id.to_string_repr().eq_ignore_ascii_case(&env)) {
                        matched_env = Some(rec);
                        break;
                    }
                }
            }

            let env_record = match matched_env {
                Some(e) => e,
                None => {
                    eprintln!("Error: Environment '{env}' for project '{project}' not found.");
                    std::process::exit(1);
                }
            };

            if command.is_empty() {
                eprintln!("Error: No command specified to run.");
                std::process::exit(1);
            }

            println!(
                "🚀 [LocalVault] Injecting {} environment variables for [{}] into: {}",
                env_record.variables.len(),
                env_record.name,
                command.join(" ")
            );

            let mut cmd = Command::new(&command[0]);
            if command.len() > 1 {
                cmd.args(&command[1..]);
            }

            // Zero-disk injection: Pass decrypted secrets directly into process memory
            for var in &env_record.variables {
                cmd.env(&var.key, &var.value);
            }

            let status: ExitStatus = cmd.status()?;
            if let Some(code) = status.code() {
                std::process::exit(code);
            }
        }

        Commands::Example { project, env, output } => {
            if !paths.vault_exists() {
                eprintln!("Error: Vault not found.");
                std::process::exit(1);
            }

            let password = prompt_masked_password("Enter master password")?;
            let unlocked = unlock_vault(&paths, &password)?;

            let mut matched_env = None;
            for env_entry in &unlocked.manifest.environments {
                if let Ok(rec) = localvault_environments::EnvironmentRecord::load(
                    &env_entry.record_id,
                    &unlocked.vek,
                    &paths,
                ) {
                    if rec.name.eq_ignore_ascii_case(&env) {
                        matched_env = Some(rec);
                        break;
                    }
                }
            }

            let env_rec = matched_env.ok_or_else(|| format!("Environment '{env}' not found."))?;

            let mut example_lines = Vec::new();
            example_lines.push(format!("# Sanitized .env.example generated by LocalVault"));
            example_lines.push(format!("# Project: {project} | Environment: {env}"));
            example_lines.push(format!("# Safe to commit to Git version control\n"));

            for v in &env_rec.variables {
                let lower = v.key.to_lowercase();
                let placeholder = if lower.contains("url") || lower.contains("host") {
                    "\"https://example.com\""
                } else if lower.contains("port") {
                    "\"3000\""
                } else if lower.contains("key") || lower.contains("token") || lower.contains("secret") {
                    "\"your_key_here\""
                } else if lower.contains("db") || lower.contains("database") {
                    "\"postgres://user:pass@localhost:5432/dbname\""
                } else {
                    "\"\""
                };

                if let Some(ref desc) = v.description {
                    example_lines.push(format!("# {desc}"));
                }
                example_lines.push(format!("{}={placeholder}\n", v.key));
            }

            let output_path = Path::new(&output);
            fs::write(output_path, example_lines.join("\n"))?;
            println!("✅ Generated sanitized .env.example at: {}", output_path.display());
        }

        Commands::Scan { path } => {
            println!("🔍 Scanning [{path}] for unencrypted .env leaks and hardcoded API tokens...\n");
            let mut detected_issues = 0;

            let walk_dir = |dir: &Path| -> Vec<PathBuf> {
                let mut files = Vec::new();
                fn visit(p: &Path, list: &mut Vec<PathBuf>) {
                    if let Ok(entries) = fs::read_dir(p) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            let name = path.file_name().unwrap_or_default().to_string_lossy();
                            if name == "node_modules" || name == ".git" || name == "target" || name == "dist" || name == ".gemini" {
                                continue;
                            }
                            if path.to_string_lossy().contains("apps/cli/src/main.rs") {
                                continue;
                            }
                            if path.is_dir() {
                                visit(&path, list);
                            } else {
                                list.push(path);
                            }
                        }
                    }
                }
                visit(dir, &mut files);
                files
            };

            let all_files = walk_dir(Path::new(&path));

            for file in all_files {
                let name = file.file_name().unwrap_or_default().to_string_lossy();
                // 1. Check for plaintext .env files on disk
                if (name == ".env" || name.starts_with(".env.")) && !name.ends_with(".example") {
                    println!("⚠️  [HIGH RISK] Plaintext environment file found: {}", file.display());
                    println!("   Recommendation: Encrypt into LocalVault and add to .gitignore\n");
                    detected_issues += 1;
                }

                // 2. Check for leaked API patterns in code
                if let Ok(content) = fs::read_to_string(&file) {
                    if content.contains("sk-proj-") || content.contains("ghp_") || content.contains("AKIA") {
                        println!("🚨 [CRITICAL LEAK] Potential hardcoded API token detected in: {}", file.display());
                        detected_issues += 1;
                    }
                }
            }

            if detected_issues == 0 {
                println!("✅ Clean! No unencrypted .env files or hardcoded API tokens detected.");
            } else {
                println!("Found {detected_issues} security risk(s). Use LocalVault to store these securely.");
            }
        }

        Commands::Hook { action } => {
            let git_dir = Path::new(".git");
            if !git_dir.exists() {
                eprintln!("Error: Current directory is not a Git repository (no .git found).");
                std::process::exit(1);
            }

            let hooks_dir = git_dir.join("hooks");
            let hook_file = hooks_dir.join("pre-commit");

            match action {
                HookAction::Install => {
                    let _ = fs::create_dir_all(&hooks_dir);
                    let hook_script = r#"#!/bin/sh
# LocalVault Pre-Commit Security Hook
# Prevents committing unencrypted secrets and .env files to version control

localvault hook run
STATUS=$?

if [ $STATUS -ne 0 ]; then
    echo ""
    echo "❌ [LocalVault] Git commit aborted to prevent secret leakage!"
    echo "💡 Unstage the leaked files with 'git reset HEAD <file>' and encrypt them into LocalVault."
    echo ""
    exit 1
fi
"#;
                    fs::write(&hook_file, hook_script)?;

                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let mut perms = fs::metadata(&hook_file)?.permissions();
                        perms.set_mode(0o755);
                        let _ = fs::set_permissions(&hook_file, perms);
                    }

                    println!("✅ LocalVault Git pre-commit hook installed successfully at: {}", hook_file.display());
                    println!("   Your repository is now protected against accidental plaintext secret commits.");
                }

                HookAction::Uninstall => {
                    if hook_file.exists() {
                        fs::remove_file(&hook_file)?;
                        println!("✅ LocalVault Git pre-commit hook removed.");
                    } else {
                        println!("No pre-commit hook found at {}", hook_file.display());
                    }
                }

                HookAction::Run => {
                    println!("🔍 [LocalVault Hook] Checking staged files for secret leaks...");

                    let output = Command::new("git")
                        .args(["diff", "--cached", "--name-only"])
                        .output()
                        .map_err(|e| format!("Failed to run git: {e}"))?;

                    if !output.status.success() {
                        eprintln!("Error querying staged Git files.");
                        std::process::exit(1);
                    }

                    let staged_files = String::from_utf8_lossy(&output.stdout);
                    let mut has_leaks = false;

                    for file in staged_files.lines() {
                        let trimmed = file.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        let p = Path::new(trimmed);
                        let file_name = p.file_name().unwrap_or_default().to_string_lossy();

                        // 1. Block staged .env files
                        if (file_name == ".env" || file_name.starts_with(".env.")) && !file_name.ends_with(".example") {
                            eprintln!("🚨 [BLOCKED] Staged plaintext environment file: {trimmed}");
                            has_leaks = true;
                        }

                        // 2. Check staged content for API key patterns
                        let diff_out = Command::new("git")
                            .args(["diff", "--cached", "--", trimmed])
                            .output();

                        if let Ok(d) = diff_out {
                            let diff_text = String::from_utf8_lossy(&d.stdout);
                            for line in diff_text.lines() {
                                if line.starts_with('+') && !line.starts_with("+++") {
                                    if line.contains("sk-proj-") || line.contains("ghp_") || line.contains("AKIA") {
                                        eprintln!("🚨 [BLOCKED] Staged commit contains potential API token in: {trimmed}");
                                        has_leaks = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if has_leaks {
                        std::process::exit(1);
                    } else {
                        println!("✅ [LocalVault Hook] Staged files clean. Commit allowed.");
                    }
                }
            }
        }
    }

    Ok(())
}
