use base64::prelude::*;
use localvault_core::now_timestamp;
use localvault_crypto::{derive_kek, keys::verify_password};
use localvault_storage::{atomic_write, restrict_dir_permissions, restrict_file_permissions, VaultPaths};
use localvault_vault::{create_vault, unlock_vault, VaultHeader, VaultState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;
use uuid::Uuid;

// In-memory rate limiting against brute-force attacks
static FAILED_ATTEMPTS: Mutex<Option<HashMap<String, (u32, Instant)>>> = Mutex::new(None);

fn check_rate_limit(email: &str) -> Result<(), String> {
    let mut guard = FAILED_ATTEMPTS.lock().map_err(|e| e.to_string())?;
    let map = guard.get_or_insert_with(HashMap::new);
    if let Some((attempts, last_time)) = map.get(email) {
        let elapsed = last_time.elapsed();
        let cooldown = match attempts {
            0..=2 => Duration::from_secs(0),
            3..=4 => Duration::from_secs(3),
            5..=7 => Duration::from_secs(10),
            _ => Duration::from_secs(30),
        };
        if elapsed < cooldown {
            let remaining = (cooldown - elapsed).as_secs() + 1;
            return Err(format!(
                "Too many failed login attempts. Security cooldown active: wait {remaining} seconds."
            ));
        }
    }
    Ok(())
}

fn record_failed_attempt(email: &str) {
    if let Ok(mut guard) = FAILED_ATTEMPTS.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        let entry = map.entry(email.to_string()).or_insert((0, Instant::now()));
        entry.0 += 1;
        entry.1 = Instant::now();
    }
}

fn clear_failed_attempts(email: &str) {
    if let Ok(mut guard) = FAILED_ATTEMPTS.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(email);
        }
    }
}

fn validate_password_strength(password: &str) -> Result<(), String> {
    if password.len() < 10 {
        return Err("Master password must be at least 10 characters long for zero-knowledge security".to_string());
    }

    let common = [
        "password", "123456789", "1234567890", "admin123", "qwerty123", "letmein123",
        "welcome123", "masterpassword", "secret123", "changeme123"
    ];
    let lower = password.to_lowercase();
    for c in common {
        if lower.contains(c) {
            return Err("Password contains common easily guessable words. Please choose a stronger passphrase.".to_string());
        }
    }

    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_number = password.chars().any(|c| c.is_numeric());
    let has_special = password.chars().any(|c| !c.is_alphanumeric());

    if !has_letter || (!has_number && !has_special) {
        return Err("Password must combine letters with at least one number or special character.".to_string());
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSession {
    pub user_id: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedUser {
    pub id: String,
    pub email: String,
    pub client_salt: String,
    pub auth_hash: String,
    pub wrapped_vault_key: String,
    pub header_b64: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAccountSummary {
    pub id: String,
    pub email: String,
    pub has_local_vault: bool,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub user_id: String,
    pub email: String,
    pub recovery_key: Option<String>,
    pub workspace_count: usize,
    pub project_count: usize,
    pub environment_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub is_unlocked: bool,
    pub current_user: Option<UserSession>,
    pub local_accounts: Vec<UserAccountSummary>,
    pub vault_path: String,
}

pub fn get_base_paths() -> Result<VaultPaths, String> {
    let dir = VaultPaths::default_vault_dir().map_err(|e| e.to_string())?;
    Ok(VaultPaths::new(dir))
}

pub fn get_user_paths(user_id: &str) -> Result<VaultPaths, String> {
    let base = get_base_paths()?;
    let user_root = base.root_dir.join("users").join(user_id);
    Ok(VaultPaths::new(user_root))
}

pub fn get_active_session() -> Option<UserSession> {
    let base = get_base_paths().ok()?;
    let path = base.config_dir().join("active_session.json");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            return serde_json::from_str(&content).ok();
        }
    }
    None
}

pub fn save_active_session(session: &UserSession) -> Result<(), String> {
    let base = get_base_paths()?;
    let dir = base.config_dir();
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
        let _ = restrict_dir_permissions(&dir);
    }
    let p = dir.join("active_session.json");
    let json = serde_json::to_string(session).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| e.to_string())?;
    let _ = restrict_file_permissions(&p);
    Ok(())
}

pub fn clear_active_session() {
    if let Ok(base) = get_base_paths() {
        let p = base.config_dir().join("active_session.json");
        let _ = fs::remove_file(p);
    }
}

pub fn load_cached_users() -> Vec<CachedUser> {
    if let Ok(base) = get_base_paths() {
        let p = base.config_dir().join("users_cache.json");
        if p.exists() {
            if let Ok(content) = fs::read_to_string(p) {
                if let Ok(users) = serde_json::from_str::<Vec<CachedUser>>(&content) {
                    return users;
                }
            }
        }
    }
    Vec::new()
}

pub fn save_cached_user(user: &CachedUser) {
    if let Ok(base) = get_base_paths() {
        let dir = base.config_dir();
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
            let _ = restrict_dir_permissions(&dir);
        }
        let p = dir.join("users_cache.json");
        let mut users = load_cached_users();
        users.retain(|u| u.email != user.email);
        users.push(user.clone());
        if let Ok(json) = serde_json::to_string_pretty(&users) {
            let _ = fs::write(&p, json);
            let _ = restrict_file_permissions(&p);
        }
    }
}

#[tauri::command]
pub async fn auth_get_status_cmd(
    state: State<'_, VaultState>,
) -> Result<AuthStatusResponse, String> {
    let base = get_base_paths()?;
    let is_unlocked = state.is_unlocked();
    let current_user = get_active_session();

    let cached = load_cached_users();
    let mut local_accounts = Vec::new();
    for u in cached {
        let u_paths = get_user_paths(&u.id).unwrap_or_else(|_| base.clone());
        let has_local_vault = u_paths.vault_exists();
        local_accounts.push(UserAccountSummary {
            id: u.id,
            email: u.email,
            has_local_vault,
            created_at: u.created_at,
        });
    }

    let active_path = if let Some(ref u) = current_user {
        get_user_paths(&u.user_id)
            .map(|p| p.root_dir.to_string_lossy().to_string())
            .unwrap_or_else(|_| base.root_dir.to_string_lossy().to_string())
    } else {
        base.root_dir.to_string_lossy().to_string()
    };

    Ok(AuthStatusResponse {
        is_unlocked,
        current_user,
        local_accounts,
        vault_path: active_path,
    })
}

#[tauri::command]
pub async fn auth_register_cmd(
    email: String,
    password: String,
    state: State<'_, VaultState>,
) -> Result<AuthResponse, String> {
    let clean_email = email.trim().to_lowercase();
    if clean_email.is_empty() || !clean_email.contains('@') {
        return Err("Please enter a valid email address".to_string());
    }

    // Enforce strict password strength
    validate_password_strength(&password)?;

    let turso_cfg = super::turso::get_or_create_config()?;

    // 1. Check if email already exists in Turso
    if turso_cfg.enabled && !turso_cfg.database_url.is_empty() && !turso_cfg.auth_token.is_empty() {
        let check_sql = "SELECT id FROM users WHERE email = ?;";
        let args = vec![serde_json::json!({ "type": "text", "value": &clean_email })];
        if let Ok(res) = super::turso::execute_turso_pipeline(
            &turso_cfg.database_url,
            &turso_cfg.auth_token,
            vec![(check_sql, args)],
        )
        .await
        {
            if let Some(rows) = res
                .get("results")
                .and_then(|r| r.get(0))
                .and_then(|r| r.get("response"))
                .and_then(|resp| resp.get("result"))
                .and_then(|res| res.get("rows"))
                .and_then(|r| r.as_array())
            {
                if !rows.is_empty() {
                    return Err(format!("An account with {clean_email} already exists. Please log in."));
                }
            }
        }
    }

    let user_id = Uuid::new_v4().to_string();
    let user_paths = get_user_paths(&user_id)?;
    user_paths.initialize_directories().map_err(|e| e.to_string())?;

    // Restrict permissions on new user directory (0o700)
    let _ = restrict_dir_permissions(&user_paths.root_dir);
    let _ = restrict_dir_permissions(&user_paths.vault_dir());
    let _ = restrict_dir_permissions(&user_paths.records_dir());

    // 2. Initialize local vault for this user
    let created = create_vault(&user_paths, &password, None).map_err(|e| e.to_string())?;
    let unlocked = unlock_vault(&user_paths, &password).map_err(|e| e.to_string())?;

    let header_bytes = fs::read(user_paths.header_file()).map_err(|e| e.to_string())?;
    let header = VaultHeader::from_bytes(&header_bytes).map_err(|e| e.to_string())?;

    let client_salt = BASE64_STANDARD.encode(&header.salt);
    let auth_hash = BASE64_STANDARD.encode(&header.password_verify_blob);
    let wrapped_vault_key = BASE64_STANDARD.encode(&header.wrapped_vek);
    let header_b64 = BASE64_STANDARD.encode(&header_bytes);
    let now = now_timestamp();

    // 3. Register on Turso cloud
    if turso_cfg.enabled && !turso_cfg.database_url.is_empty() && !turso_cfg.auth_token.is_empty() {
        let manifest_bytes = fs::read(user_paths.manifest_file()).map_err(|e| e.to_string())?;
        let manifest_b64 = BASE64_STANDARD.encode(&manifest_bytes);

        let user_sql = "INSERT INTO users (id, email, client_salt, auth_hash, wrapped_vault_key, header_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);";
        let user_args = vec![
            serde_json::json!({ "type": "text", "value": &user_id }),
            serde_json::json!({ "type": "text", "value": &clean_email }),
            serde_json::json!({ "type": "text", "value": &client_salt }),
            serde_json::json!({ "type": "text", "value": &auth_hash }),
            serde_json::json!({ "type": "text", "value": &wrapped_vault_key }),
            serde_json::json!({ "type": "text", "value": &header_b64 }),
            serde_json::json!({ "type": "integer", "value": now.to_string() }),
        ];

        let header_sql = "INSERT OR REPLACE INTO user_vault_records (user_id, file_type, file_key, data, updated_at) VALUES (?, ?, ?, ?, ?);";
        let header_args = vec![
            serde_json::json!({ "type": "text", "value": &user_id }),
            serde_json::json!({ "type": "text", "value": "header" }),
            serde_json::json!({ "type": "text", "value": "vault.header" }),
            serde_json::json!({ "type": "text", "value": &header_b64 }),
            serde_json::json!({ "type": "integer", "value": now.to_string() }),
        ];

        let manifest_sql = "INSERT OR REPLACE INTO user_vault_records (user_id, file_type, file_key, data, updated_at) VALUES (?, ?, ?, ?, ?);";
        let manifest_args = vec![
            serde_json::json!({ "type": "text", "value": &user_id }),
            serde_json::json!({ "type": "text", "value": "manifest" }),
            serde_json::json!({ "type": "text", "value": "manifest.enc" }),
            serde_json::json!({ "type": "text", "value": &manifest_b64 }),
            serde_json::json!({ "type": "integer", "value": now.to_string() }),
        ];

        let _ = super::turso::execute_turso_pipeline(
            &turso_cfg.database_url,
            &turso_cfg.auth_token,
            vec![
                (user_sql, user_args),
                (header_sql, header_args),
                (manifest_sql, manifest_args),
            ],
        )
        .await;
    }

    // 4. Save cached user info & session
    let cached = CachedUser {
        id: user_id.clone(),
        email: clean_email.clone(),
        client_salt,
        auth_hash,
        wrapped_vault_key,
        header_b64,
        created_at: now,
    };
    save_cached_user(&cached);

    let session = UserSession {
        user_id: user_id.clone(),
        email: clean_email.clone(),
    };
    save_active_session(&session)?;

    let resp = AuthResponse {
        user_id,
        email: clean_email,
        recovery_key: Some(created.recovery_key),
        workspace_count: unlocked.manifest.workspaces.len(),
        project_count: unlocked.manifest.projects.len(),
        environment_count: unlocked.manifest.environments.len(),
    };

    state.set_unlocked(unlocked).map_err(|e| e.to_string())?;

    Ok(resp)
}

#[tauri::command]
pub async fn auth_login_cmd(
    email: String,
    password: String,
    state: State<'_, VaultState>,
) -> Result<AuthResponse, String> {
    let clean_email = email.trim().to_lowercase();
    if clean_email.is_empty() {
        return Err("Please enter your email address".to_string());
    }

    // Rate-limiting check against automated brute force
    check_rate_limit(&clean_email)?;

    let turso_cfg = super::turso::get_or_create_config()?;

    // 1. Fetch user metadata from Turso (or local cache)
    let mut user_opt: Option<CachedUser> = None;

    if turso_cfg.enabled && !turso_cfg.database_url.is_empty() && !turso_cfg.auth_token.is_empty() {
        let query = "SELECT id, email, client_salt, auth_hash, wrapped_vault_key, header_json, created_at FROM users WHERE email = ?;";
        let args = vec![serde_json::json!({ "type": "text", "value": &clean_email })];
        if let Ok(res) = super::turso::execute_turso_pipeline(
            &turso_cfg.database_url,
            &turso_cfg.auth_token,
            vec![(query, args)],
        )
        .await
        {
            if let Some(rows) = res
                .get("results")
                .and_then(|r| r.get(0))
                .and_then(|r| r.get("response"))
                .and_then(|resp| resp.get("result"))
                .and_then(|res| res.get("rows"))
                .and_then(|r| r.as_array())
            {
                if let Some(row) = rows.get(0).and_then(|r| r.as_array()) {
                    let id = row.get(0).and_then(|c| c.get("value")).and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let em = row.get(1).and_then(|c| c.get("value")).and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let salt = row.get(2).and_then(|c| c.get("value")).and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let hash = row.get(3).and_then(|c| c.get("value")).and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let wrapped = row.get(4).and_then(|c| c.get("value")).and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let hdr_b64 = row.get(5).and_then(|c| c.get("value")).and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let created_at = row.get(6).and_then(|c| c.get("value")).and_then(|v| v.as_i64()).unwrap_or_else(now_timestamp);

                    let cu = CachedUser {
                        id,
                        email: em,
                        client_salt: salt,
                        auth_hash: hash,
                        wrapped_vault_key: wrapped,
                        header_b64: hdr_b64,
                        created_at,
                    };
                    save_cached_user(&cu);
                    user_opt = Some(cu);
                }
            }
        }
    }

    if user_opt.is_none() {
        let cached = load_cached_users();
        user_opt = cached.into_iter().find(|u| u.email == clean_email);
    }

    let user = match user_opt {
        Some(u) => u,
        None => return Err(format!("No account found for {clean_email}")),
    };

    // 2. Decode and verify password using VaultHeader
    let header_bytes = BASE64_STANDARD
        .decode(&user.header_b64)
        .map_err(|e| format!("Failed to decode vault header: {e}"))?;
    let header = VaultHeader::from_bytes(&header_bytes).map_err(|e| e.to_string())?;

    let kdf_params = header.kdf_params();
    let kek = derive_kek(password.as_bytes(), &header.salt, &kdf_params).map_err(|e| e.to_string())?;

    let verify_aad = format!("vault:verify:{}", header.vault_id.to_string_repr());
    if !verify_password(
        &kek,
        &header.password_verify_nonce,
        &header.password_verify_blob,
        verify_aad.as_bytes(),
    ) {
        // Record failed attempt for rate limiting
        record_failed_attempt(&clean_email);
        return Err("Incorrect password. Please try again.".to_string());
    }

    // Password verified! Clear rate limit record
    clear_failed_attempts(&clean_email);

    // 3. Prepare user's local directory
    let user_paths = get_user_paths(&user.id)?;
    user_paths.initialize_directories().map_err(|e| e.to_string())?;

    // Restrict permissions on user directory (0o700)
    let _ = restrict_dir_permissions(&user_paths.root_dir);
    let _ = restrict_dir_permissions(&user_paths.vault_dir());
    let _ = restrict_dir_permissions(&user_paths.records_dir());

    // Write header file locally if missing
    if !user_paths.header_file().exists() {
        atomic_write(&user_paths.header_file(), &header_bytes).map_err(|e| e.to_string())?;
        let _ = restrict_file_permissions(&user_paths.header_file());
    }

    // 4. If records are missing (e.g. Machine 2!), pull all records from Turso
    if !user_paths.manifest_file().exists() && turso_cfg.enabled {
        let pull_sql = "SELECT file_type, file_key, data FROM user_vault_records WHERE user_id = ?;";
        let pull_args = vec![serde_json::json!({ "type": "text", "value": &user.id })];
        if let Ok(res) = super::turso::execute_turso_pipeline(
            &turso_cfg.database_url,
            &turso_cfg.auth_token,
            vec![(pull_sql, pull_args)],
        )
        .await
        {
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
                        let ft = cols.get(0).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                        let fk = cols.get(1).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                        let data = cols.get(2).and_then(|c| c.get("value")).and_then(|v| v.as_str());

                        if let (Some(ft), Some(fk), Some(d)) = (ft, fk, data) {
                            if let Ok(b) = BASE64_STANDARD.decode(d) {
                                let target = match ft {
                                    "header" => user_paths.header_file(),
                                    "manifest" => user_paths.manifest_file(),
                                    "record" => user_paths.records_dir().join(fk),
                                    _ => continue,
                                };
                                let _ = atomic_write(&target, &b);
                                let _ = restrict_file_permissions(&target);
                            }
                        }
                    }
                }
            }
        }
    }

    // 5. Unlock the vault
    let unlocked = unlock_vault(&user_paths, &password).map_err(|e| e.to_string())?;

    let session = UserSession {
        user_id: user.id.clone(),
        email: clean_email.clone(),
    };
    save_active_session(&session)?;

    let resp = AuthResponse {
        user_id: user.id,
        email: clean_email,
        recovery_key: None,
        workspace_count: unlocked.manifest.workspaces.len(),
        project_count: unlocked.manifest.projects.len(),
        environment_count: unlocked.manifest.environments.len(),
    };

    state.set_unlocked(unlocked).map_err(|e| e.to_string())?;

    // Fire background auto-sync to ensure any remote changes are mirrored
    super::turso::trigger_auto_sync_background();

    Ok(resp)
}

#[tauri::command]
pub async fn auth_logout_cmd(state: State<'_, VaultState>) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())?;
    clear_active_session();
    Ok(())
}

#[tauri::command]
pub async fn auth_change_password_cmd(
    old_password: String,
    new_password: String,
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let current_user = get_active_session()
        .ok_or_else(|| "No active user session. Please log in first.".to_string())?;

    validate_password_strength(&new_password)?;

    let user_paths = get_user_paths(&current_user.user_id)?;
    if !user_paths.vault_exists() {
        return Err("User vault not found".to_string());
    }

    // 1. Rotate the password in vault header using envelope re-wrapping
    let updated_header = localvault_vault::rotate_password(
        &user_paths,
        &old_password,
        &new_password,
        None,
    )
    .map_err(|e| format!("Password rotation failed: {e}"))?;

    // 2. Update in-memory unlocked vault if unlocked
    let _ = state.with_unlocked_mut(|vault| {
        vault.header = updated_header.clone();
        Ok(())
    });

    // 3. Update local user cache
    let client_salt = BASE64_STANDARD.encode(&updated_header.salt);
    let auth_hash = BASE64_STANDARD.encode(&updated_header.password_verify_blob);
    let wrapped_vault_key = BASE64_STANDARD.encode(&updated_header.wrapped_vek);
    let header_bytes = updated_header.to_bytes().map_err(|e| e.to_string())?;
    let header_b64 = BASE64_STANDARD.encode(&header_bytes);

    let updated_user = CachedUser {
        id: current_user.user_id.clone(),
        email: current_user.email.clone(),
        client_salt: client_salt.clone(),
        auth_hash: auth_hash.clone(),
        wrapped_vault_key: wrapped_vault_key.clone(),
        header_b64: header_b64.clone(),
        created_at: now_timestamp(),
    };
    save_cached_user(&updated_user);

    // 4. Propagate updated cryptographic envelope to Turso edge DB
    let turso_cfg = super::turso::get_or_create_config()?;
    if turso_cfg.enabled && !turso_cfg.database_url.is_empty() && !turso_cfg.auth_token.is_empty() {
        let now = now_timestamp();
        let update_user_sql = "UPDATE users SET client_salt = ?, auth_hash = ?, wrapped_vault_key = ?, header_json = ? WHERE id = ?;";
        let update_args = vec![
            serde_json::json!({ "type": "text", "value": &client_salt }),
            serde_json::json!({ "type": "text", "value": &auth_hash }),
            serde_json::json!({ "type": "text", "value": &wrapped_vault_key }),
            serde_json::json!({ "type": "text", "value": &header_b64 }),
            serde_json::json!({ "type": "text", "value": &current_user.user_id }),
        ];

        let header_rec_sql = "INSERT OR REPLACE INTO user_vault_records (user_id, file_type, file_key, data, updated_at) VALUES (?, ?, ?, ?, ?);";
        let header_rec_args = vec![
            serde_json::json!({ "type": "text", "value": &current_user.user_id }),
            serde_json::json!({ "type": "text", "value": "header" }),
            serde_json::json!({ "type": "text", "value": "vault.header" }),
            serde_json::json!({ "type": "text", "value": &header_b64 }),
            serde_json::json!({ "type": "integer", "value": now.to_string() }),
        ];

        let _ = super::turso::execute_turso_pipeline(
            &turso_cfg.database_url,
            &turso_cfg.auth_token,
            vec![
                (update_user_sql, update_args),
                (header_rec_sql, header_rec_args),
            ],
        )
        .await;
    }

    Ok("Master password changed and keys rotated successfully.".to_string())
}
