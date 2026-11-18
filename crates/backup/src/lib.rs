use localvault_core::{
    now_timestamp, LvError, LvResult, RecordType,
};
use localvault_crypto::{
    decrypt_blob, derive_kek, encrypt_blob, generate_salt, KdfParams,
};
use localvault_storage::{atomic_write, VaultPaths};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFile {
    pub relative_path: String,
    pub content: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupArchive {
    pub version: u32,
    pub created_at: i64,
    pub files: Vec<BackupFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSummary {
    pub file_path: PathBuf,
    pub file_size_bytes: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupVerification {
    pub is_valid: bool,
    pub file_count: usize,
    pub created_at: i64,
}

/// Create an authenticated encrypted backup archive of the entire vault.
pub fn create_encrypted_backup(
    paths: &VaultPaths,
    passphrase: &str,
    destination: Option<PathBuf>,
    kdf_params: Option<KdfParams>,
) -> LvResult<BackupSummary> {
    if !paths.vault_exists() {
        return Err(LvError::VaultNotFound);
    }

    let mut files = Vec::new();

    // 1. Read vault.header
    let header_bytes = fs::read(paths.header_file()).map_err(LvError::Io)?;
    files.push(BackupFile {
        relative_path: "vault.header".to_string(),
        content: header_bytes,
    });

    // 2. Read manifest.enc
    let manifest_bytes = fs::read(paths.manifest_file()).map_err(LvError::Io)?;
    files.push(BackupFile {
        relative_path: "manifest.enc".to_string(),
        content: manifest_bytes,
    });

    // 3. Read all records in records/
    if paths.records_dir().exists() {
        for entry in fs::read_dir(paths.records_dir()).map_err(LvError::Io)? {
            let entry = entry.map_err(LvError::Io)?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("enc") {
                let fname = path.file_name().unwrap().to_string_lossy().to_string();
                let content = fs::read(&path).map_err(LvError::Io)?;
                files.push(BackupFile {
                    relative_path: format!("records/{}", fname),
                    content,
                });
            }
        }
    }

    let archive = BackupArchive {
        version: 1,
        created_at: now_timestamp(),
        files,
    };

    let archive_bytes = rmp_serde::to_vec(&archive)
        .map_err(|e| LvError::Serialization(format!("Backup archive serialization failed: {e}")))?;

    // Derive backup key from passphrase + salt
    let salt = generate_salt();
    let params = kdf_params.unwrap_or_else(KdfParams::default_params);
    let backup_key = derive_kek(passphrase.as_bytes(), &salt, &params)?;

    // Encrypt archive as RecordType::Backup with salt prepended
    let aad = b"localvault:backup:v1";
    let encrypted_blob = encrypt_blob(&backup_key, RecordType::Backup, &archive_bytes, aad)?;

    // Pack salt + KDF params + encrypted blob
    let mut final_backup_data = Vec::with_capacity(32 + 12 + encrypted_blob.len());
    final_backup_data.extend_from_slice(&salt);
    final_backup_data.extend_from_slice(&params.m_cost.to_le_bytes());
    final_backup_data.extend_from_slice(&params.t_cost.to_le_bytes());
    final_backup_data.extend_from_slice(&params.p_cost.to_le_bytes());
    final_backup_data.extend_from_slice(&encrypted_blob);

    let backup_path = destination.unwrap_or_else(|| {
        let timestamp_str = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        paths.backups_dir().join(format!("{}.lvbackup", timestamp_str))
    });

    atomic_write(&backup_path, &final_backup_data)?;

    let metadata = fs::metadata(&backup_path).map_err(LvError::Io)?;

    Ok(BackupSummary {
        file_path: backup_path,
        file_size_bytes: metadata.len(),
        created_at: archive.created_at,
    })
}

/// Verify an encrypted backup file with the provided passphrase.
pub fn verify_encrypted_backup(
    backup_path: &Path,
    passphrase: &str,
) -> LvResult<BackupVerification> {
    let archive = decrypt_backup_archive(backup_path, passphrase)?;

    Ok(BackupVerification {
        is_valid: true,
        file_count: archive.files.len(),
        created_at: archive.created_at,
    })
}

/// Restore a vault from an encrypted backup archive.
pub fn restore_encrypted_backup(
    backup_path: &Path,
    passphrase: &str,
    target_paths: &VaultPaths,
) -> LvResult<usize> {
    let archive = decrypt_backup_archive(backup_path, passphrase)?;

    target_paths.initialize_directories()?;

    let mut restored_count = 0;
    for file in archive.files {
        let dest = target_paths.vault_dir().join(&file.relative_path);
        if let Some(parent) = dest.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(LvError::Io)?;
            }
        }
        atomic_write(&dest, &file.content)?;
        restored_count += 1;
    }

    Ok(restored_count)
}

fn decrypt_backup_archive(backup_path: &Path, passphrase: &str) -> LvResult<BackupArchive> {
    let data = fs::read(backup_path).map_err(LvError::Io)?;

    if data.len() < 32 + 12 + 38 {
        return Err(LvError::InvalidFormat("Backup file too small".to_string()));
    }

    let mut salt = [0u8; 32];
    salt.copy_from_slice(&data[0..32]);

    let m_cost = u32::from_le_bytes(data[32..36].try_into().unwrap());
    let t_cost = u32::from_le_bytes(data[36..40].try_into().unwrap());
    let p_cost = u32::from_le_bytes(data[40..44].try_into().unwrap());

    let params = KdfParams {
        m_cost,
        t_cost,
        p_cost,
    };

    let backup_key = derive_kek(passphrase.as_bytes(), &salt, &params)?;

    let aad = b"localvault:backup:v1";
    let blob_bytes = &data[44..];
    let decrypted_bytes = decrypt_blob(&backup_key, RecordType::Backup, blob_bytes, aad)
        .map_err(|_| LvError::AuthFailed)?;

    rmp_serde::from_slice(&decrypted_bytes)
        .map_err(|e| LvError::Deserialization(format!("Failed to parse backup archive: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use localvault_vault::create_vault;
    use tempfile::tempdir;

    #[test]
    fn test_backup_and_restore_roundtrip() {
        let src_dir = tempdir().unwrap();
        let src_paths = VaultPaths::new(src_dir.path().to_path_buf());
        create_vault(&src_paths, "vault-password-123", Some(KdfParams::test_params())).unwrap();

        let backup_dir = tempdir().unwrap();
        let backup_file = backup_dir.path().join("test.lvbackup");
        let passphrase = "backup-passphrase-xyz";

        // 1. Create backup
        let summary = create_encrypted_backup(
            &src_paths,
            passphrase,
            Some(backup_file.clone()),
            Some(KdfParams::test_params()),
        )
        .unwrap();
        assert!(summary.file_size_bytes > 0);

        // 2. Verify backup
        let verification = verify_encrypted_backup(&backup_file, passphrase).unwrap();
        assert!(verification.is_valid);
        assert!(verification.file_count >= 2); // header and manifest

        // 3. Restore to a new location
        let dest_dir = tempdir().unwrap();
        let dest_paths = VaultPaths::new(dest_dir.path().to_path_buf());
        let restored = restore_encrypted_backup(&backup_file, passphrase, &dest_paths).unwrap();
        assert!(restored >= 2);
        assert!(dest_paths.header_file().exists());
        assert!(dest_paths.manifest_file().exists());
    }
}
