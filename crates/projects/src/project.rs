use localvault_core::{
    now_timestamp, EnvId, LvError, LvResult, ProjectId, RecordId, RecordType, WorkspaceId,
};
use localvault_crypto::{decrypt_blob, encrypt_blob};
use localvault_storage::{atomic_write, VaultPaths};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: ProjectId,
    pub workspace_id: WorkspaceId,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub root_directory: Option<String>,
    pub environment_ids: Vec<EnvId>,
    pub is_favorite: bool,
    pub last_accessed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ProjectRecord {
    pub fn new(
        id: ProjectId,
        workspace_id: WorkspaceId,
        name: String,
        description: Option<String>,
        icon: Option<String>,
        root_directory: Option<String>,
    ) -> Self {
        let now = now_timestamp();
        Self {
            id,
            workspace_id,
            name,
            description,
            icon,
            root_directory,
            environment_ids: Vec::new(),
            is_favorite: false,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn aad(record_id: &RecordId) -> Vec<u8> {
        let mut aad = Vec::with_capacity(18);
        aad.push(1); // format version
        aad.push(RecordType::Record.as_u8());
        aad.extend_from_slice(record_id.as_bytes());
        aad
    }

    pub fn save(
        &self,
        record_id: &RecordId,
        vek: &[u8; 32],
        paths: &VaultPaths,
    ) -> LvResult<()> {
        let plaintext = rmp_serde::to_vec(self)
            .map_err(|e| LvError::Serialization(format!("Project serialization failed: {e}")))?;

        let aad = Self::aad(record_id);
        let blob = encrypt_blob(vek, RecordType::Record, &plaintext, &aad)?;
        atomic_write(&paths.record_file(record_id), &blob)?;
        Ok(())
    }

    pub fn load(
        record_id: &RecordId,
        vek: &[u8; 32],
        paths: &VaultPaths,
    ) -> LvResult<Self> {
        let blob_bytes = fs::read(paths.record_file(record_id)).map_err(LvError::Io)?;
        let aad = Self::aad(record_id);
        let plaintext = decrypt_blob(vek, RecordType::Record, &blob_bytes, &aad)?;

        rmp_serde::from_slice(&plaintext)
            .map_err(|e| LvError::Deserialization(format!("Project deserialization failed: {e}")))
    }
}
