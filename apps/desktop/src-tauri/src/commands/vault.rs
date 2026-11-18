use localvault_core::{LvError, LvResult};
use localvault_storage::VaultPaths;
use localvault_vault::{
    create_vault, unlock_vault, unlock_with_recovery, VaultCreated, VaultState,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultStatusResponse {
    pub exists: bool,
    pub is_unlocked: bool,
    pub vault_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnlockResponse {
    pub vault_id: String,
    pub workspace_count: usize,
    pub project_count: usize,
    pub environment_count: usize,
}

#[tauri::command]
pub async fn vault_status(state: State<'_, VaultState>) -> Result<VaultStatusResponse, String> {
    let paths = VaultPaths::new(VaultPaths::default_vault_dir().map_err(|e| e.to_string())?);
    let exists = paths.vault_exists();
    let is_unlocked = state.is_unlocked();

    Ok(VaultStatusResponse {
        exists,
        is_unlocked,
        vault_path: paths.root_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn create_vault_cmd(
    password: String,
    state: State<'_, VaultState>,
) -> Result<VaultCreated, String> {
    let paths = VaultPaths::new(VaultPaths::default_vault_dir().map_err(|e| e.to_string())?);
    let created = create_vault(&paths, &password, None).map_err(|e| e.to_string())?;

    // Auto-unlock upon creation
    let unlocked = unlock_vault(&paths, &password).map_err(|e| e.to_string())?;
    state.set_unlocked(unlocked).map_err(|e| e.to_string())?;

    Ok(created)
}

#[tauri::command]
pub async fn unlock_vault_cmd(
    password: String,
    state: State<'_, VaultState>,
) -> Result<UnlockResponse, String> {
    let paths = VaultPaths::new(VaultPaths::default_vault_dir().map_err(|e| e.to_string())?);
    let unlocked = unlock_vault(&paths, &password).map_err(|e| e.to_string())?;

    let resp = UnlockResponse {
        vault_id: unlocked.header.vault_id.to_string_repr(),
        workspace_count: unlocked.manifest.workspaces.len(),
        project_count: unlocked.manifest.projects.len(),
        environment_count: unlocked.manifest.environments.len(),
    };

    state.set_unlocked(unlocked).map_err(|e| e.to_string())?;
    Ok(resp)
}

#[tauri::command]
pub async fn unlock_with_recovery_cmd(
    recovery_key: String,
    state: State<'_, VaultState>,
) -> Result<UnlockResponse, String> {
    let paths = VaultPaths::new(VaultPaths::default_vault_dir().map_err(|e| e.to_string())?);
    let unlocked = unlock_with_recovery(&paths, &recovery_key).map_err(|e| e.to_string())?;

    let resp = UnlockResponse {
        vault_id: unlocked.header.vault_id.to_string_repr(),
        workspace_count: unlocked.manifest.workspaces.len(),
        project_count: unlocked.manifest.projects.len(),
        environment_count: unlocked.manifest.environments.len(),
    };

    state.set_unlocked(unlocked).map_err(|e| e.to_string())?;
    Ok(resp)
}

#[tauri::command]
pub async fn lock_vault_cmd(state: State<'_, VaultState>) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())
}
