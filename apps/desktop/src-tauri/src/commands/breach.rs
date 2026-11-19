use localvault_core::{EnvId, LvError};
use localvault_environments::EnvironmentRecord;
use localvault_vault::VaultState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct BreachResult {
    pub breached: bool,
    pub count: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyBreachResult {
    pub key: String,
    pub breached: bool,
    pub count: u64,
}

fn sha1_hex(input: &str) -> String {
    let digest = ring::digest::digest(&ring::digest::SHA1_FOR_LEGACY_USE_ONLY, input.as_bytes());
    digest
        .as_ref()
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect()
}

pub async fn query_hibp_k_anonymity(secret: &str) -> Result<u64, String> {
    if secret.trim().is_empty() {
        return Ok(0);
    }

    let full_hash = sha1_hex(secret);
    if full_hash.len() < 5 {
        return Ok(0);
    }

    let prefix = &full_hash[..5];
    let suffix = &full_hash[5..];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://api.pwnedpasswords.com/range/{}", prefix);
    let resp = client
        .get(&url)
        .header("User-Agent", "LocalVault-Desktop-App")
        .header("Add-Padding", "true")
        .send()
        .await
        .map_err(|e| format!("Failed to reach breach database: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Breach database returned HTTP {}", resp.status()));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read breach response: {}", e))?;

    for line in text.lines() {
        let parts: Vec<&str> = line.trim().split(':').collect();
        if parts.len() == 2 && parts[0].eq_ignore_ascii_case(suffix) {
            let count = parts[1].parse::<u64>().unwrap_or(0);
            return Ok(count);
        }
    }

    Ok(0)
}

#[tauri::command]
pub async fn check_secret_compromise_cmd(secret: String) -> Result<BreachResult, String> {
    let count = query_hibp_k_anonymity(&secret).await?;
    Ok(BreachResult {
        breached: count > 0,
        count,
    })
}

#[tauri::command]
pub async fn scan_environment_breaches_cmd(
    env_id: String,
    state: State<'_, VaultState>,
) -> Result<Vec<KeyBreachResult>, String> {
    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;

    // Extract secret values while holding vault lock
    let key_val_pairs: Vec<(String, String)> = state
        .with_unlocked(|vault| {
            let entry = vault
                .manifest
                .environments
                .iter()
                .find(|e| e.id == eid)
                .ok_or_else(|| LvError::EnvironmentNotFound(env_id.clone()))?;

            let env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

            let pairs = env
                .variables
                .iter()
                .filter(|v| !v.value.trim().is_empty())
                .map(|v| (v.key.clone(), v.value.clone()))
                .collect();

            Ok(pairs)
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    // Cache prefix queries locally so we don't duplicate network calls
    let mut prefix_cache: HashMap<String, String> = HashMap::new();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    for (key, val) in key_val_pairs {
        let full_hash = sha1_hex(&val);
        let prefix = &full_hash[..5];
        let suffix = &full_hash[5..];

        let body = if let Some(cached) = prefix_cache.get(prefix) {
            cached.clone()
        } else {
            let url = format!("https://api.pwnedpasswords.com/range/{}", prefix);
            match client
                .get(&url)
                .header("User-Agent", "LocalVault-Desktop-App")
                .header("Add-Padding", "true")
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    let text = resp.text().await.unwrap_or_default();
                    prefix_cache.insert(prefix.to_string(), text.clone());
                    text
                }
                _ => String::new(),
            }
        };

        let mut count = 0;
        for line in body.lines() {
            let parts: Vec<&str> = line.trim().split(':').collect();
            if parts.len() == 2 && parts[0].eq_ignore_ascii_case(suffix) {
                count = parts[1].parse::<u64>().unwrap_or(0);
                break;
            }
        }

        results.push(KeyBreachResult {
            key,
            breached: count > 0,
            count,
        });
    }

    Ok(results)
}
