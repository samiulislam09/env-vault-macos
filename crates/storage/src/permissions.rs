use localvault_core::{LvError, LvResult};
use std::fs;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Restrict directory permissions to 0o700 (owner read, write, execute only).
pub fn restrict_dir_permissions(path: &Path) -> LvResult<()> {
    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o700);
        fs::set_permissions(path, perms).map_err(LvError::Io)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Restrict file permissions to 0o600 (owner read, write only).
pub fn restrict_file_permissions(path: &Path) -> LvResult<()> {
    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(path, perms).map_err(LvError::Io)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Verify if permissions are sufficiently restrictive.
pub fn verify_file_permissions(path: &Path) -> LvResult<bool> {
    #[cfg(unix)]
    {
        let metadata = fs::metadata(path).map_err(LvError::Io)?;
        let mode = metadata.permissions().mode();
        // Check if group or others have any permissions: (mode & 0o077) == 0
        Ok((mode & 0o077) == 0)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(true)
    }
}
