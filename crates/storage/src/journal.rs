use localvault_core::{now_timestamp, LvError, LvResult, RecordId};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

use crate::atomic::atomic_write;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum JournalAction {
    WriteRecord { record_id: RecordId, file_path: PathBuf },
    DeleteRecord { record_id: RecordId, file_path: PathBuf },
    UpdateManifest { manifest_path: PathBuf },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum JournalStatus {
    Pending,
    Committed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntry {
    pub id: Uuid,
    pub timestamp: i64,
    pub actions: Vec<JournalAction>,
    pub status: JournalStatus,
}

pub struct JournalManager {
    journal_dir: PathBuf,
}

impl JournalManager {
    pub fn new(journal_dir: PathBuf) -> Self {
        Self { journal_dir }
    }

    fn entry_path(&self, id: &Uuid) -> PathBuf {
        self.journal_dir.join(format!("{}.journal", id))
    }

    /// Begin a new transaction by writing a Pending journal entry to disk.
    pub fn begin_tx(&self, actions: Vec<JournalAction>) -> LvResult<JournalEntry> {
        let entry = JournalEntry {
            id: Uuid::new_v4(),
            timestamp: now_timestamp(),
            actions,
            status: JournalStatus::Pending,
        };

        let data = rmp_serde::to_vec(&entry)
            .map_err(|e| LvError::Serialization(format!("Journal serialization failed: {e}")))?;

        atomic_write(&self.entry_path(&entry.id), &data)?;
        Ok(entry)
    }

    /// Mark a transaction as Committed.
    pub fn commit_tx(&self, mut entry: JournalEntry) -> LvResult<()> {
        entry.status = JournalStatus::Committed;
        let data = rmp_serde::to_vec(&entry)
            .map_err(|e| LvError::Serialization(format!("Journal serialization failed: {e}")))?;

        atomic_write(&self.entry_path(&entry.id), &data)?;
        // Clean up committed journal file
        let _ = fs::remove_file(self.entry_path(&entry.id));
        Ok(())
    }

    /// Scan journal directory and recover from interrupted operations.
    pub fn recover_pending(&self) -> LvResult<usize> {
        if !self.journal_dir.exists() {
            return Ok(0);
        }

        let mut recovered_count = 0;
        let entries = fs::read_dir(&self.journal_dir).map_err(LvError::Io)?;

        for entry_res in entries {
            let entry = entry_res.map_err(LvError::Io)?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("journal") {
                if let Ok(data) = fs::read(&path) {
                    if let Ok(journal_entry) = rmp_serde::from_slice::<JournalEntry>(&data) {
                        if journal_entry.status == JournalStatus::Pending {
                            // If a transaction was interrupted in Pending state,
                            // verify actions and clean up partial state.
                            for action in &journal_entry.actions {
                                match action {
                                    JournalAction::WriteRecord { file_path, .. } => {
                                        // If temp file remains, remove it
                                        let temp_pattern = format!(".{}.tmp", journal_entry.id);
                                        if let Some(parent) = file_path.parent() {
                                            let temp_path = parent.join(temp_pattern);
                                            let _ = fs::remove_file(temp_path);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            let _ = fs::remove_file(&path);
                            recovered_count += 1;
                        }
                    }
                }
            }
        }

        Ok(recovered_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_journal_tx_commit() {
        let dir = tempdir().unwrap();
        let jm = JournalManager::new(dir.path().to_path_buf());

        let actions = vec![JournalAction::UpdateManifest {
            manifest_path: dir.path().join("manifest.enc"),
        }];

        let entry = jm.begin_tx(actions).unwrap();
        assert_eq!(entry.status, JournalStatus::Pending);

        jm.commit_tx(entry).unwrap();
    }

    #[test]
    fn test_journal_recovery() {
        let dir = tempdir().unwrap();
        let jm = JournalManager::new(dir.path().to_path_buf());

        let entry = jm.begin_tx(vec![]).unwrap();
        assert!(jm.entry_path(&entry.id).exists());

        let recovered = jm.recover_pending().unwrap();
        assert_eq!(recovered, 1);
        assert!(!jm.entry_path(&entry.id).exists());
    }
}
