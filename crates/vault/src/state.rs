use localvault_core::{LvError, LvResult};
use localvault_storage::VaultPaths;
use std::sync::{Arc, RwLock};
use zeroize::Zeroizing;

use crate::header::VaultHeader;
use crate::manifest::Manifest;

/// An unlocked vault instance residing purely in memory.
/// The Vault Encryption Key (VEK) is wrapped in `Zeroizing` so memory
/// is automatically cleared when the vault is locked or dropped.
pub struct UnlockedVault {
    pub vek: Zeroizing<[u8; 32]>,
    pub header: VaultHeader,
    pub manifest: Manifest,
    pub paths: VaultPaths,
}

impl UnlockedVault {
    pub fn new(
        vek: Zeroizing<[u8; 32]>,
        header: VaultHeader,
        manifest: Manifest,
        paths: VaultPaths,
    ) -> Self {
        Self {
            vek,
            header,
            manifest,
            paths,
        }
    }
}

/// Thread-safe managed state for LocalVault.
/// Can be managed by Tauri state or shared across CLI threads.
#[derive(Clone)]
pub struct VaultState {
    inner: Arc<RwLock<Option<UnlockedVault>>>,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(None)),
        }
    }

    /// Check if the vault is currently unlocked.
    pub fn is_unlocked(&self) -> bool {
        self.inner.read().map(|g| g.is_some()).unwrap_or(false)
    }

    /// Store the unlocked vault in state.
    pub fn set_unlocked(&self, unlocked: UnlockedVault) -> LvResult<()> {
        let mut guard = self
            .inner
            .write()
            .map_err(|_| LvError::VaultLocked)?;
        *guard = Some(unlocked);
        Ok(())
    }

    /// Lock the vault by dropping the UnlockedVault (which zeroizes the VEK).
    pub fn lock(&self) -> LvResult<()> {
        let mut guard = self
            .inner
            .write()
            .map_err(|_| LvError::VaultLocked)?;
        *guard = None;
        Ok(())
    }

    /// Execute a closure with read access to the unlocked vault.
    pub fn with_unlocked<F, R>(&self, f: F) -> LvResult<R>
    where
        F: FnOnce(&UnlockedVault) -> LvResult<R>,
    {
        let guard = self
            .inner
            .read()
            .map_err(|_| LvError::VaultLocked)?;
        match guard.as_ref() {
            Some(vault) => f(vault),
            None => Err(LvError::VaultLocked),
        }
    }

    /// Execute a closure with mutable access to the unlocked vault.
    pub fn with_unlocked_mut<F, R>(&self, f: F) -> LvResult<R>
    where
        F: FnOnce(&mut UnlockedVault) -> LvResult<R>,
    {
        let mut guard = self
            .inner
            .write()
            .map_err(|_| LvError::VaultLocked)?;
        match guard.as_mut() {
            Some(vault) => f(vault),
            None => Err(LvError::VaultLocked),
        }
    }
}

impl Default for VaultState {
    fn default() -> Self {
        Self::new()
    }
}
