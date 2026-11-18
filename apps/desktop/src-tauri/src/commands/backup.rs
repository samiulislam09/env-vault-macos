use localvault_backup::{
    create_encrypted_backup, restore_encrypted_backup, verify_encrypted_backup, BackupSummary,
    BackupVerification,
};
use localvault_storage::VaultPaths;
use localvault_vault::VaultState;
use std::path::{Path, PathBuf};
use tauri::State;

#[tauri::command]
pub async fn create_backup_cmd(
    passphrase: String,
    dest_path: Option<String>,
    state: State<'_, VaultState>,
) -> Result<BackupSummary, String> {
    state.with_unlocked(|vault| {
        let dest = dest_path.map(PathBuf::from);
        let summary = create_encrypted_backup(&vault.paths, &passphrase, dest, None)?;
        Ok(summary)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_backup_cmd(
    backup_path: String,
    passphrase: String,
) -> Result<BackupVerification, String> {
    let p = Path::new(&backup_path);
    verify_encrypted_backup(p, &passphrase).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_backup_cmd(
    backup_path: String,
    passphrase: String,
    state: State<'_, VaultState>,
) -> Result<usize, String> {
    let p = Path::new(&backup_path);
    let paths = VaultPaths::new(VaultPaths::default_vault_dir().map_err(|e| e.to_string())?);

    // Lock vault before restore
    let _ = state.lock();

    let restored = restore_encrypted_backup(p, &passphrase, &paths).map_err(|e| e.to_string())?;
    Ok(restored)
}
