use base64::prelude::*;
use localvault_core::{now_timestamp, EnvId, LvError, ProjectId, RecordId, WorkspaceId};
use localvault_environments::EnvironmentRecord;
use localvault_projects::ProjectRecord;
use localvault_storage::atomic_write;
use localvault_vault::{EnvironmentEntry, ProjectEntry, UnlockedVault, VaultState};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::State;
use uuid::Uuid;
use x25519_dalek::{PublicKey, StaticSecret};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedProjectSummary {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub sender_email: String,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedEnvPayload {
    pub name: String,
    pub is_production: bool,
    pub variables: Vec<ExportedVarPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedVarPayload {
    pub key: String,
    pub value: String,
    pub var_type: localvault_core::VarType,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSharePayload {
    pub project_name: String,
    pub project_description: Option<String>,
    pub environments: Vec<ExportedEnvPayload>,
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

/// Retrieve or initialize the user's X25519 asymmetric identity keypair.
pub fn get_or_create_identity_keys(vault: &UnlockedVault) -> Result<(StaticSecret, PublicKey), String> {
    let identity_file = vault.paths.vault_dir().join("identity.enc");
    let aad = b"vault:user-identity-x25519";

    if identity_file.exists() {
        if let Ok(encrypted_bytes) = fs::read(&identity_file) {
            if let Ok(decrypted) = decrypt_bytes(&vault.vek, &encrypted_bytes, aad) {
                if decrypted.len() == 32 {
                    let mut secret_bytes = [0u8; 32];
                    secret_bytes.copy_from_slice(&decrypted);
                    let secret = StaticSecret::from(secret_bytes);
                    let public = PublicKey::from(&secret);
                    return Ok((secret, public));
                }
            }
        }
    }

    // Generate fresh 32-byte secret
    let mut secret_bytes = [0u8; 32];
    rand::rng().fill(&mut secret_bytes);
    let secret = StaticSecret::from(secret_bytes);
    let public = PublicKey::from(&secret);

    // Save encrypted in vault
    let ciphertext = encrypt_bytes(&vault.vek, &secret_bytes, aad)?;
    let _ = atomic_write(&identity_file, &ciphertext);

    Ok((secret, public))
}

#[tauri::command]
pub async fn sharing_publish_identity_cmd(
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let current_user = super::auth::get_active_session()
        .ok_or_else(|| "No active user session. Please log in first.".to_string())?;

    let pub_key_b64 = state.with_unlocked(|vault| {
        let (_, public) = get_or_create_identity_keys(vault).map_err(|e| LvError::Serialization(e))?;
        Ok(BASE64_STANDARD.encode(public.as_bytes()))
    }).map_err(|e| e.to_string())?;

    let turso_cfg = super::turso::get_or_create_config()?;
    if turso_cfg.enabled && !turso_cfg.database_url.is_empty() && !turso_cfg.auth_token.is_empty() {
        let now = now_timestamp();
        let sql = "INSERT OR REPLACE INTO user_public_keys (email, public_key_b64, updated_at) VALUES (?, ?, ?);";
        let args = vec![
            serde_json::json!({ "type": "text", "value": &current_user.email }),
            serde_json::json!({ "type": "text", "value": &pub_key_b64 }),
            serde_json::json!({ "type": "integer", "value": now.to_string() }),
        ];

        let _ = super::turso::execute_turso_pipeline(
            &turso_cfg.database_url,
            &turso_cfg.auth_token,
            vec![(sql, args)],
        ).await;
    }

    Ok(pub_key_b64)
}

#[tauri::command]
pub async fn sharing_share_project_cmd(
    recipient_email: String,
    project_id: String,
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let current_user = super::auth::get_active_session()
        .ok_or_else(|| "No active user session. Please log in first.".to_string())?;

    let clean_recipient = recipient_email.trim().to_lowercase();
    if clean_recipient == current_user.email {
        return Err("You cannot share a project with yourself.".to_string());
    }

    let turso_cfg = super::turso::get_or_create_config()?;
    if !turso_cfg.enabled || turso_cfg.database_url.is_empty() || turso_cfg.auth_token.is_empty() {
        return Err("Turso Cloud Sync must be enabled in Settings to share projects.".to_string());
    }

    // 1. Fetch recipient's public key from Turso
    let get_pk_sql = "SELECT public_key_b64 FROM user_public_keys WHERE email = ?;";
    let get_pk_args = vec![serde_json::json!({ "type": "text", "value": &clean_recipient })];
    let res = super::turso::execute_turso_pipeline(
        &turso_cfg.database_url,
        &turso_cfg.auth_token,
        vec![(get_pk_sql, get_pk_args)],
    ).await?;

    let recipient_pk_b64 = res
        .get("results")
        .and_then(|r| r.get(0))
        .and_then(|r| r.get("response"))
        .and_then(|resp| resp.get("result"))
        .and_then(|res| res.get("rows"))
        .and_then(|rows| rows.get(0))
        .and_then(|row| row.get(0))
        .and_then(|col| col.get("value"))
        .and_then(|val| val.as_str())
        .ok_or_else(|| {
            format!("User '{clean_recipient}' has not registered a public identity yet. They must log into LocalVault first.")
        })?;

    let recipient_pk_bytes = BASE64_STANDARD.decode(recipient_pk_b64).map_err(|e| e.to_string())?;
    if recipient_pk_bytes.len() != 32 {
        return Err("Invalid recipient public key length.".to_string());
    }
    let mut bob_pk_arr = [0u8; 32];
    bob_pk_arr.copy_from_slice(&recipient_pk_bytes);
    let bob_public = PublicKey::from(bob_pk_arr);

    // 2. Export project payload and encrypt with Diffie-Hellman shared key
    let pid = ProjectId::parse(&project_id).map_err(|e| e.to_string())?;

    let (project_name, encrypted_envelope_b64) = state.with_unlocked(|vault| {
        let (alice_secret, _) = get_or_create_identity_keys(vault).map_err(|e| LvError::Serialization(e))?;

        // Compute Diffie-Hellman shared secret
        let shared_secret = alice_secret.diffie_hellman(&bob_public);

        // Find project
        let p_entry = vault
            .manifest
            .projects
            .iter()
            .find(|p| p.id == pid)
            .ok_or_else(|| LvError::ProjectNotFound(project_id.clone()))?;

        let proj_rec = ProjectRecord::load(&p_entry.record_id, &vault.vek, &vault.paths)?;

        // Find environments belonging to project
        let mut envs_payload = Vec::new();
        for e_entry in &vault.manifest.environments {
            if let Ok(env_rec) = EnvironmentRecord::load(&e_entry.record_id, &vault.vek, &vault.paths) {
                if env_rec.project_id == pid {
                    let vars = env_rec.variables.into_iter().map(|v| ExportedVarPayload {
                        key: v.key,
                        value: v.value,
                        var_type: v.var_type,
                        description: v.description,
                        tags: v.tags,
                    }).collect();

                    envs_payload.push(ExportedEnvPayload {
                        name: env_rec.name,
                        is_production: env_rec.is_production,
                        variables: vars,
                    });
                }
            }
        }

        let payload = ProjectSharePayload {
            project_name: proj_rec.name.clone(),
            project_description: proj_rec.description.clone(),
            environments: envs_payload,
        };

        let json = serde_json::to_vec(&payload).map_err(|e| LvError::Serialization(e.to_string()))?;
        let aad = format!("vault:share:{}:{}", current_user.email, clean_recipient);
        let ciphertext = encrypt_bytes(shared_secret.as_bytes(), &json, aad.as_bytes())
            .map_err(|e| LvError::Serialization(e))?;

        Ok((proj_rec.name, BASE64_STANDARD.encode(&ciphertext)))
    }).map_err(|e| e.to_string())?;

    // 3. Write shared project to Turso
    let share_id = Uuid::new_v4().to_string();
    let now = now_timestamp();
    let insert_sql = "INSERT INTO shared_projects (id, project_id, project_name, sender_email, recipient_email, encrypted_envelope_b64, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?);";
    let insert_args = vec![
        serde_json::json!({ "type": "text", "value": &share_id }),
        serde_json::json!({ "type": "text", "value": &project_id }),
        serde_json::json!({ "type": "text", "value": &project_name }),
        serde_json::json!({ "type": "text", "value": &current_user.email }),
        serde_json::json!({ "type": "text", "value": &clean_recipient }),
        serde_json::json!({ "type": "text", "value": &encrypted_envelope_b64 }),
        serde_json::json!({ "type": "integer", "value": now.to_string() }),
    ];

    super::turso::execute_turso_pipeline(
        &turso_cfg.database_url,
        &turso_cfg.auth_token,
        vec![(insert_sql, insert_args)],
    ).await?;

    Ok(format!("Project '{project_name}' shared securely with {clean_recipient} via End-to-End Encryption."))
}

#[tauri::command]
pub async fn sharing_list_received_shares_cmd() -> Result<Vec<SharedProjectSummary>, String> {
    let current_user = super::auth::get_active_session()
        .ok_or_else(|| "No active user session. Please log in first.".to_string())?;

    let turso_cfg = super::turso::get_or_create_config()?;
    if !turso_cfg.enabled || turso_cfg.database_url.is_empty() || turso_cfg.auth_token.is_empty() {
        return Ok(Vec::new());
    }

    let sql = "SELECT id, project_id, project_name, sender_email, status, created_at FROM shared_projects WHERE recipient_email = ? ORDER BY created_at DESC;";
    let args = vec![serde_json::json!({ "type": "text", "value": &current_user.email })];

    let res = super::turso::execute_turso_pipeline(
        &turso_cfg.database_url,
        &turso_cfg.auth_token,
        vec![(sql, args)],
    ).await?;

    let mut list = Vec::new();
    if let Some(rows) = res
        .get("results")
        .and_then(|r| r.get(0))
        .and_then(|r| r.get("response"))
        .and_then(|resp| resp.get("result"))
        .and_then(|res| res.get("rows"))
        .and_then(|r| r.as_array())
    {
        for row in rows {
            if let Some(cols) = row.as_array() {
                let id = cols.get(0).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let pid = cols.get(1).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let pname = cols.get(2).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let sender = cols.get(3).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let status = cols.get(4).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let created_at = cols.get(5).and_then(|c| c.get("value")).and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())));

                if let (Some(id), Some(pid), Some(pname), Some(sender), Some(status), Some(created_at)) = (id, pid, pname, sender, status, created_at) {
                    list.push(SharedProjectSummary {
                        id: id.to_string(),
                        project_id: pid.to_string(),
                        project_name: pname.to_string(),
                        sender_email: sender.to_string(),
                        status: status.to_string(),
                        created_at,
                    });
                }
            }
        }
    }

    Ok(list)
}

#[tauri::command]
pub async fn sharing_accept_share_cmd(
    share_id: String,
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let current_user = super::auth::get_active_session()
        .ok_or_else(|| "No active user session. Please log in first.".to_string())?;

    let turso_cfg = super::turso::get_or_create_config()?;
    if !turso_cfg.enabled || turso_cfg.database_url.is_empty() || turso_cfg.auth_token.is_empty() {
        return Err("Turso Cloud Sync is required to accept shared projects.".to_string());
    }

    // 1. Fetch share details from Turso
    let get_share_sql = "SELECT sender_email, encrypted_envelope_b64, project_name FROM shared_projects WHERE id = ? AND recipient_email = ?;";
    let get_share_args = vec![
        serde_json::json!({ "type": "text", "value": &share_id }),
        serde_json::json!({ "type": "text", "value": &current_user.email }),
    ];

    let res = super::turso::execute_turso_pipeline(
        &turso_cfg.database_url,
        &turso_cfg.auth_token,
        vec![(get_share_sql, get_share_args)],
    ).await?;

    let row = res
        .get("results")
        .and_then(|r| r.get(0))
        .and_then(|r| r.get("response"))
        .and_then(|resp| resp.get("result"))
        .and_then(|res| res.get("rows"))
        .and_then(|rows| rows.get(0))
        .ok_or_else(|| "Share request not found or not addressed to you.".to_string())?;

    let sender_email = row.get(0).and_then(|c| c.get("value")).and_then(|v| v.as_str()).ok_or_else(|| "Missing sender email".to_string())?;
    let envelope_b64 = row.get(1).and_then(|c| c.get("value")).and_then(|v| v.as_str()).ok_or_else(|| "Missing envelope data".to_string())?;

    // 2. Fetch sender's public key
    let get_pk_sql = "SELECT public_key_b64 FROM user_public_keys WHERE email = ?;";
    let get_pk_args = vec![serde_json::json!({ "type": "text", "value": sender_email })];
    let pk_res = super::turso::execute_turso_pipeline(
        &turso_cfg.database_url,
        &turso_cfg.auth_token,
        vec![(get_pk_sql, get_pk_args)],
    ).await?;

    let sender_pk_b64 = pk_res
        .get("results")
        .and_then(|r| r.get(0))
        .and_then(|r| r.get("response"))
        .and_then(|resp| resp.get("result"))
        .and_then(|res| res.get("rows"))
        .and_then(|rows| rows.get(0))
        .and_then(|row| row.get(0))
        .and_then(|col| col.get("value"))
        .and_then(|val| val.as_str())
        .ok_or_else(|| format!("Could not find sender '{sender_email}' public key."))?;

    let sender_pk_bytes = BASE64_STANDARD.decode(sender_pk_b64).map_err(|e| e.to_string())?;
    let mut alice_pk_arr = [0u8; 32];
    alice_pk_arr.copy_from_slice(&sender_pk_bytes);
    let alice_public = PublicKey::from(alice_pk_arr);

    // 3. Decrypt with Diffie-Hellman shared key
    let envelope_bytes = BASE64_STANDARD.decode(envelope_b64).map_err(|e| e.to_string())?;

    let imported_name = state.with_unlocked_mut(|vault| {
        let (bob_secret, _) = get_or_create_identity_keys(vault).map_err(|e| LvError::Serialization(e))?;
        let shared_secret = bob_secret.diffie_hellman(&alice_public);

        let aad = format!("vault:share:{}:{}", sender_email, current_user.email);
        let decrypted_json = decrypt_bytes(shared_secret.as_bytes(), &envelope_bytes, aad.as_bytes())
            .map_err(|e| LvError::Serialization(e))?;

        let payload: ProjectSharePayload = serde_json::from_slice(&decrypted_json)
            .map_err(|e| LvError::Serialization(e.to_string()))?;

        // 4. Create new Project in receiver's vault
        let default_ws_id = vault.manifest.workspaces.first().map(|w| w.id).unwrap_or_else(WorkspaceId::new);

        let proj_id = ProjectId::new();
        let p_record_id = RecordId::new();
        let new_project = ProjectRecord::new(
            proj_id,
            default_ws_id,
            format!("{} (from {})", payload.project_name, sender_email),
            payload.project_description,
            None,
            None,
        );

        new_project.save(&p_record_id, &vault.vek, &vault.paths)?;

        vault.manifest.projects.push(ProjectEntry {
            id: proj_id,
            workspace_id: default_ws_id,
            record_id: p_record_id,
            version: 1,
        });

        // 5. Create each shared environment and variables
        for (i, env_data) in payload.environments.into_iter().enumerate() {
            let env_id = EnvId::new();
            let e_record_id = RecordId::new();
            let mut env_rec = EnvironmentRecord::new(
                env_id,
                proj_id,
                env_data.name,
                None,
                None,
                i == 0,
                env_data.is_production,
            );

            for v in env_data.variables {
                env_rec.variables.push(localvault_variables::Variable::new(
                    v.key,
                    v.value,
                    v.var_type,
                    v.description,
                    v.tags,
                ));
            }

            env_rec.save(&e_record_id, &vault.vek, &vault.paths)?;
            vault.manifest.environments.push(EnvironmentEntry {
                id: env_id,
                project_id: proj_id,
                record_id: e_record_id,
                version: 1,
            });
        }

        let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
        atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

        Ok(new_project.name)
    }).map_err(|e| e.to_string())?;

    // 6. Update status in Turso
    let update_sql = "UPDATE shared_projects SET status = 'accepted' WHERE id = ?;";
    let update_args = vec![serde_json::json!({ "type": "text", "value": &share_id })];
    let _ = super::turso::execute_turso_pipeline(
        &turso_cfg.database_url,
        &turso_cfg.auth_token,
        vec![(update_sql, update_args)],
    ).await;

    super::turso::trigger_auto_sync_background();
    Ok(format!("Successfully imported '{imported_name}' into your LocalVault."))
}
