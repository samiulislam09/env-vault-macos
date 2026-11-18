use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{Aead, KeyInit, Payload},
};
use localvault_core::{LvError, LvResult};
use zeroize::Zeroizing;

/// Key length for XChaCha20-Poly1305 (256-bit).
pub const KEY_LENGTH: usize = 32;

/// Nonce length for XChaCha20-Poly1305 (192-bit / 24 bytes).
pub const NONCE_LENGTH: usize = 24;

/// Authentication tag length (Poly1305).
pub const TAG_LENGTH: usize = 16;

/// Encrypt plaintext using XChaCha20-Poly1305 with authenticated additional data (AAD).
///
/// # Arguments
/// * `key` - 256-bit encryption key
/// * `nonce` - 192-bit nonce (must be unique per encryption with the same key)
/// * `plaintext` - Data to encrypt
/// * `aad` - Additional authenticated data (bound to ciphertext but not encrypted)
///
/// # Returns
/// Ciphertext with appended Poly1305 authentication tag (ciphertext.len() = plaintext.len() + 16)
pub fn encrypt(
    key: &[u8; KEY_LENGTH],
    nonce: &[u8; NONCE_LENGTH],
    plaintext: &[u8],
    aad: &[u8],
) -> LvResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| LvError::EncryptionFailed(format!("Invalid key: {e}")))?;

    let xnonce = XNonce::from_slice(nonce);

    let payload = Payload {
        msg: plaintext,
        aad,
    };

    cipher
        .encrypt(xnonce, payload)
        .map_err(|e| LvError::EncryptionFailed(format!("XChaCha20-Poly1305 encryption failed: {e}")))
}

/// Decrypt ciphertext using XChaCha20-Poly1305 with authenticated additional data (AAD).
///
/// # Arguments
/// * `key` - 256-bit encryption key (must match the key used for encryption)
/// * `nonce` - 192-bit nonce (must match the nonce used for encryption)
/// * `ciphertext` - Ciphertext with appended authentication tag
/// * `aad` - Additional authenticated data (must match the AAD used for encryption)
///
/// # Returns
/// Decrypted plaintext wrapped in `Zeroizing` for automatic memory clearing
pub fn decrypt(
    key: &[u8; KEY_LENGTH],
    nonce: &[u8; NONCE_LENGTH],
    ciphertext: &[u8],
    aad: &[u8],
) -> LvResult<Zeroizing<Vec<u8>>> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| LvError::DecryptionFailed(format!("Invalid key: {e}")))?;

    let xnonce = XNonce::from_slice(nonce);

    let payload = Payload {
        msg: ciphertext,
        aad,
    };

    let plaintext = cipher
        .decrypt(xnonce, payload)
        .map_err(|_| LvError::DecryptionFailed(
            "Decryption failed — wrong key, corrupted data, or tampered ciphertext".to_string(),
        ))?;

    Ok(Zeroizing::new(plaintext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nonce::generate_nonce;

    fn test_key() -> [u8; KEY_LENGTH] {
        let mut key = [0u8; KEY_LENGTH];
        key[0] = 0x42;
        key[31] = 0xFF;
        key
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = b"DATABASE_URL=postgres://localhost:5432/mydb";
        let aad = b"v1:record:some-uuid";

        let ciphertext = encrypt(&key, &nonce, plaintext, aad).unwrap();
        assert_ne!(ciphertext.as_slice(), plaintext.as_slice());
        assert_eq!(ciphertext.len(), plaintext.len() + TAG_LENGTH);

        let decrypted = decrypt(&key, &nonce, &ciphertext, aad).unwrap();
        assert_eq!(decrypted.as_slice(), plaintext.as_slice());
    }

    #[test]
    fn test_decrypt_wrong_key() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = b"secret-value";
        let aad = b"aad";

        let ciphertext = encrypt(&key, &nonce, plaintext, aad).unwrap();

        let mut wrong_key = test_key();
        wrong_key[0] = 0x00;

        let result = decrypt(&wrong_key, &nonce, &ciphertext, aad);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_wrong_nonce() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = b"secret-value";
        let aad = b"aad";

        let ciphertext = encrypt(&key, &nonce, plaintext, aad).unwrap();

        let wrong_nonce = generate_nonce();
        let result = decrypt(&key, &wrong_nonce, &ciphertext, aad);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_wrong_aad() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = b"secret-value";
        let aad = b"correct-aad";

        let ciphertext = encrypt(&key, &nonce, plaintext, aad).unwrap();

        let result = decrypt(&key, &nonce, &ciphertext, b"wrong-aad");
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_tampered_ciphertext() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = b"secret-value";
        let aad = b"aad";

        let mut ciphertext = encrypt(&key, &nonce, plaintext, aad).unwrap();

        // Tamper with one byte
        if let Some(byte) = ciphertext.first_mut() {
            *byte ^= 0xFF;
        }

        let result = decrypt(&key, &nonce, &ciphertext, aad);
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypt_empty_plaintext() {
        let key = test_key();
        let nonce = generate_nonce();
        let aad = b"aad";

        let ciphertext = encrypt(&key, &nonce, b"", aad).unwrap();
        assert_eq!(ciphertext.len(), TAG_LENGTH); // Only the auth tag

        let decrypted = decrypt(&key, &nonce, &ciphertext, aad).unwrap();
        assert!(decrypted.is_empty());
    }

    #[test]
    fn test_encrypt_empty_aad() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = b"data";

        let ciphertext = encrypt(&key, &nonce, plaintext, b"").unwrap();
        let decrypted = decrypt(&key, &nonce, &ciphertext, b"").unwrap();
        assert_eq!(decrypted.as_slice(), plaintext.as_slice());
    }

    #[test]
    fn test_ciphertext_indistinguishable() {
        let key = test_key();
        let nonce1 = generate_nonce();
        let nonce2 = generate_nonce();
        let plaintext = b"same-plaintext";
        let aad = b"aad";

        let ct1 = encrypt(&key, &nonce1, plaintext, aad).unwrap();
        let ct2 = encrypt(&key, &nonce2, plaintext, aad).unwrap();

        assert_ne!(ct1, ct2, "Different nonces must produce different ciphertext");
    }

    #[test]
    fn test_large_plaintext() {
        let key = test_key();
        let nonce = generate_nonce();
        let plaintext = vec![0xABu8; 100_000]; // 100 KB
        let aad = b"large-payload";

        let ciphertext = encrypt(&key, &nonce, &plaintext, aad).unwrap();
        let decrypted = decrypt(&key, &nonce, &ciphertext, aad).unwrap();
        assert_eq!(decrypted.as_slice(), plaintext.as_slice());
    }
}
