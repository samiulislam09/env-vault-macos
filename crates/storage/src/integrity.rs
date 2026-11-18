use localvault_core::{FORMAT_VERSION, MAGIC_BYTES, LvError, LvResult};
use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::permissions::verify_file_permissions;

/// Quick integrity verification of a file before attempting cryptographic operations.
pub fn verify_blob_header(path: &Path) -> LvResult<()> {
    if !path.exists() {
        return Err(LvError::RecordNotFound(path.display().to_string()));
    }

    let mut file = File::open(path).map_err(LvError::Io)?;
    let mut header = [0u8; 8];
    let bytes_read = file.read(&mut header).map_err(LvError::Io)?;

    if bytes_read < 8 {
        return Err(LvError::IntegrityError(format!(
            "File {} is truncated (only {bytes_read} bytes)",
            path.display()
        )));
    }

    if &header[0..6] != MAGIC_BYTES {
        return Err(LvError::IntegrityError(format!(
            "File {} does not have valid LocalVault magic bytes",
            path.display()
        )));
    }

    if header[6] != FORMAT_VERSION {
        return Err(LvError::IntegrityError(format!(
            "File {} has unsupported format version {}",
            path.display(),
            header[6]
        )));
    }

    // Check permissions
    if let Ok(safe) = verify_file_permissions(path) {
        if !safe {
            eprintln!(
                "WARNING: File {} permissions are too open (should be 0o600)",
                path.display()
            );
        }
    }

    Ok(())
}
