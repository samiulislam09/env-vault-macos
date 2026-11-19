use localvault_core::{LvError, ProjectId, RecordId, WorkspaceId};
use localvault_projects::{ProjectRecord, WorkspaceRecord};
use localvault_storage::atomic_write;
use localvault_vault::{ProjectEntry, VaultState, WorkspaceEntry};
use serde::Deserialize;
use tauri::State;

#[tauri::command]
pub async fn list_workspaces_cmd(
    state: State<'_, VaultState>,
) -> Result<Vec<WorkspaceRecord>, String> {
    state.with_unlocked(|vault| {
        let mut list = Vec::new();
        for ws_entry in &vault.manifest.workspaces {
            if let Ok(record) = WorkspaceRecord::load(&ws_entry.record_id, &vault.vek, &vault.paths) {
                list.push(record);
            }
        }
        Ok(list)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_workspace_cmd(
    name: String,
    description: Option<String>,
    state: State<'_, VaultState>,
) -> Result<WorkspaceRecord, String> {
    let record = state.with_unlocked_mut(|vault| {
        let ws_id = WorkspaceId::new();
        let record_id = RecordId::new();
        let record = WorkspaceRecord::new(ws_id, name, description);

        record.save(&record_id, &vault.vek, &vault.paths)?;

        vault.manifest.workspaces.push(WorkspaceEntry {
            id: ws_id,
            record_id,
            version: 1,
        });

        // Save updated manifest
        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(record)
    }).map_err(|e| e.to_string())?;

    super::turso::trigger_auto_sync_background();
    Ok(record)
}

#[tauri::command]
pub async fn list_projects_cmd(
    workspace_id: Option<String>,
    state: State<'_, VaultState>,
) -> Result<Vec<ProjectRecord>, String> {
    state.with_unlocked(|vault| {
        let mut list = Vec::new();
        for proj_entry in &vault.manifest.projects {
            if let Ok(record) = ProjectRecord::load(&proj_entry.record_id, &vault.vek, &vault.paths) {
                if let Some(ref ws_filter) = workspace_id {
                    if record.workspace_id.to_string_repr() != *ws_filter {
                        continue;
                    }
                }
                list.push(record);
            }
        }
        Ok(list)
    }).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    #[serde(alias = "workspace_id")]
    pub workspace_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    #[serde(alias = "root_directory")]
    pub root_directory: Option<String>,
}

#[tauri::command]
pub async fn create_project_cmd(
    input: CreateProjectInput,
    state: State<'_, VaultState>,
) -> Result<ProjectRecord, String> {
    let project = state.with_unlocked_mut(|vault| {
        // Resolve or create default workspace if none specified
        let ws_id = match input.workspace_id {
            Some(id_str) => WorkspaceId::parse(&id_str)
                .map_err(|_| LvError::WorkspaceNotFound(id_str))?,
            None => {
                if let Some(first_ws) = vault.manifest.workspaces.first() {
                    first_ws.id
                } else {
                    // Create default "Personal" workspace
                    let default_ws_id = WorkspaceId::new();
                    let ws_rec_id = RecordId::new();
                    let ws_record = WorkspaceRecord::new(
                        default_ws_id,
                        "Personal".to_string(),
                        Some("Default personal workspace".to_string()),
                    );
                    ws_record.save(&ws_rec_id, &vault.vek, &vault.paths)?;
                    vault.manifest.workspaces.push(WorkspaceEntry {
                        id: default_ws_id,
                        record_id: ws_rec_id,
                        version: 1,
                    });
                    default_ws_id
                }
            }
        };

        let proj_id = ProjectId::new();
        let record_id = RecordId::new();
        let project = ProjectRecord::new(
            proj_id,
            ws_id,
            input.name,
            input.description,
            input.icon,
            input.root_directory,
        );

        project.save(&record_id, &vault.vek, &vault.paths)?;

        vault.manifest.projects.push(ProjectEntry {
            id: proj_id,
            workspace_id: ws_id,
            record_id,
            version: 1,
        });

        // Save updated manifest
        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(project)
    }).map_err(|e| e.to_string())?;

    super::turso::trigger_auto_sync_background();
    Ok(project)
}

#[tauri::command]
pub async fn delete_project_cmd(
    project_id: String,
    state: State<'_, VaultState>,
) -> Result<(), String> {
    let pid = ProjectId::parse(&project_id).map_err(|e| e.to_string())?;

    state.with_unlocked_mut(|vault| {
        let entry_idx = vault
            .manifest
            .projects
            .iter()
            .position(|p| p.id == pid)
            .ok_or_else(|| LvError::ProjectNotFound(project_id.clone()))?;

        let entry = vault.manifest.projects.remove(entry_idx);
        let proj_record_path = vault.paths.record_file(&entry.record_id);
        let _ = std::fs::remove_file(proj_record_path);

        // Remove associated environments and their record files
        let env_entries_to_remove: Vec<_> = vault
            .manifest
            .environments
            .iter()
            .filter(|e| e.project_id == pid)
            .cloned()
            .collect();

        for e in env_entries_to_remove {
            let env_record_path = vault.paths.record_file(&e.record_id);
            let _ = std::fs::remove_file(env_record_path);
        }

        vault.manifest.environments.retain(|e| e.project_id != pid);

        // Remove from workspace record
        for ws_entry in &vault.manifest.workspaces {
            if ws_entry.id == entry.workspace_id {
                if let Ok(mut ws_rec) =
                    WorkspaceRecord::load(&ws_entry.record_id, &vault.vek, &vault.paths)
                {
                    ws_rec.project_ids.retain(|id| *id != pid);
                    let _ = ws_rec.save(&ws_entry.record_id, &vault.vek, &vault.paths);
                }
            }
        }

        // Save updated manifest
        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(())
    }).map_err(|e| e.to_string())?;

    super::turso::trigger_auto_sync_background();
    Ok(())
}
