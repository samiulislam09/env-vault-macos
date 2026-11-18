use localvault_core::{
    FORMAT_VERSION, MAGIC_BYTES, LvError, LvResult, RecordType,
};
use zeroize::Zeroizing;

use crate::aead::{self, KEY_LENGTH, NONCE_LENGTH, TAG_LENGTH};
use crate::nonce::generate_nonce;

/// Header size of an EncryptedBlob before ciphertext:
/// 6 (magic) + 1 (version) + 1 (record_type) + 2 (reserved) + 24 (nonce) + 4 (ciphertext_len) = 38 bytes
pub const BLOB_HEADER_SIZE: usize = 38;

/// In-memory representation of an encrypted file blob.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncryptedBlob {
    pub format_version: u8,
    pub record_type: RecordType,
    pub nonce: [u8; NONCE_LENGTH],
    pub ciphertext: Vec<u8>, // contains ciphertext + 16-byte Poly1305 tag
}

impl EncryptedBlob {
    /// Serialize the blob to binary bytes according to the LocalVault storage format.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(BLOB_HEADER_SIZE + self.ciphertext.len());
        bytes.extend_from_slice(MAGIC_BYTES);
        bytes.push(self.format_version);
        bytes.push(self.record_type.as_u8());
        bytes.extend_from_slice(&[0x00, 0x00]); // Reserved
        bytes.extend_from_slice(&self.nonce);
        bytes.extend_from_slice(&(self.ciphertext.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&self.ciphertext);
        bytes
    }

    /// Parse a binary slice into an EncryptedBlob, validating magic bytes, version, and length.
    pub fn from_bytes(bytes: &[u8]) -> LvResult<Self> {
        if bytes.len() < BLOB_HEADER_SIZE + TAG_LENGTH {
            return Err(LvError::InvalidFormat(
                "File too small to be a valid LocalVault encrypted blob".to_string(),
            ));
        }

        if &bytes[0..6] != MAGIC_BYTES {
            return Err(LvError::InvalidFormat("Invalid magic bytes".to_string()));
        }

        let format_version = bytes[6];
        if format_version != FORMAT_VERSION {
            return Err(LvError::InvalidFormat(format!(
                "Unsupported format version: {format_version} (expected {FORMAT_VERSION})"
            )));
        }

        let record_type_byte = bytes[7];
        let record_type = RecordType::from_u8(record_type_byte).ok_or_else(|| {
            LvError::InvalidFormat(format!("Unknown record type: {record_type_byte}"))
        })?;

        // bytes[8..10] are reserved (0x00, 0x00)

        let mut nonce = [0u8; NONCE_LENGTH];
        nonce.copy_from_slice(&bytes[10..34]);

        let ct_len = u32::from_le_bytes(
            bytes[34..38]
                .try_into()
                .map_err(|_| LvError::InvalidFormat("Invalid ciphertext length bytes".to_string()))?,
        ) as usize;

        if bytes.len() != BLOB_HEADER_SIZE + ct_len {
            return Err(LvError::InvalidFormat(format!(
                "Ciphertext length mismatch: declared {ct_len}, remaining buffer is {}",
                bytes.len() - BLOB_HEADER_SIZE
            )));
        }

        let ciphertext = bytes[38..].to_vec();

        Ok(Self {
            format_version,
            record_type,
            nonce,
            ciphertext,
        })
    }
}

/// Encrypt arbitrary data into an EncryptedBlob and serialize to bytes.
pub fn encrypt_blob(
    key: &[u8; KEY_LENGTH],
    record_type: RecordType,
    plaintext: &[u8],
    aad: &[u8],
) -> LvResult<Vec<u8>> {
    let nonce = generate_nonce();
    let ciphertext = aead::encrypt(key, &nonce, plaintext, aad)?;

    let blob = EncryptedBlob {
        format_version: FORMAT_VERSION,
        record_type,
        nonce,
        ciphertext,
    };

    Ok(blob.to_bytes())
}

/// Parse and decrypt an EncryptedBlob from bytes.
pub fn decrypt_blob(
    key: &[u8; KEY_LENGTH],
    expected_type: RecordType,
    blob_bytes: &[u8],
    aad: &[u8],
) -> LvResult<Zeroizing<Vec<u8>>> {
    let blob = EncryptedBlob::from_bytes(blob_bytes)?;

    if blob.record_type != expected_type {
        return Err(LvError::InvalidFormat(format!(
            "Record type mismatch: expected {:?}, got {:?}",
            expected_type, blob.record_type
        )));
    }

    aead::decrypt(key, &blob.nonce, &blob.ciphertext, aad)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> [u8; KEY_LENGTH] {
        let mut key = [0u8; KEY_LENGTH];
        key[0] = 0xAA;
        key[31] = 0xBB;
        key
    }

    #[test]
    fn test_blob_roundtrip() {
        let key = test_key();
        let plaintext = b"Hello, LocalVault encrypted world!";
        let aad = b"test-aad-context";

        let blob_bytes = encrypt_blob(&key, RecordType::Record, plaintext, aad).unwrap();
        assert!(blob_bytes.len() > BLOB_HEADER_SIZE);

        let decrypted = decrypt_blob(&key, RecordType::Record, &blob_bytes, aad).unwrap();
        assert_eq!(decrypted.as_slice(), plaintext);
    }

    #[test]
    fn test_blob_invalid_magic() {
        let key = test_key();
        let plaintext = b"Hello";
        let aad = b"aad";

        let mut blob_bytes = encrypt_blob(&key, RecordType::Record, plaintext, aad).unwrap();
        blob_bytes[0] = b'X'; // Corrupt magic

        let result = decrypt_blob(&key, RecordType::Record, &blob_bytes, aad);
        assert!(matches!(result, Err(LvError::InvalidFormat(_))));
    }

    #[test]
    fn test_blob_wrong_record_type() {
        let key = test_key();
        let plaintext = b"Manifest data";
        let aad = b"aad";

        let blob_bytes = encrypt_blob(&key, RecordType::Manifest, plaintext, aad).unwrap();

        // Attempt decrypt expecting Record instead of Manifest
        let result = decrypt_blob(&key, RecordType::Record, &blob_bytes, aad);
        assert!(matches!(result, Err(LvError::InvalidFormat(_))));
    }

    #[test]
    fn test_blob_truncated_length() {
        let key = test_key();
        let plaintext = b"Some data";
        let aad = b"aad";

        let blob_bytes = encrypt_blob(&key, RecordType::Record, plaintext, aad).unwrap();
        let truncated = &blob_bytes[..blob_bytes.len() - 5];

        let result = decrypt_blob(&key, RecordType::Record, truncated, aad);
        assert!(result.is_err());
    }
}
