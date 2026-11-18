use localvault_core::{
    now_timestamp, FORMAT_VERSION, MAGIC_BYTES, LvError, LvResult, VaultId,
};
use localvault_crypto::KdfParams;
use serde::{Deserialize, Serialize};

pub const KDF_ARGON2ID: u8 = 0x01;

/// The unencrypted vault header stored in `vault.header`.
/// Contains exclusively cryptographic parameters and wrapped keys.
/// NEVER contains user data, workspace names, project names, or secrets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultHeader {
    pub magic: [u8; 6],
    pub format_version: u8,
    pub vault_id: VaultId,

    // KDF parameters for master password
    pub kdf_algorithm: u8,
    pub kdf_m_cost: u32,
    pub kdf_t_cost: u32,
    pub kdf_p_cost: u32,
    pub salt: [u8; 32],

    // Wrapped VEK (password-derived)
    pub wrapped_vek_nonce: [u8; 24],
    pub wrapped_vek: Vec<u8>, // 48 bytes (32-byte VEK + 16-byte Poly1305 tag)

    // Recovery key parameters
    pub recovery_salt: [u8; 32],
    pub recovery_m_cost: u32,
    pub recovery_t_cost: u32,
    pub recovery_p_cost: u32,
    pub recovery_wrapped_vek_nonce: [u8; 24],
    pub recovery_wrapped_vek: Vec<u8>,

    // Verification blob for fast wrong-password detection
    pub password_verify_nonce: [u8; 24],
    pub password_verify_blob: Vec<u8>,

    pub created_at: i64,
}

impl VaultHeader {
    pub fn new(
        vault_id: VaultId,
        kdf_params: &KdfParams,
        salt: [u8; 32],
        wrapped_vek_nonce: [u8; 24],
        wrapped_vek: Vec<u8>,
        recovery_salt: [u8; 32],
        recovery_params: &KdfParams,
        recovery_wrapped_vek_nonce: [u8; 24],
        recovery_wrapped_vek: Vec<u8>,
        password_verify_nonce: [u8; 24],
        password_verify_blob: Vec<u8>,
    ) -> Self {
        Self {
            magic: *MAGIC_BYTES,
            format_version: FORMAT_VERSION,
            vault_id,
            kdf_algorithm: KDF_ARGON2ID,
            kdf_m_cost: kdf_params.m_cost,
            kdf_t_cost: kdf_params.t_cost,
            kdf_p_cost: kdf_params.p_cost,
            salt,
            wrapped_vek_nonce,
            wrapped_vek,
            recovery_salt,
            recovery_m_cost: recovery_params.m_cost,
            recovery_t_cost: recovery_params.t_cost,
            recovery_p_cost: recovery_params.p_cost,
            recovery_wrapped_vek_nonce,
            recovery_wrapped_vek,
            password_verify_nonce,
            password_verify_blob,
            created_at: now_timestamp(),
        }
    }

    pub fn kdf_params(&self) -> KdfParams {
        KdfParams {
            m_cost: self.kdf_m_cost,
            t_cost: self.kdf_t_cost,
            p_cost: self.kdf_p_cost,
        }
    }

    pub fn recovery_kdf_params(&self) -> KdfParams {
        KdfParams {
            m_cost: self.recovery_m_cost,
            t_cost: self.recovery_t_cost,
            p_cost: self.recovery_p_cost,
        }
    }

    /// Serialize header to bytes using MessagePack.
    pub fn to_bytes(&self) -> LvResult<Vec<u8>> {
        rmp_serde::to_vec(self)
            .map_err(|e| LvError::Serialization(format!("Failed to serialize vault header: {e}")))
    }

    /// Deserialize header from bytes, verifying magic bytes and version.
    pub fn from_bytes(bytes: &[u8]) -> LvResult<Self> {
        let header: Self = rmp_serde::from_slice(bytes).map_err(|e| {
            LvError::Deserialization(format!("Failed to deserialize vault header: {e}"))
        })?;

        if header.magic != *MAGIC_BYTES {
            return Err(LvError::InvalidFormat(
                "Invalid magic bytes in vault header".to_string(),
            ));
        }

        if header.format_version != FORMAT_VERSION {
            return Err(LvError::InvalidFormat(format!(
                "Unsupported vault header version: {}",
                header.format_version
            )));
        }

        Ok(header)
    }
}
