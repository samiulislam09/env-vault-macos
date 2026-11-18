use localvault_core::{
    now_timestamp, EnvId, LvError, LvResult, ProjectId, RecordId, RecordType,
};
use localvault_crypto::{decrypt_blob, encrypt_blob};
use localvault_storage::{atomic_write, VaultPaths};
use localvault_variables::Variable;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentRecord {
    pub id: EnvId,
    pub project_id: ProjectId,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_default: bool,
    pub is_production: bool,
    pub variables: Vec<Variable>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl EnvironmentRecord {
    pub fn new(
        id: EnvId,
        project_id: ProjectId,
        name: String,
        color: Option<String>,
        icon: Option<String>,
        is_default: bool,
        is_production: bool,
    ) -> Self {
        let now = now_timestamp();
        Self {
            id,
            project_id,
            name,
            color,
            icon,
            is_default,
            is_production,
            variables: Vec::new(),
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
            .map_err(|e| LvError::Serialization(format!("Environment serialization failed: {e}")))?;

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
            .map_err(|e| LvError::Deserialization(format!("Environment deserialization failed: {e}")))
    }

    /// Duplicate this environment with a new ID and name, keeping all variables independent.
    pub fn duplicate(&self, new_id: EnvId, new_name: String, is_production: bool) -> Self {
        let now = now_timestamp();
        Self {
            id: new_id,
            project_id: self.project_id,
            name: new_name,
            color: self.color.clone(),
            icon: self.icon.clone(),
            is_default: false,
            is_production,
            variables: self.variables.clone(),
            created_at: now,
            updated_at: now,
        }
    }
}
