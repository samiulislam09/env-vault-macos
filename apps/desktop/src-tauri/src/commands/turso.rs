use base64::prelude::*;
use localvault_core::now_timestamp;
use localvault_storage::{atomic_write, restrict_file_permissions, VaultPaths};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

const DEFAULT_TURSO_URL: &str = "libsql://env-vault-sawon19.aws-ap-southeast-1.turso.io";
const DEFAULT_TURSO_TOKEN: &str = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTUwNjg1NjYsImlkIjoiMDFhMWYyNmItNDEwMS03YTgzLThjNWYtOWUxNDRiNTlkODcyIiwia2lkIjoieFU3TEVjU3N2WGxDTWxYZWxzMkNEa1JOYjk3OUh3amMtaEpDcjZ4T09CMCIsInJpZCI6IjI5ZmViOTMzLTIzZTgtNGJmOC05NTIyLThlYmMxMWYyNDY5MSJ9.Utm3IfWoNkdxxgTX-D2L0y6kGdkeBBIcZxBeOItlbI9wBxVQpHMY5S9x7wILKWWTa8ENErbU2TkEySJKBBo5AA";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoConfig {
    pub enabled: bool,
    pub database_url: String,
    pub auth_token: String,
    pub auto_sync: bool,
    pub last_synced_at: Option<i64>,
}

impl Default for TursoConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            database_url: DEFAULT_TURSO_URL.to_string(),
            auth_token: DEFAULT_TURSO_TOKEN.to_string(),
            auto_sync: true,
            last_synced_at: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoTestResponse {
    pub success: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoSyncResult {
    pub success: bool,
    pub count: usize,
    pub timestamp: i64,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoRemoteStatus {
    pub configured: bool,
    pub record_count: usize,
    pub last_remote_update: Option<i64>,
}

fn config_path() -> Result<PathBuf, String> {
    let paths = VaultPaths::new(VaultPaths::default_vault_dir().map_err(|e| e.to_string())?);
    let dir = paths.config_dir();
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    Ok(dir.join("turso.json"))
}

pub fn get_or_create_config() -> Result<TursoConfig, String> {
    let p = config_path()?;
    if p.exists() {
        let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
        let config: TursoConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(config)
    } else {
        let cfg = TursoConfig::default();
        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        fs::write(&p, json).map_err(|e| e.to_string())?;
        let _ = restrict_file_permissions(&p);
        Ok(cfg)
    }
}

pub fn save_config(cfg: &TursoConfig) -> Result<(), String> {
    let p = config_path()?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| e.to_string())?;
    let _ = restrict_file_permissions(&p);
    Ok(())
}

fn normalize_turso_url(url: &str) -> String {
    let mut clean = url.trim().to_string();
    if clean.starts_with("libsql://") {
        clean = format!("https://{}", &clean["libsql://".len()..]);
    } else if !clean.starts_with("http://") && !clean.starts_with("https://") {
        clean = format!("https://{}", clean);
    }
    clean = clean.trim_end_matches('/').to_string();
    if !clean.ends_with("/v2/pipeline") {
        clean = format!("{}/v2/pipeline", clean);
    }
    clean
}

pub async fn execute_turso_pipeline(
    url: &str,
    token: &str,
    statements: Vec<(&str, Vec<serde_json::Value>)>,
) -> Result<serde_json::Value, String> {
    let endpoint = normalize_turso_url(url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let requests: Vec<serde_json::Value> = statements
        .into_iter()
        .map(|(sql, args)| {
            let mut stmt = serde_json::json!({ "sql": sql });
            if !args.is_empty() {
                stmt["args"] = serde_json::Value::Array(args);
            }
            serde_json::json!({
                "type": "execute",
                "stmt": stmt
            })
        })
        .collect();

    let body = serde_json::json!({ "requests": requests });

    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Turso returned HTTP {status}: {err_text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    // Check for SQL errors in results
    if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
        for res in results {
            if res.get("type").and_then(|t| t.as_str()) == Some("error") {
                let msg = res
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown Turso SQL error");
                return Err(format!("Turso error: {msg}"));
            }
        }
    }

    Ok(json)
}

async fn ensure_table(url: &str, token: &str) -> Result<(), String> {
    let ddl_users = "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, client_salt TEXT NOT NULL, auth_hash TEXT NOT NULL, wrapped_vault_key TEXT NOT NULL, header_json TEXT NOT NULL, created_at INTEGER NOT NULL);";
    let ddl_user_records = "CREATE TABLE IF NOT EXISTS user_vault_records (user_id TEXT NOT NULL, file_type TEXT NOT NULL, file_key TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, file_key));";
    let ddl_vault_sync = "CREATE TABLE IF NOT EXISTS vault_sync (vault_id TEXT NOT NULL, file_type TEXT NOT NULL, file_key TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (vault_id, file_key));";
    execute_turso_pipeline(
        url,
        token,
        vec![
            (ddl_users, vec![]),
            (ddl_user_records, vec![]),
            (ddl_vault_sync, vec![]),
        ],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn turso_get_config_cmd() -> Result<TursoConfig, String> {
    get_or_create_config()
}

#[tauri::command]
pub async fn turso_save_config_cmd(config: TursoConfig) -> Result<(), String> {
    save_config(&config)
}

#[tauri::command]
pub async fn turso_test_connection_cmd(
    url: Option<String>,
    token: Option<String>,
) -> Result<TursoTestResponse, String> {
    let cfg = get_or_create_config()?;
    let db_url = url.unwrap_or(cfg.database_url);
    let db_token = token.unwrap_or(cfg.auth_token);

    if db_url.trim().is_empty() || db_token.trim().is_empty() {
        return Err("Database URL and Auth Token are required".to_string());
    }

    let start = Instant::now();
    ensure_table(&db_url, &db_token).await?;

    let _test_res = execute_turso_pipeline(
        &db_url,
        &db_token,
        vec![("SELECT 1 as test;", vec![])],
    )
    .await?;

    let latency = start.elapsed().as_millis() as u64;

    Ok(TursoTestResponse {
        success: true,
        latency_ms: latency,
        message: format!("Successfully connected to Turso! Latency: {latency}ms"),
    })
}

fn resolve_sync_target() -> Result<(VaultPaths, String, &'static str), String> {
    if let Some(session) = super::auth::get_active_session() {
        let u_paths = super::auth::get_user_paths(&session.user_id)?;
        Ok((u_paths, session.user_id, "user_vault_records"))
    } else {
        let default_dir = VaultPaths::default_vault_dir().map_err(|e| e.to_string())?;
        Ok((VaultPaths::new(default_dir), "default_vault".to_string(), "vault_sync"))
    }
}

#[tauri::command]
pub async fn turso_remote_status_cmd() -> Result<TursoRemoteStatus, String> {
    let cfg = get_or_create_config()?;
    if !cfg.enabled || cfg.database_url.trim().is_empty() || cfg.auth_token.trim().is_empty() {
        return Ok(TursoRemoteStatus {
            configured: false,
            record_count: 0,
            last_remote_update: None,
        });
    }

    let (_, entity_id, table_name) = resolve_sync_target().unwrap_or_else(|_| {
        let p = VaultPaths::new(std::path::PathBuf::from("/"));
        (p, "default_vault".to_string(), "vault_sync")
    });

    let query = if table_name == "user_vault_records" {
        format!("SELECT COUNT(*) as count, MAX(updated_at) as last_updated FROM user_vault_records WHERE user_id = '{entity_id}';")
    } else {
        format!("SELECT COUNT(*) as count, MAX(updated_at) as last_updated FROM vault_sync WHERE vault_id = '{entity_id}';")
    };

    let res = match execute_turso_pipeline(&cfg.database_url, &cfg.auth_token, vec![(&query, vec![])]).await {
        Ok(v) => v,
        Err(_) => {
            return Ok(TursoRemoteStatus {
                configured: true,
                record_count: 0,
                last_remote_update: None,
            });
        }
    };

    let mut count = 0;
    let mut last_updated = None;

    if let Some(rows) = res
        .get("results")
        .and_then(|r| r.get(0))
        .and_then(|r| r.get("response"))
        .and_then(|resp| resp.get("result"))
        .and_then(|res| res.get("rows"))
        .and_then(|r| r.as_array())
    {
        if let Some(first_row) = rows.get(0).and_then(|row| row.as_array()) {
            if let Some(c) = first_row.get(0).and_then(|val| val.get("value")) {
                if let Some(num) = c.as_i64() {
                    count = num as usize;
                } else if let Some(s) = c.as_str() {
                    count = s.parse::<usize>().unwrap_or(0);
                }
            }
            if let Some(u) = first_row.get(1).and_then(|val| val.get("value")) {
                if let Some(num) = u.as_i64() {
                    last_updated = Some(num);
                } else if let Some(s) = u.as_str() {
                    last_updated = s.parse::<i64>().ok();
                }
            }
        }
    }

    Ok(TursoRemoteStatus {
        configured: true,
        record_count: count,
        last_remote_update: last_updated,
    })
}

#[tauri::command]
pub async fn turso_sync_push_cmd() -> Result<TursoSyncResult, String> {
    let mut cfg = get_or_create_config()?;
    if !cfg.enabled {
        return Err("Turso sync is disabled in settings".to_string());
    }

    let (paths, entity_id, table_name) = resolve_sync_target()?;
    if !paths.vault_exists() {
        return Err("No local vault exists to sync".to_string());
    }

    ensure_table(&cfg.database_url, &cfg.auth_token).await?;

    let now = now_timestamp();
    let insert_sql = if table_name == "user_vault_records" {
        "INSERT OR REPLACE INTO user_vault_records (user_id, file_type, file_key, data, updated_at) VALUES (?, ?, ?, ?, ?);"
    } else {
        "INSERT OR REPLACE INTO vault_sync (vault_id, file_type, file_key, data, updated_at) VALUES (?, ?, ?, ?, ?);"
    };

    let mut statements: Vec<(&str, Vec<serde_json::Value>)> = Vec::new();
    let mut pushed_count = 0;

    // 1. vault.header
    let header_path = paths.header_file();
    if header_path.exists() {
        let bytes = fs::read(&header_path).map_err(|e| e.to_string())?;
        let b64 = BASE64_STANDARD.encode(&bytes);
        statements.push((
            insert_sql,
            vec![
                serde_json::json!({ "type": "text", "value": &entity_id }),
                serde_json::json!({ "type": "text", "value": "header" }),
                serde_json::json!({ "type": "text", "value": "vault.header" }),
                serde_json::json!({ "type": "text", "value": b64 }),
                serde_json::json!({ "type": "integer", "value": now.to_string() }),
            ],
        ));
        pushed_count += 1;
    }

    // 2. manifest.enc
    let manifest_path = paths.manifest_file();
    if manifest_path.exists() {
        let bytes = fs::read(&manifest_path).map_err(|e| e.to_string())?;
        let b64 = BASE64_STANDARD.encode(&bytes);
        statements.push((
            insert_sql,
            vec![
                serde_json::json!({ "type": "text", "value": &entity_id }),
                serde_json::json!({ "type": "text", "value": "manifest" }),
                serde_json::json!({ "type": "text", "value": "manifest.enc" }),
                serde_json::json!({ "type": "text", "value": b64 }),
                serde_json::json!({ "type": "integer", "value": now.to_string() }),
            ],
        ));
        pushed_count += 1;
    }

    // 3. records/*.enc
    let records_dir = paths.records_dir();
    if records_dir.exists() {
        if let Ok(entries) = fs::read_dir(&records_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("enc") {
                    if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                        let b64 = BASE64_STANDARD.encode(&bytes);
                        statements.push((
                            insert_sql,
                            vec![
                                serde_json::json!({ "type": "text", "value": &entity_id }),
                                serde_json::json!({ "type": "text", "value": "record" }),
                                serde_json::json!({ "type": "text", "value": file_name }),
                                serde_json::json!({ "type": "text", "value": b64 }),
                                serde_json::json!({ "type": "integer", "value": now.to_string() }),
                            ],
                        ));
                        pushed_count += 1;
                    }
                }
            }
        }
    }

    if statements.is_empty() {
        return Ok(TursoSyncResult {
            success: true,
            count: 0,
            timestamp: now,
            message: "No files found to sync".to_string(),
        });
    }

    execute_turso_pipeline(&cfg.database_url, &cfg.auth_token, statements).await?;

    cfg.last_synced_at = Some(now);
    let _ = save_config(&cfg);

    Ok(TursoSyncResult {
        success: true,
        count: pushed_count,
        timestamp: now,
        message: format!("Successfully pushed {pushed_count} encrypted files to Turso"),
    })
}

#[tauri::command]
pub async fn turso_sync_pull_cmd() -> Result<TursoSyncResult, String> {
    let mut cfg = get_or_create_config()?;
    if !cfg.enabled {
        return Err("Turso sync is disabled in settings".to_string());
    }

    let (paths, entity_id, table_name) = resolve_sync_target()?;
    paths.initialize_directories().map_err(|e| e.to_string())?;

    ensure_table(&cfg.database_url, &cfg.auth_token).await?;

    let query = if table_name == "user_vault_records" {
        format!("SELECT file_type, file_key, data FROM user_vault_records WHERE user_id = '{entity_id}';")
    } else {
        format!("SELECT file_type, file_key, data FROM vault_sync WHERE vault_id = '{entity_id}';")
    };

    let res = execute_turso_pipeline(&cfg.database_url, &cfg.auth_token, vec![(&query, vec![])]).await?;

    let mut pulled_count = 0;
    let now = now_timestamp();

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
                let file_type = cols.get(0).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let file_key = cols.get(1).and_then(|c| c.get("value")).and_then(|v| v.as_str());
                let data_b64 = cols.get(2).and_then(|c| c.get("value")).and_then(|v| v.as_str());

                if let (Some(ft), Some(fk), Some(b64)) = (file_type, file_key, data_b64) {
                    if let Ok(bytes) = BASE64_STANDARD.decode(b64) {
                        let target_path = match ft {
                            "header" => paths.header_file(),
                            "manifest" => paths.manifest_file(),
                            "record" => paths.records_dir().join(fk),
                            _ => continue,
                        };

                        if let Err(e) = atomic_write(&target_path, &bytes) {
                            eprintln!("Failed to write pulled file {fk}: {e}");
                        } else {
                            pulled_count += 1;
                        }
                    }
                }
            }
        }
    }

    if pulled_count == 0 {
        return Ok(TursoSyncResult {
            success: true,
            count: 0,
            timestamp: now,
            message: "No files found on Turso cloud".to_string(),
        });
    }

    cfg.last_synced_at = Some(now);
    let _ = save_config(&cfg);

    Ok(TursoSyncResult {
        success: true,
        count: pulled_count,
        timestamp: now,
        message: format!("Successfully restored {pulled_count} files from Turso cloud"),
    })
}

/// Fire-and-forget background push if auto_sync is enabled
pub fn trigger_auto_sync_background() {
    tokio::spawn(async {
        if let Ok(cfg) = get_or_create_config() {
            if cfg.enabled && cfg.auto_sync && !cfg.database_url.trim().is_empty() && !cfg.auth_token.trim().is_empty() {
                let _ = turso_sync_push_cmd().await;
            }
        }
    });
}
