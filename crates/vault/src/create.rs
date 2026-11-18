use localvault_core::{
    MIN_PASSWORD_LENGTH, LvError, LvResult, VaultId,
};
use localvault_crypto::{
    derive_kek, generate_nonce, generate_recovery_key, generate_salt, generate_vek,
    recovery::decode_recovery_key, wrap_key, KdfParams,
};
use localvault_crypto::keys::create_verify_blob;
use localvault_storage::{atomic_write, VaultPaths};
use zeroize::Zeroizing;

use crate::header::VaultHeader;
use crate::manifest::Manifest;

#[derive(Debug, Clone)]
pub struct VaultCreated {
    pub vault_id: VaultId,
    pub recovery_key: String,
}

pub fn create_vault(
    paths: &VaultPaths,
    password: &str,
    kdf_params: Option<KdfParams>,
) -> LvResult<VaultCreated> {
    if paths.vault_exists() {
        return Err(LvError::VaultAlreadyExists);
    }

    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(LvError::PasswordTooShort {
            min: MIN_PASSWORD_LENGTH,
        });
    }

    // 1. Initialize directory structure with restrictive permissions
    paths.initialize_directories()?;

    let vault_id = VaultId::new();
    let params = kdf_params.unwrap_or_else(KdfParams::default_params);

    // 2. Generate root Vault Encryption Key (VEK)
    let vek = generate_vek();

    // 3. Derive KEK for master password
    let salt = generate_salt();
    let kek = derive_kek(password.as_bytes(), &salt, &params)?;

    // 4. Wrap VEK with KEK
    let wrap_aad = format!("vault:key-wrap:{}", vault_id.to_string_repr());
    let (wrapped_vek_nonce, wrapped_vek) = wrap_key(&vek, &kek, wrap_aad.as_bytes())?;

    // 5. Create password verification blob
    let verify_aad = format!("vault:verify:{}", vault_id.to_string_repr());
    let (password_verify_nonce, password_verify_blob) =
        create_verify_blob(&kek, verify_aad.as_bytes())?;

    // 6. Generate and setup Recovery Key
    let recovery_key = generate_recovery_key();
    let recovery_bytes = decode_recovery_key(&recovery_key)
        .ok_or_else(|| LvError::KeyDerivationFailed("Failed to encode recovery key".to_string()))?;

    let recovery_salt = generate_salt();
    let recovery_params = params; // use matching KDF parameters
    let recovery_kek = derive_kek(&recovery_bytes, &recovery_salt, &recovery_params)?;

    let recovery_wrap_aad = format!("vault:recovery-wrap:{}", vault_id.to_string_repr());
    let (recovery_wrapped_vek_nonce, recovery_wrapped_vek) =
        wrap_key(&vek, &recovery_kek, recovery_wrap_aad.as_bytes())?;

    // 7. Assemble VaultHeader
    let header = VaultHeader::new(
        vault_id,
        &params,
        salt,
        wrapped_vek_nonce,
        wrapped_vek,
        recovery_salt,
        &recovery_params,
        recovery_wrapped_vek_nonce,
        recovery_wrapped_vek,
        password_verify_nonce,
        password_verify_blob,
    );

    // 8. Write vault.header atomically
    let header_bytes = header.to_bytes()?;
    atomic_write(&paths.header_file(), &header_bytes)?;

    // 9. Create and encrypt initial manifest
    let manifest = Manifest::new(vault_id);
    let manifest_bytes = manifest.encrypt(&vek)?;
    atomic_write(&paths.manifest_file(), &manifest_bytes)?;

    Ok(VaultCreated {
        vault_id,
        recovery_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_create_vault_success() {
        let dir = tempdir().unwrap();
        let paths = VaultPaths::new(dir.path().to_path_buf());

        let res = create_vault(&paths, "super-secure-pass-123", Some(KdfParams::test_params())).unwrap();
        assert!(!res.recovery_key.is_empty());

        assert!(paths.header_file().exists());
        assert!(paths.manifest_file().exists());

        // Attempting to create again must fail with VaultAlreadyExists
        let err = create_vault(&paths, "super-secure-pass-123", Some(KdfParams::test_params()));
        assert!(matches!(err, Err(LvError::VaultAlreadyExists)));
    }

    #[test]
    fn test_create_vault_short_password() {
        let dir = tempdir().unwrap();
        let paths = VaultPaths::new(dir.path().to_path_buf());

        let res = create_vault(&paths, "short", Some(KdfParams::test_params()));
        assert!(matches!(res, Err(LvError::PasswordTooShort { .. })));
    }
}
