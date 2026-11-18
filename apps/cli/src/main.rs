use clap::{Parser, Subcommand};
use localvault_core::{LvError, LvResult};
use localvault_storage::VaultPaths;
use localvault_vault::{create_vault, unlock_vault};
use std::io::{self, Write};
use std::process::{Command, ExitStatus};

#[derive(Parser)]
#[command(name = "localvault")]
#[command(author = "SeloraX")]
#[command(version = "0.1.0")]
#[command(about = "Local-first, encrypted secrets & environment manager", long_about = None)]
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

    #[command(about = "Check current vault status")]
    Status,

    #[command(about = "Execute a command with decrypted environment variables injected into child process")]
    Run {
        #[arg(short, long, help = "Project name or ID")]
        project: String,

        #[arg(short, long, help = "Environment name (e.g. development, staging, production)")]
        env: String,

        #[arg(last = true, required = true, help = "Command and arguments to execute")]
        command: Vec<String>,
    },

    #[command(about = "Export variables from an environment")]
    Export {
        #[arg(short, long)]
        project: String,

        #[arg(short, long)]
        env: String,

        #[arg(short, long, default_value = "dotenv")]
        format: String,
    },
}

fn prompt_password(prompt: &str) -> LvResult<String> {
    print!("{prompt}: ");
    io::stdout().flush().map_err(LvError::Io)?;
    let mut input = String::new();
    io::stdin().read_line(&mut input).map_err(LvError::Io)?;
    Ok(input.trim().to_string())
}

fn resolve_paths(custom: Option<String>) -> LvResult<VaultPaths> {
    if let Some(p) = custom {
        Ok(VaultPaths::new(std::path::PathBuf::from(p)))
    } else {
        let default_dir = VaultPaths::default_vault_dir()?;
        Ok(VaultPaths::new(default_dir))
    }
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
            let password = prompt_password("Set master password (min 8 chars)")?;
            let confirm = prompt_password("Confirm master password")?;

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
            println!("LocalVault Storage: {}", paths.root_dir.display());
            println!("Vault Exists: {}", if exists { "Yes" } else { "No" });
        }

        Commands::Run { project, env, command } => {
            if !paths.vault_exists() {
                eprintln!("Error: Vault not found. Run 'localvault init' first.");
                std::process::exit(1);
            }

            let password = prompt_password("Enter master password")?;
            let unlocked = unlock_vault(&paths, &password)?;

            // Find project and environment records
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

            let env_record = match matched_env {
                Some(e) => e,
                None => {
                    eprintln!("Error: Environment '{env}' not found in project '{project}'");
                    std::process::exit(1);
                }
            };

            if command.is_empty() {
                eprintln!("Error: No command specified to run.");
                std::process::exit(1);
            }

            println!(
                "Injecting {} variables for [{}] into: {}",
                env_record.variables.len(),
                env_record.name,
                command.join(" ")
            );

            let mut cmd = Command::new(&command[0]);
            if command.len() > 1 {
                cmd.args(&command[1..]);
            }

            // Runtime Injection: inject variables into child process environment
            for var in &env_record.variables {
                cmd.env(&var.key, &var.value);
            }

            let status: ExitStatus = cmd.status()?;
            if let Some(code) = status.code() {
                std::process::exit(code);
            }
        }

        Commands::Export { project: _, env: _, format: _ } => {
            println!("Export requires explicit user confirmation.");
        }
    }

    Ok(())
}
