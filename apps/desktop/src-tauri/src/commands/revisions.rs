use localvault_core::{now_timestamp, EnvId, LvError, VarId};
use localvault_environments::EnvironmentRecord;
use localvault_storage::atomic_write;
use localvault_vault::{UnlockedVault, VaultState};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableRevision {
    pub id: String,
    pub env_id: String,
    pub var_id: String,
    pub var_key: String,
    pub action: String, // "create" | "update" | "delete" | "rollback"
    pub previous_value: Option<String>,
    pub new_value: Option<String>,
    pub author: String,
    pub timestamp: i64,
}

fn encrypt_bytes(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
    let nonce = localvault_crypto::generate_nonce();
    let ciphertext = localvault_crypto::encrypt(key, &nonce, plaintext, aad)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(24 + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt_bytes(key: &[u8; 32], data: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 24 {
        return Err("Ciphertext too short".to_string());
    }
    let (nonce, ciphertext) = data.split_at(24);
    let mut nonce_arr = [0u8; 24];
    nonce_arr.copy_from_slice(nonce);
    let plaintext = localvault_crypto::decrypt(key, &nonce_arr, ciphertext, aad)
        .map_err(|e| e.to_string())?;
    Ok(plaintext.to_vec())
}

pub fn load_all_revisions(vault: &UnlockedVault) -> Vec<VariableRevision> {
    let rev_path = vault.paths.vault_dir().join("revisions.enc");
    if !rev_path.exists() {
        return Vec::new();
    }

    if let Ok(encrypted_bytes) = fs::read(&rev_path) {
        let aad = b"vault:revisions";
        if let Ok(decrypted) = decrypt_bytes(&vault.vek, &encrypted_bytes, aad) {
            if let Ok(revisions) = serde_json::from_slice::<Vec<VariableRevision>>(&decrypted) {
                return revisions;
            }
        }
    }

    Vec::new()
}

pub fn record_variable_revision(
    vault: &UnlockedVault,
    env_id: &str,
    var_id: &str,
    var_key: &str,
    action: &str,
    previous_value: Option<&str>,
    new_value: Option<&str>,
    author: &str,
) {
    let mut revisions = load_all_revisions(vault);

    let rev = VariableRevision {
        id: Uuid::new_v4().to_string(),
        env_id: env_id.to_string(),
        var_id: var_id.to_string(),
        var_key: var_key.to_string(),
        action: action.to_string(),
        previous_value: previous_value.map(|s| s.to_string()),
        new_value: new_value.map(|s| s.to_string()),
        author: author.to_string(),
        timestamp: now_timestamp(),
    };

    revisions.insert(0, rev);
    if revisions.len() > 1000 {
        revisions.truncate(1000);
    }

    if let Ok(json) = serde_json::to_vec(&revisions) {
        let aad = b"vault:revisions";
        if let Ok(ciphertext) = encrypt_bytes(&vault.vek, &json, aad) {
            let rev_path = vault.paths.vault_dir().join("revisions.enc");
            let _ = atomic_write(&rev_path, &ciphertext);
        }
    }
}

#[tauri::command]
pub async fn list_variable_revisions_cmd(
    env_id: Option<String>,
    state: State<'_, VaultState>,
) -> Result<Vec<VariableRevision>, String> {
    state.with_unlocked(|vault| {
        let mut revisions = load_all_revisions(vault);
        if let Some(ref target_env) = env_id {
            revisions.retain(|r| r.env_id == *target_env);
        }
        Ok(revisions)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rollback_variable_cmd(
    revision_id: String,
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let author_email = super::auth::get_active_session()
        .map(|s| s.email)
        .unwrap_or_else(|| "Local User".to_string());

    let msg = state.with_unlocked(|vault| {
        let revisions = load_all_revisions(vault);
        let rev = revisions
            .iter()
            .find(|r| r.id == revision_id)
            .ok_or_else(|| LvError::Serialization(format!("Revision {revision_id} not found.")))?;

        let eid = EnvId::parse(&rev.env_id).map_err(|e| LvError::Serialization(e.to_string()))?;

        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(rev.env_id.clone()))?;

        let mut env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        let target_var_id = VarId::parse(&rev.var_id).ok();

        match rev.action.as_str() {
            "update" | "rollback" => {
                let prev_val = rev.previous_value.clone().unwrap_or_default();
                if let Some(vid) = target_var_id {
                    let mut found_var_info = None;
                    if let Some(var) = env.variables.iter_mut().find(|v| v.id == vid || v.key == rev.var_key) {
                        let old_val = var.value.clone();
                        var.value = prev_val.clone();
                        var.updated_at = now_timestamp();
                        found_var_info = Some((var.id.to_string_repr(), var.key.clone(), old_val));
                    }

                    if let Some((v_id, v_key, old_val)) = found_var_info {
                        env.save(&entry.record_id, &vault.vek, &vault.paths)?;

                        record_variable_revision(
                            vault,
                            &rev.env_id,
                            &v_id,
                            &v_key,
                            "rollback",
                            Some(&old_val),
                            Some(&prev_val),
                            &author_email,
                        );

                        return Ok(format!("Rolled back '{}' to previous state.", v_key));
                    }
                }
                Err(LvError::Serialization(format!("Variable '{}' no longer exists in environment.", rev.var_key)))
            }
            "create" => {
                if let Some(pos) = env.variables.iter().position(|v| v.key == rev.var_key) {
                    let removed = env.variables.remove(pos);
                    env.save(&entry.record_id, &vault.vek, &vault.paths)?;

                    record_variable_revision(
                        vault,
                        &rev.env_id,
                        &removed.id.to_string_repr(),
                        &removed.key,
                        "rollback",
                        Some(&removed.value),
                        None,
                        &author_email,
                    );

                    return Ok(format!("Deleted newly created variable '{}'.", removed.key));
                }
                Err(LvError::Serialization(format!("Variable '{}' not found to undo creation.", rev.var_key)))
            }
            "delete" => {
                let prev_val = rev.previous_value.clone().unwrap_or_default();
                let restored = localvault_variables::Variable::new(
                    rev.var_key.clone(),
                    prev_val.clone(),
                    localvault_core::VarType::Secret,
                    Some("Restored via rollback".to_string()),
                    vec!["restored".to_string()],
                );

                env.variables.push(restored.clone());
                env.save(&entry.record_id, &vault.vek, &vault.paths)?;

                record_variable_revision(
                    vault,
                    &rev.env_id,
                    &restored.id.to_string_repr(),
                    &restored.key,
                    "rollback",
                    None,
                    Some(&prev_val),
                    &author_email,
                );

                Ok(format!("Restored deleted variable '{}'.", restored.key))
            }
            _ => Err(LvError::Serialization("Unsupported revision action.".to_string())),
        }
    }).map_err(|e| e.to_string())?;

    super::turso::trigger_auto_sync_background();
    Ok(msg)
}
