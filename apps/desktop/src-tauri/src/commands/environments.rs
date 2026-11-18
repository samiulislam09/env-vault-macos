use localvault_core::{EnvId, ProjectId, RecordId};
use localvault_environments::{
    create_template_variables, get_template, EnvironmentRecord,
};
use localvault_projects::ProjectRecord;
use localvault_storage::atomic_write;
use localvault_vault::{EnvironmentEntry, VaultState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[tauri::command]
pub async fn list_environments_cmd(
    project_id: String,
    state: State<'_, VaultState>,
) -> Result<Vec<EnvironmentRecord>, String> {
    let proj_uuid = ProjectId::parse(&project_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let mut list = Vec::new();
        for env_entry in &vault.manifest.environments {
            if env_entry.project_id == proj_uuid {
                if let Ok(record) =
                    EnvironmentRecord::load(&env_entry.record_id, &vault.vek, &vault.paths)
                {
                    list.push(record);
                }
            }
        }
        Ok(list)
    }).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEnvInput {
    #[serde(alias = "project_id")]
    pub project_id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    #[serde(alias = "is_default")]
    pub is_default: bool,
    #[serde(alias = "is_production")]
    pub is_production: bool,
    #[serde(alias = "template_id")]
    pub template_id: Option<String>,
}

#[tauri::command]
pub async fn create_environment_cmd(
    input: CreateEnvInput,
    state: State<'_, VaultState>,
) -> Result<EnvironmentRecord, String> {
    let proj_id = ProjectId::parse(&input.project_id).map_err(|e| e.to_string())?;

    state.with_unlocked_mut(|vault| {
        let env_id = EnvId::new();
        let record_id = RecordId::new();

        let mut env = EnvironmentRecord::new(
            env_id,
            proj_id,
            input.name,
            input.color,
            input.icon,
            input.is_default,
            input.is_production,
        );

        // Apply template variables if requested
        if let Some(ref tid) = input.template_id {
            if let Some(tmpl) = get_template(tid) {
                env.variables = create_template_variables(tmpl);
            }
        }

        env.save(&record_id, &vault.vek, &vault.paths)?;

        vault.manifest.environments.push(EnvironmentEntry {
            id: env_id,
            project_id: proj_id,
            record_id,
            version: 1,
        });

        // Update project record's environment_ids
        for proj_entry in &vault.manifest.projects {
            if proj_entry.id == proj_id {
                if let Ok(mut proj_rec) =
                    ProjectRecord::load(&proj_entry.record_id, &vault.vek, &vault.paths)
                {
                    proj_rec.environment_ids.push(env_id);
                    let _ = proj_rec.save(&proj_entry.record_id, &vault.vek, &vault.paths);
                }
            }
        }

        // Save updated manifest
        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(env)
    }).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateEnvInput {
    #[serde(alias = "source_env_id")]
    pub source_env_id: String,
    pub name: String,
    #[serde(alias = "is_production")]
    pub is_production: bool,
}

#[tauri::command]
pub async fn duplicate_environment_cmd(
    input: DuplicateEnvInput,
    state: State<'_, VaultState>,
) -> Result<EnvironmentRecord, String> {
    let src_id = EnvId::parse(&input.source_env_id).map_err(|e| e.to_string())?;

    state.with_unlocked_mut(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == src_id)
            .ok_or_else(|| localvault_core::LvError::EnvironmentNotFound(input.source_env_id.clone()))?
            .clone();

        let src_env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        let new_env_id = EnvId::new();
        let new_record_id = RecordId::new();

        let new_env = src_env.duplicate(new_env_id, input.name, input.is_production);
        new_env.save(&new_record_id, &vault.vek, &vault.paths)?;

        vault.manifest.environments.push(EnvironmentEntry {
            id: new_env_id,
            project_id: entry.project_id,
            record_id: new_record_id,
            version: 1,
        });

        // Update project record's environment_ids
        for proj_entry in &vault.manifest.projects {
            if proj_entry.id == entry.project_id {
                if let Ok(mut proj_rec) =
                    ProjectRecord::load(&proj_entry.record_id, &vault.vek, &vault.paths)
                {
                    proj_rec.environment_ids.push(new_env_id);
                    let _ = proj_rec.save(&proj_entry.record_id, &vault.vek, &vault.paths);
                }
            }
        }

        // Save updated manifest
        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(new_env)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_environment_cmd(
    env_id: String,
    state: State<'_, VaultState>,
) -> Result<(), String> {
    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;

    state.with_unlocked_mut(|vault| {
        let entry_idx = vault
            .manifest
            .environments
            .iter()
            .position(|e| e.id == eid)
            .ok_or_else(|| localvault_core::LvError::EnvironmentNotFound(env_id.clone()))?;

        let entry = vault.manifest.environments.remove(entry_idx);

        // Delete encrypted record file
        let record_path = vault.paths.record_file(&entry.record_id);
        let _ = std::fs::remove_file(record_path);

        // Remove from project record
        for proj_entry in &vault.manifest.projects {
            if proj_entry.id == entry.project_id {
                if let Ok(mut proj_rec) =
                    ProjectRecord::load(&proj_entry.record_id, &vault.vek, &vault.paths)
                {
                    proj_rec.environment_ids.retain(|id| *id != eid);
                    let _ = proj_rec.save(&proj_entry.record_id, &vault.vek, &vault.paths);
                }
            }
        }

        // Save updated manifest
        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(())
    }).map_err(|e| e.to_string())
}
