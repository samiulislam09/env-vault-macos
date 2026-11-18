use localvault_core::{
    now_timestamp, EnvId, LvError, LvResult, ProjectId, RecordId, RecordType, VaultId,
    WorkspaceId,
};
use localvault_crypto::{decrypt_blob, encrypt_blob};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub id: WorkspaceId,
    pub record_id: RecordId,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub id: ProjectId,
    pub workspace_id: WorkspaceId,
    pub record_id: RecordId,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentEntry {
    pub id: EnvId,
    pub project_id: ProjectId,
    pub record_id: RecordId,
    pub version: u32,
}

/// The encrypted manifest that indexes all workspaces, projects, and environments in the vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub vault_id: VaultId,
    pub workspaces: Vec<WorkspaceEntry>,
    pub projects: Vec<ProjectEntry>,
    pub environments: Vec<EnvironmentEntry>,
    pub record_count: u32,
    pub last_modified: i64,
    pub sequence_number: u64,
}

impl Manifest {
    pub fn new(vault_id: VaultId) -> Self {
        Self {
            version: 1,
            vault_id,
            workspaces: Vec::new(),
            projects: Vec::new(),
            environments: Vec::new(),
            record_count: 0,
            last_modified: now_timestamp(),
            sequence_number: 1,
        }
    }

    /// Construct Authenticated Additional Data (AAD) for the manifest.
    pub fn aad(vault_id: &VaultId) -> Vec<u8> {
        let mut aad = Vec::with_capacity(18);
        aad.push(1); // format version
        aad.push(RecordType::Manifest.as_u8());
        aad.extend_from_slice(vault_id.as_bytes());
        aad
    }

    /// Encrypt manifest into a binary blob using the VEK.
    pub fn encrypt(&self, vek: &[u8; 32]) -> LvResult<Vec<u8>> {
        let plaintext = rmp_serde::to_vec(self)
            .map_err(|e| LvError::Serialization(format!("Manifest serialization failed: {e}")))?;

        let aad = Self::aad(&self.vault_id);
        encrypt_blob(vek, RecordType::Manifest, &plaintext, &aad)
    }

    /// Decrypt manifest from a binary blob using the VEK.
    pub fn decrypt(blob_bytes: &[u8], vek: &[u8; 32], vault_id: &VaultId) -> LvResult<Self> {
        let aad = Self::aad(vault_id);
        let plaintext = decrypt_blob(vek, RecordType::Manifest, blob_bytes, &aad)?;

        rmp_serde::from_slice(&plaintext)
            .map_err(|e| LvError::Deserialization(format!("Manifest deserialization failed: {e}")))
    }
}
