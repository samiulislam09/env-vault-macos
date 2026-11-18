use localvault_core::{LvError, LvResult, RecordId};
use std::fs;
use std::path::PathBuf;

use crate::permissions::restrict_dir_permissions;

/// Layout manager for all LocalVault filesystem paths.
#[derive(Debug, Clone)]
pub struct VaultPaths {
    pub root_dir: PathBuf,
}

impl VaultPaths {
    pub fn new(root_dir: PathBuf) -> Self {
        Self { root_dir }
    }

    /// Resolve default application data directory on macOS/Linux.
    pub fn default_vault_dir() -> LvResult<PathBuf> {
        #[cfg(target_os = "macos")]
        {
            if let Some(home) = std::env::var_os("HOME") {
                let p = PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("com.localvault.app");
                return Ok(p);
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
                return Ok(PathBuf::from(data_home).join("localvault"));
            } else if let Some(home) = std::env::var_os("HOME") {
                return Ok(PathBuf::from(home).join(".local").join("share").join("localvault"));
            }
        }

        Err(LvError::PathResolution)
    }

    /// Primary vault directory containing header, manifest, records, journal.
    pub fn vault_dir(&self) -> PathBuf {
        self.root_dir.join("vault")
    }

    /// Path to `vault.header`
    pub fn header_file(&self) -> PathBuf {
        self.vault_dir().join("vault.header")
    }

    /// Path to `manifest.enc`
    pub fn manifest_file(&self) -> PathBuf {
        self.vault_dir().join("manifest.enc")
    }

    /// Path to records directory
    pub fn records_dir(&self) -> PathBuf {
        self.vault_dir().join("records")
    }

    /// Path to a specific encrypted record file
    pub fn record_file(&self, record_id: &RecordId) -> PathBuf {
        self.records_dir()
            .join(format!("{}.enc", record_id.to_string_repr()))
    }

    /// Path to write-ahead journal directory
    pub fn journal_dir(&self) -> PathBuf {
        self.vault_dir().join("journal")
    }

    /// Path to encrypted backups directory
    pub fn backups_dir(&self) -> PathBuf {
        self.root_dir.join("backups")
    }

    /// Path to preferences / configuration directory
    pub fn config_dir(&self) -> PathBuf {
        self.root_dir.join("config")
    }

    /// Path to logs directory
    pub fn logs_dir(&self) -> PathBuf {
        self.root_dir.join("logs")
    }

    /// Path to lock file
    pub fn lock_file(&self) -> PathBuf {
        self.vault_dir().join("vault.lock")
    }

    /// Check if a vault already exists at this location.
    pub fn vault_exists(&self) -> bool {
        self.header_file().exists()
    }

    /// Initialize the vault directory tree with owner-only (0o700) permissions.
    pub fn initialize_directories(&self) -> LvResult<()> {
        let dirs = [
            &self.root_dir,
            &self.vault_dir(),
            &self.records_dir(),
            &self.journal_dir(),
            &self.backups_dir(),
            &self.config_dir(),
            &self.logs_dir(),
        ];

        for dir in dirs {
            if !dir.exists() {
                fs::create_dir_all(dir).map_err(LvError::Io)?;
            }
            restrict_dir_permissions(dir)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_vault_paths_initialization() {
        let dir = tempdir().unwrap();
        let paths = VaultPaths::new(dir.path().to_path_buf());

        assert!(!paths.vault_exists());

        paths.initialize_directories().unwrap();

        assert!(paths.vault_dir().exists());
        assert!(paths.records_dir().exists());
        assert!(paths.journal_dir().exists());
        assert!(paths.backups_dir().exists());
        assert!(paths.config_dir().exists());
        assert!(paths.logs_dir().exists());
    }
}
