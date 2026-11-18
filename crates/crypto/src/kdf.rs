use argon2::{Argon2, Algorithm, Version, Params};
use localvault_core::{LvError, LvResult};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

/// Key length for the Key Encryption Key (KEK) derived from Argon2id.
pub const KEK_LENGTH: usize = 32;

/// Argon2id key derivation parameters.
/// Stored in the vault header so the vault can be unlocked with the same parameters.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct KdfParams {
    /// Memory cost in KiB.
    pub m_cost: u32,
    /// Time cost (number of iterations).
    pub t_cost: u32,
    /// Parallelism (number of lanes).
    pub p_cost: u32,
}

impl KdfParams {
    /// Default parameters targeting ~0.5-1s on modern hardware.
    /// 64 MiB memory, 3 iterations, 4 lanes.
    pub fn default_params() -> Self {
        Self {
            m_cost: 65536, // 64 MiB
            t_cost: 3,
            p_cost: 4,
        }
    }

    /// Lower-cost parameters for testing.
    #[cfg(test)]
    pub fn test_params() -> Self {
        Self {
            m_cost: 1024, // 1 MiB
            t_cost: 1,
            p_cost: 1,
        }
    }
}

impl Default for KdfParams {
    fn default() -> Self {
        Self::default_params()
    }
}

/// Derive a Key Encryption Key (KEK) from a password and salt using Argon2id.
///
/// Returns a 256-bit key wrapped in `Zeroizing` for automatic memory clearing.
pub fn derive_kek(
    password: &[u8],
    salt: &[u8; 32],
    params: &KdfParams,
) -> LvResult<Zeroizing<[u8; KEK_LENGTH]>> {
    let argon2_params = Params::new(
        params.m_cost,
        params.t_cost,
        params.p_cost,
        Some(KEK_LENGTH),
    )
    .map_err(|e| LvError::KeyDerivationFailed(format!("Invalid Argon2 params: {e}")))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);

    let mut kek = Zeroizing::new([0u8; KEK_LENGTH]);
    argon2
        .hash_password_into(password, salt, kek.as_mut())
        .map_err(|e| LvError::KeyDerivationFailed(format!("Argon2id failed: {e}")))?;

    Ok(kek)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nonce::generate_salt;

    #[test]
    fn test_derive_kek_deterministic() {
        let password = b"test-password-123";
        let salt = generate_salt();
        let params = KdfParams::test_params();

        let kek1 = derive_kek(password, &salt, &params).unwrap();
        let kek2 = derive_kek(password, &salt, &params).unwrap();

        assert_eq!(*kek1, *kek2, "Same input must produce same KEK");
    }

    #[test]
    fn test_derive_kek_different_passwords() {
        let salt = generate_salt();
        let params = KdfParams::test_params();

        let kek1 = derive_kek(b"password-one", &salt, &params).unwrap();
        let kek2 = derive_kek(b"password-two", &salt, &params).unwrap();

        assert_ne!(*kek1, *kek2, "Different passwords must produce different KEKs");
    }

    #[test]
    fn test_derive_kek_different_salts() {
        let password = b"same-password";
        let params = KdfParams::test_params();

        let salt1 = generate_salt();
        let salt2 = generate_salt();

        let kek1 = derive_kek(password, &salt1, &params).unwrap();
        let kek2 = derive_kek(password, &salt2, &params).unwrap();

        assert_ne!(*kek1, *kek2, "Different salts must produce different KEKs");
    }

    #[test]
    fn test_derive_kek_output_length() {
        let password = b"test-password";
        let salt = generate_salt();
        let params = KdfParams::test_params();

        let kek = derive_kek(password, &salt, &params).unwrap();
        assert_eq!(kek.len(), KEK_LENGTH);
    }

    #[test]
    fn test_derive_kek_empty_password() {
        // Empty passwords should still work at the crypto level
        // (password policy is enforced at a higher layer)
        let salt = generate_salt();
        let params = KdfParams::test_params();

        let result = derive_kek(b"", &salt, &params);
        assert!(result.is_ok());
    }
}
