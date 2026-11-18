use localvault_core::{LvError, LvResult};
use rand::Rng;
use zeroize::Zeroizing;

use crate::aead::{self, KEY_LENGTH, NONCE_LENGTH, TAG_LENGTH};
use crate::nonce::generate_nonce;

/// Generate a new random Vault Encryption Key (VEK).
///
/// The VEK is the root data encryption key for the entire vault.
/// It is generated once during vault creation and never changes
/// (password changes re-wrap the VEK, they don't regenerate it).
pub fn generate_vek() -> Zeroizing<[u8; KEY_LENGTH]> {
    let mut vek = Zeroizing::new([0u8; KEY_LENGTH]);
    rand::rng().fill(vek.as_mut());
    vek
}

/// Wrap (encrypt) the VEK using a Key Encryption Key (KEK).
///
/// Returns (nonce, wrapped_key) where wrapped_key = ciphertext || auth_tag.
/// The wrapped key is 48 bytes (32-byte VEK + 16-byte Poly1305 tag).
///
/// AAD binds the wrapped key to the vault identity and purpose.
pub fn wrap_key(
    vek: &[u8; KEY_LENGTH],
    kek: &[u8; KEY_LENGTH],
    aad: &[u8],
) -> LvResult<([u8; NONCE_LENGTH], Vec<u8>)> {
    let nonce = generate_nonce();
    let wrapped = aead::encrypt(kek, &nonce, vek, aad)?;
    debug_assert_eq!(wrapped.len(), KEY_LENGTH + TAG_LENGTH); // 48 bytes
    Ok((nonce, wrapped))
}

/// Unwrap (decrypt) the VEK using a Key Encryption Key (KEK).
///
/// Returns the decrypted VEK wrapped in `Zeroizing`.
pub fn unwrap_key(
    wrapped: &[u8],
    kek: &[u8; KEY_LENGTH],
    nonce: &[u8; NONCE_LENGTH],
    aad: &[u8],
) -> LvResult<Zeroizing<[u8; KEY_LENGTH]>> {
    let decrypted = aead::decrypt(kek, nonce, wrapped, aad)
        .map_err(|_| LvError::AuthFailed)?;

    if decrypted.len() != KEY_LENGTH {
        return Err(LvError::InvalidKeyLength {
            expected: KEY_LENGTH,
            got: decrypted.len(),
        });
    }

    let mut vek = Zeroizing::new([0u8; KEY_LENGTH]);
    vek.copy_from_slice(&decrypted);
    Ok(vek)
}

/// Generate a password verification blob.
///
/// This is a small encrypted payload using the KEK that allows
/// fast wrong-password detection without attempting full VEK unwrap.
/// The known plaintext is a fixed 16-byte value.
pub fn create_verify_blob(
    kek: &[u8; KEY_LENGTH],
    aad: &[u8],
) -> LvResult<([u8; NONCE_LENGTH], Vec<u8>)> {
    // Known plaintext — not secret, just needs to decrypt successfully
    let known_plaintext = b"LOCALVAULT_VERIFY";
    let nonce = generate_nonce();
    let blob = aead::encrypt(kek, &nonce, known_plaintext, aad)?;
    Ok((nonce, blob))
}

/// Verify a password by attempting to decrypt the verification blob.
///
/// Returns true if the KEK can decrypt the blob (password is correct).
pub fn verify_password(
    kek: &[u8; KEY_LENGTH],
    nonce: &[u8; NONCE_LENGTH],
    blob: &[u8],
    aad: &[u8],
) -> bool {
    aead::decrypt(kek, nonce, blob, aad).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kdf::{derive_kek, KdfParams};
    use crate::nonce::generate_salt;

    #[test]
    fn test_generate_vek() {
        let vek = generate_vek();
        assert_eq!(vek.len(), KEY_LENGTH);
        // VEK should not be all zeros (astronomically unlikely from CSPRNG)
        assert!(vek.iter().any(|&b| b != 0));
    }

    #[test]
    fn test_generate_vek_uniqueness() {
        let vek1 = generate_vek();
        let vek2 = generate_vek();
        assert_ne!(*vek1, *vek2);
    }

    #[test]
    fn test_wrap_unwrap_roundtrip() {
        let vek = generate_vek();
        let kek = generate_vek(); // Using generate_vek for a random 32-byte key
        let aad = b"vault:test-vault-id";

        let (nonce, wrapped) = wrap_key(&vek, &kek, aad).unwrap();
        assert_eq!(wrapped.len(), KEY_LENGTH + TAG_LENGTH); // 48 bytes

        let unwrapped = unwrap_key(&wrapped, &kek, &nonce, aad).unwrap();
        assert_eq!(*vek, *unwrapped);
    }

    #[test]
    fn test_unwrap_wrong_kek() {
        let vek = generate_vek();
        let kek = generate_vek();
        let wrong_kek = generate_vek();
        let aad = b"vault:test";

        let (nonce, wrapped) = wrap_key(&vek, &kek, aad).unwrap();
        let result = unwrap_key(&wrapped, &wrong_kek, &nonce, aad);
        assert!(result.is_err());
    }

    #[test]
    fn test_unwrap_wrong_aad() {
        let vek = generate_vek();
        let kek = generate_vek();
        let aad = b"correct-aad";

        let (nonce, wrapped) = wrap_key(&vek, &kek, aad).unwrap();
        let result = unwrap_key(&wrapped, &kek, &nonce, b"wrong-aad");
        assert!(result.is_err());
    }

    #[test]
    fn test_full_key_hierarchy() {
        // Simulate the complete vault key derivation chain
        let password = b"my-secure-master-password";
        let salt = generate_salt();
        let params = KdfParams::test_params();

        // 1. Derive KEK from password
        let kek = derive_kek(password, &salt, &params).unwrap();

        // 2. Generate VEK
        let vek = generate_vek();

        // 3. Wrap VEK with KEK
        let aad = b"vault:key-wrap";
        let (nonce, wrapped) = wrap_key(&vek, &kek, aad).unwrap();

        // 4. Simulate unlock: derive KEK again, unwrap VEK
        let kek_again = derive_kek(password, &salt, &params).unwrap();
        let unwrapped = unwrap_key(&wrapped, &kek_again, &nonce, aad).unwrap();

        assert_eq!(*vek, *unwrapped, "Full key hierarchy roundtrip must recover the VEK");
    }

    #[test]
    fn test_full_key_hierarchy_wrong_password() {
        let password = b"correct-password";
        let wrong_password = b"wrong-password";
        let salt = generate_salt();
        let params = KdfParams::test_params();

        let kek = derive_kek(password, &salt, &params).unwrap();
        let vek = generate_vek();
        let aad = b"vault:key-wrap";
        let (nonce, wrapped) = wrap_key(&vek, &kek, aad).unwrap();

        // Try with wrong password
        let wrong_kek = derive_kek(wrong_password, &salt, &params).unwrap();
        let result = unwrap_key(&wrapped, &wrong_kek, &nonce, aad);
        assert!(result.is_err(), "Wrong password must fail to unwrap VEK");
    }

    #[test]
    fn test_verify_blob_correct_password() {
        let password = b"test-password";
        let salt = generate_salt();
        let params = KdfParams::test_params();
        let aad = b"vault:verify";

        let kek = derive_kek(password, &salt, &params).unwrap();
        let (nonce, blob) = create_verify_blob(&kek, aad).unwrap();

        // Same password should verify
        let kek_again = derive_kek(password, &salt, &params).unwrap();
        assert!(verify_password(&kek_again, &nonce, &blob, aad));
    }

    #[test]
    fn test_verify_blob_wrong_password() {
        let salt = generate_salt();
        let params = KdfParams::test_params();
        let aad = b"vault:verify";

        let kek = derive_kek(b"correct", &salt, &params).unwrap();
        let (nonce, blob) = create_verify_blob(&kek, aad).unwrap();

        let wrong_kek = derive_kek(b"wrong", &salt, &params).unwrap();
        assert!(!verify_password(&wrong_kek, &nonce, &blob, aad));
    }
}
