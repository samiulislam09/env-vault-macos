use localvault_core::{
    EnvId, ExportFormat, ImportFormat, ImportStrategy, LvError, VarType,
};
use localvault_environments::EnvironmentRecord;
use localvault_io::{
    format_dotenv, format_json_vars, generate_import_preview, parse_dotenv, parse_json_vars,
    ImportPreview,
};
use localvault_variables::Variable;
use localvault_vault::VaultState;
use serde::Deserialize;
use std::fs;
use tauri::State;

#[tauri::command]
pub async fn preview_import_cmd(
    env_id: String,
    file_content: String,
    format: ImportFormat,
    state: State<'_, VaultState>,
) -> Result<ImportPreview, String> {
    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;

    let keys = match format {
        ImportFormat::DotEnv => {
            let entries = parse_dotenv(&file_content).map_err(|e| e.to_string())?;
            entries.into_iter().map(|e| e.key).collect::<Vec<_>>()
        }
        ImportFormat::Json => {
            let entries = parse_json_vars(&file_content).map_err(|e| e.to_string())?;
            entries.into_iter().map(|(k, _)| k).collect::<Vec<_>>()
        }
    };

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_id.clone()))?;

        let env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;
        let preview = generate_import_preview(&keys, &env.variables)?;
        Ok(preview)
    }).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteImportInput {
    #[serde(alias = "env_id")]
    pub env_id: String,
    #[serde(alias = "file_content")]
    pub file_content: String,
    pub format: ImportFormat,
    pub strategy: ImportStrategy,
}

#[tauri::command]
pub async fn execute_import_cmd(
    input: ExecuteImportInput,
    state: State<'_, VaultState>,
) -> Result<usize, String> {
    let eid = EnvId::parse(&input.env_id).map_err(|e| e.to_string())?;

    let parsed_pairs: Vec<(String, String)> = match input.format {
        ImportFormat::DotEnv => {
            let entries = parse_dotenv(&input.file_content).map_err(|e| e.to_string())?;
            entries.into_iter().map(|e| (e.key, e.value)).collect()
        }
        ImportFormat::Json => {
            parse_json_vars(&input.file_content).map_err(|e| e.to_string())?
        }
    };

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(input.env_id.clone()))?;

        let mut env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;
        let mut imported_count = 0;

        for (k, v) in parsed_pairs {
            if let Some(existing_idx) = env.variables.iter().position(|ev| ev.key == k) {
                match input.strategy {
                    ImportStrategy::Overwrite => {
                        env.variables[existing_idx].value = v;
                        env.variables[existing_idx].updated_at = localvault_core::now_timestamp();
                        imported_count += 1;
                    }
                    ImportStrategy::Skip => {}
                    ImportStrategy::Error => {
                        return Err(LvError::DuplicateKey(k));
                    }
                }
            } else {
                env.variables.push(Variable::new(
                    k,
                    v,
                    VarType::Secret,
                    None,
                    vec!["imported".to_string()],
                ));
                imported_count += 1;
            }
        }

        env.save(&entry.record_id, &vault.vek, &vault.paths)?;
        Ok(imported_count)
    }).map_err(|e| e.to_string())
}

fn resolve_filesystem_path(raw: &str) -> std::path::PathBuf {
    if raw.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(format!("{}{}", home, &raw[1..]));
        }
    } else if raw == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home);
        }
    }
    std::path::PathBuf::from(raw)
}

#[tauri::command]
pub async fn get_downloads_dir_cmd() -> Result<String, String> {
    if let Ok(home) = std::env::var("HOME") {
        let downloads = std::path::PathBuf::from(home).join("Downloads");
        if downloads.exists() {
            return Ok(downloads.to_string_lossy().to_string());
        }
    }
    Ok(std::env::current_dir().unwrap_or_default().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn pick_export_path_cmd(
    default_dir: Option<String>,
    default_filename: Option<String>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();

        let initial_dir = match default_dir {
            Some(d) if !d.is_empty() => Some(resolve_filesystem_path(&d)),
            _ => std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join("Downloads")),
        };

        if let Some(ref dir) = initial_dir {
            if dir.exists() {
                dialog = dialog.set_directory(dir);
            }
        }

        if let Some(ref name) = default_filename {
            dialog = dialog.set_file_name(name);
        }

        let path = dialog.save_file();
        Ok(path.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_exported_file_cmd(
    dest_path: String,
    content: String,
) -> Result<(), String> {
    let resolved = resolve_filesystem_path(&dest_path);
    if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(LvError::Io).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&resolved, content).map_err(LvError::Io).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_environment_cmd(
    env_id: String,
    dest_path: String,
    format: ExportFormat,
    confirmed: bool,
    state: State<'_, VaultState>,
) -> Result<(), String> {
    if !confirmed {
        return Err(LvError::ExportNotConfirmed.to_string());
    }

    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;
    let resolved = resolve_filesystem_path(&dest_path);

    if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(LvError::Io).map_err(|e| e.to_string())?;
        }
    }

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_id.clone()))?;

        let env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        let content = match format {
            ExportFormat::DotEnv => format_dotenv(&env.variables),
            ExportFormat::Json => format_json_vars(&env.variables)?,
        };

        fs::write(&resolved, content).map_err(LvError::Io)?;
        Ok(())
    }).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_execute_import_input() {
        let json = r#"{
            "envId": "01934988-82ef-7d43-98fe-622879579344",
            "fileContent": "FOO=BAR\nBAZ=QUX",
            "format": "dotenv",
            "strategy": "overwrite"
        }"#;
        let res: Result<ExecuteImportInput, _> = serde_json::from_str(json);
        assert!(res.is_ok(), "Failed to deserialize: {:?}", res.err());
    }
}


