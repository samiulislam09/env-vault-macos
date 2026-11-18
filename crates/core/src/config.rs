use serde::{Deserialize, Serialize};

/// Non-secret application configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Auto-lock timeout in seconds (0 = disabled).
    pub auto_lock_timeout_secs: u64,

    /// Clipboard auto-clear timeout in seconds.
    pub clipboard_clear_timeout_secs: u64,

    /// Theme preference.
    pub theme: Theme,

    /// Whether biometric unlock is enabled.
    pub biometric_enabled: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            auto_lock_timeout_secs: 900, // 15 minutes
            clipboard_clear_timeout_secs: 30,
            theme: Theme::Dark,
            biometric_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}
