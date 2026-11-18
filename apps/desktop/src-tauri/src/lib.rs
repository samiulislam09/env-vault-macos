pub mod commands;

use commands::*;
use localvault_vault::VaultState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultState::new())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            vault_status,
            create_vault_cmd,
            unlock_vault_cmd,
            unlock_with_recovery_cmd,
            lock_vault_cmd,
            list_workspaces_cmd,
            create_workspace_cmd,
            list_projects_cmd,
            create_project_cmd,
            delete_project_cmd,
            list_environments_cmd,
            create_environment_cmd,
            update_environment_cmd,
            duplicate_environment_cmd,
            delete_environment_cmd,
            list_variables_cmd,
            reveal_variable_value_cmd,
            create_variable_cmd,
            update_variable_cmd,
            delete_variable_cmd,
            compare_environments_cmd,
            preview_import_cmd,
            execute_import_cmd,
            export_environment_cmd,
            get_downloads_dir_cmd,
            pick_export_path_cmd,
            write_exported_file_cmd,
            create_backup_cmd,
            verify_backup_cmd,
            restore_backup_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
