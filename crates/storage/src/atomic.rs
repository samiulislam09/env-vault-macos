use localvault_core::{LvError, LvResult};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use uuid::Uuid;

use crate::permissions::restrict_file_permissions;

/// Atomically write data to a target path using the write-then-rename pattern.
///
/// Steps:
/// 1. Create a unique temporary file in the same directory as `target_path`.
/// 2. Write all data to the temporary file.
/// 3. Call `sync_all()` to ensure physical persistence on disk.
/// 4. Restrict permissions to 0o600 (owner-only).
/// 5. Rename the temporary file atomically over `target_path`.
/// 6. Flush the parent directory to ensure the directory entry is durable.
pub fn atomic_write(target_path: &Path, data: &[u8]) -> LvResult<()> {
    let parent = target_path.parent().ok_or_else(|| {
        LvError::InvalidPath(format!(
            "Target path has no parent directory: {}",
            target_path.display()
        ))
    })?;

    if !parent.exists() {
        fs::create_dir_all(parent).map_err(LvError::Io)?;
    }

    let temp_name = format!(".{}.tmp", Uuid::new_v4());
    let temp_path = parent.join(temp_name);

    // 1 & 2. Write data to temporary file
    let mut file = File::create(&temp_path).map_err(LvError::Io)?;
    file.write_all(data).map_err(LvError::Io)?;

    // 3. Sync to disk
    file.sync_all().map_err(LvError::Io)?;
    drop(file);

    // 4. Set restrictive permissions
    restrict_file_permissions(&temp_path)?;

    // 5. Atomic rename over target
    if let Err(e) = fs::rename(&temp_path, target_path) {
        // Clean up temp file on failure
        let _ = fs::remove_file(&temp_path);
        return Err(LvError::AtomicWriteFailed(format!(
            "Failed to rename temp file to {}: {e}",
            target_path.display()
        )));
    }

    // 6. Sync parent directory on Unix
    #[cfg(unix)]
    {
        if let Ok(dir_file) = File::open(parent) {
            let _ = dir_file.sync_all();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_atomic_write_success() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("test_file.bin");
        let data = b"Hello atomic world!";

        atomic_write(&target, data).unwrap();

        assert!(target.exists());
        let read_back = fs::read(&target).unwrap();
        assert_eq!(read_back, data);
    }

    #[test]
    fn test_atomic_write_overwrite() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("overwrite_test.bin");

        atomic_write(&target, b"version 1").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"version 1");

        atomic_write(&target, b"version 2").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"version 2");
    }
}
