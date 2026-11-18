use localvault_core::{LvError, LvResult};
use localvault_crypto::{
    derive_kek, keys::{unwrap_key, verify_password},
    recovery::decode_recovery_key,
};
use localvault_storage::VaultPaths;
use std::fs;

use crate::header::VaultHeader;
use crate::manifest::Manifest;
use crate::state::UnlockedVault;

/// Unlock the vault using the master password.
pub fn unlock_vault(paths: &VaultPaths, password: &str) -> LvResult<UnlockedVault> {
    if !paths.vault_exists() {
        return Err(LvError::VaultNotFound);
    }

    let header_bytes = fs::read(paths.header_file()).map_err(LvError::Io)?;
    let header = VaultHeader::from_bytes(&header_bytes)?;

    let kdf_params = header.kdf_params();
    let kek = derive_kek(password.as_bytes(), &header.salt, &kdf_params)?;

    // Fast password verification
    let verify_aad = format!("vault:verify:{}", header.vault_id.to_string_repr());
    if !verify_password(
        &kek,
        &header.password_verify_nonce,
        &header.password_verify_blob,
        verify_aad.as_bytes(),
    ) {
        return Err(LvError::AuthFailed);
    }

    // Unwrap VEK
    let wrap_aad = format!("vault:key-wrap:{}", header.vault_id.to_string_repr());
    let vek = unwrap_key(
        &header.wrapped_vek,
        &kek,
        &header.wrapped_vek_nonce,
        wrap_aad.as_bytes(),
    )?;

    // Decrypt Manifest
    let manifest_bytes = fs::read(paths.manifest_file()).map_err(LvError::Io)?;
    let manifest = Manifest::decrypt(&manifest_bytes, &vek, &header.vault_id)?;

    Ok(UnlockedVault::new(vek, header, manifest, paths.clone()))
}

/// Unlock the vault using the recovery key.
pub fn unlock_with_recovery(paths: &VaultPaths, recovery_key: &str) -> LvResult<UnlockedVault> {
    if !paths.vault_exists() {
        return Err(LvError::VaultNotFound);
    }

    let recovery_bytes = decode_recovery_key(recovery_key)
        .ok_or(LvError::InvalidRecoveryKey)?;

    let header_bytes = fs::read(paths.header_file()).map_err(LvError::Io)?;
    let header = VaultHeader::from_bytes(&header_bytes)?;

    let recovery_params = header.recovery_kdf_params();
    let recovery_kek = derive_kek(&recovery_bytes, &header.recovery_salt, &recovery_params)?;

    // Unwrap VEK using recovery KEK
    let recovery_wrap_aad = format!("vault:recovery-wrap:{}", header.vault_id.to_string_repr());
    let vek = unwrap_key(
        &header.recovery_wrapped_vek,
        &recovery_kek,
        &header.recovery_wrapped_vek_nonce,
        recovery_wrap_aad.as_bytes(),
    )?;

    // Decrypt Manifest
    let manifest_bytes = fs::read(paths.manifest_file()).map_err(LvError::Io)?;
    let manifest = Manifest::decrypt(&manifest_bytes, &vek, &header.vault_id)?;

    Ok(UnlockedVault::new(vek, header, manifest, paths.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create::create_vault;
    use localvault_crypto::KdfParams;
    use tempfile::tempdir;

    #[test]
    fn test_unlock_vault_with_password() {
        let dir = tempdir().unwrap();
        let paths = VaultPaths::new(dir.path().to_path_buf());
        let password = "master-password-123";

        let created = create_vault(&paths, password, Some(KdfParams::test_params())).unwrap();

        // 1. Successful unlock
        let unlocked = unlock_vault(&paths, password).unwrap();
        assert_eq!(unlocked.header.vault_id, created.vault_id);
        assert_eq!(unlocked.manifest.vault_id, created.vault_id);

        // 2. Failed unlock with wrong password
        let err = unlock_vault(&paths, "wrong-password");
        assert!(matches!(err, Err(LvError::AuthFailed)));
    }

    #[test]
    fn test_unlock_vault_with_recovery_key() {
        let dir = tempdir().unwrap();
        let paths = VaultPaths::new(dir.path().to_path_buf());
        let password = "master-password-123";

        let created = create_vault(&paths, password, Some(KdfParams::test_params())).unwrap();

        // Unlock with recovery key
        let unlocked = unlock_with_recovery(&paths, &created.recovery_key).unwrap();
        assert_eq!(unlocked.header.vault_id, created.vault_id);

        // Failed unlock with wrong recovery key
        let err = unlock_with_recovery(&paths, "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-ZABCD-EFGHI-AAAAA");
        assert!(matches!(err, Err(LvError::AuthFailed)));
    }
}
