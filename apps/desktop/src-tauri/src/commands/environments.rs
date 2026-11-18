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
