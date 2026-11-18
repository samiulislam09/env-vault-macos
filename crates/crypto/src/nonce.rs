use rand::Rng;

use crate::aead::NONCE_LENGTH;

/// Salt length for Argon2id.
pub const SALT_LENGTH: usize = 32;

/// Generate a cryptographically secure random nonce (192-bit / 24 bytes).
///
/// Uses the OS-backed cryptographically secure RNG.
pub fn generate_nonce() -> [u8; NONCE_LENGTH] {
    let mut nonce = [0u8; NONCE_LENGTH];
    rand::rng().fill(&mut nonce);
    nonce
}

/// Generate a cryptographically secure random salt (256-bit / 32 bytes).
pub fn generate_salt() -> [u8; SALT_LENGTH] {
    let mut salt = [0u8; SALT_LENGTH];
    rand::rng().fill(&mut salt);
    salt
}

/// Generate cryptographically secure random bytes of the specified length.
pub fn generate_random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    rand::rng().fill(bytes.as_mut_slice());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_nonce_length() {
        let nonce = generate_nonce();
        assert_eq!(nonce.len(), NONCE_LENGTH);
    }

    #[test]
    fn test_salt_length() {
        let salt = generate_salt();
        assert_eq!(salt.len(), SALT_LENGTH);
    }

    #[test]
    fn test_nonce_uniqueness() {
        let nonces: Vec<[u8; NONCE_LENGTH]> = (0..10_000).map(|_| generate_nonce()).collect();
        let unique: HashSet<_> = nonces.iter().map(|n| n.to_vec()).collect();
        assert_eq!(nonces.len(), unique.len(), "All generated nonces must be unique");
    }

    #[test]
    fn test_salt_uniqueness() {
        let salts: Vec<[u8; SALT_LENGTH]> = (0..1_000).map(|_| generate_salt()).collect();
        let unique: HashSet<_> = salts.iter().map(|s| s.to_vec()).collect();
        assert_eq!(salts.len(), unique.len(), "All generated salts must be unique");
    }

    #[test]
    fn test_random_bytes_length() {
        for len in [0, 1, 16, 32, 64, 128, 1024] {
            let bytes = generate_random_bytes(len);
            assert_eq!(bytes.len(), len);
        }
    }

    #[test]
    fn test_nonce_not_all_zeros() {
        // While theoretically possible, all-zero nonce from CSPRNG is astronomically unlikely
        let nonce = generate_nonce();
        assert!(nonce.iter().any(|&b| b != 0), "CSPRNG nonce should not be all zeros");
    }
}
