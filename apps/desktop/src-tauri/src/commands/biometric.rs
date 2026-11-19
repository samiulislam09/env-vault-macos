use std::path::PathBuf;
use std::process::Command;
use tauri::State;
use localvault_vault::VaultState;

const SERVICE_NAME: &str = "com.localvault.app";

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BiometricStatus {
    pub is_available: bool,
    pub is_enrolled: bool,
    pub platform: String,
}

#[cfg(target_os = "macos")]
fn get_touchid_helper_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p1 = parent.join("bin/localvault-touchid");
            if p1.exists() {
                return p1;
            }
            let p2 = parent.join("localvault-touchid");
            if p2.exists() {
                return p2;
            }
        }
    }

    let dev_bin = PathBuf::from("/Volumes/work/personal/env-vault/tauri-app/apps/desktop/src-tauri/bin/localvault-touchid");
    if dev_bin.exists() {
        return dev_bin;
    }

    PathBuf::from("/tmp/localvault-touchid")
}

#[cfg(target_os = "macos")]
fn check_touchid_available() -> bool {
    let helper = get_touchid_helper_path();
    if !helper.exists() {
        return false;
    }
    let res = Command::new(&helper).arg("--check").output();
    if let Ok(out) = res {
        let s = String::from_utf8_lossy(&out.stdout);
        return s.contains("AVAILABLE");
    }
    false
}

#[cfg(target_os = "macos")]
fn prompt_touchid_auth(reason: &str) -> Result<(), String> {
    let helper = get_touchid_helper_path();
    if !helper.exists() {
        return Err("Touch ID helper binary not found. Please rebuild.".to_string());
    }

    let output = Command::new(&helper)
        .arg(reason)
        .output()
        .map_err(|e| format!("Failed to prompt Touch ID: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let msg = if err.trim().is_empty() {
            "Touch ID cancelled or fingerprint not recognized.".to_string()
        } else {
            err.trim().to_string()
        };
        return Err(msg);
    }

    Ok(())
}

#[tauri::command]
pub async fn biometric_get_status_cmd(user_id: Option<String>) -> Result<BiometricStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let is_available = check_touchid_available();
        let is_enrolled = if let Some(uid) = user_id {
            check_keychain_has_credential(&uid)
        } else {
            false
        };

        Ok(BiometricStatus {
            is_available,
            is_enrolled,
            platform: "macos".to_string(),
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(BiometricStatus {
            is_available: false,
            is_enrolled: false,
            platform: std::env::consts::OS.to_string(),
        })
    }
}

#[tauri::command]
pub async fn biometric_enable_cmd(
    user_id: String,
    password: String,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // 1. Prompt native Touch ID sensor
        tokio::task::spawn_blocking(|| {
            prompt_touchid_auth("Touch ID Sensor: Touch to enable biometric unlock for LocalVault")
        })
        .await
        .map_err(|e| e.to_string())??;

        // 2. Save credentials in macOS Keychain
        let output = Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s", SERVICE_NAME,
                "-a", &user_id,
                "-w", &password,
                "-l", "LocalVault Biometric Master Key",
            ])
            .output()
            .map_err(|e| format!("Failed to access Keychain: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Keychain error: {stderr}"));
        }

        Ok(true)
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Biometric unlock is only supported on macOS currently.".to_string())
    }
}

#[tauri::command]
pub async fn biometric_disable_cmd(user_id: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("security")
            .args([
                "delete-generic-password",
                "-s", SERVICE_NAME,
                "-a", &user_id,
            ])
            .output();

        Ok(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub async fn biometric_unlock_cmd(
    email: String,
    user_id: String,
    state: State<'_, VaultState>,
) -> Result<super::auth::AuthResponse, String> {
    #[cfg(target_os = "macos")]
    {
        // 1. Pop up native Touch ID sensor dialog on macOS
        tokio::task::spawn_blocking(|| {
            prompt_touchid_auth("Touch ID: Touch the sensor to unlock LocalVault")
        })
        .await
        .map_err(|e| e.to_string())??;

        // 2. Retrieve password from macOS Keychain
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s", SERVICE_NAME,
                "-a", &user_id,
                "-w",
            ])
            .output()
            .map_err(|e| format!("Failed to invoke Keychain: {e}"))?;

        if !output.status.success() {
            return Err("Could not retrieve credential from Keychain. Please enter master password.".to_string());
        }

        let password = String::from_utf8(output.stdout)
            .map_err(|e| e.to_string())?
            .trim()
            .to_string();

        if password.is_empty() {
            return Err("No biometric credential stored. Please enter master password.".to_string());
        }

        // 3. Delegate to secure vault unlock
        super::auth::auth_login_cmd(email, password, state).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Biometric unlock is not supported on this platform.".to_string())
    }
}

#[cfg(target_os = "macos")]
fn check_keychain_has_credential(user_id: &str) -> bool {
    let status = Command::new("security")
        .args([
            "find-generic-password",
            "-s", SERVICE_NAME,
            "-a", user_id,
        ])
        .output();

    status.map(|o| o.status.success()).unwrap_or(false)
}
