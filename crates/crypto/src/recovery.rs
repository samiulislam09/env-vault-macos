use crate::nonce::generate_random_bytes;

/// Recovery key length in bytes (256-bit).
const RECOVERY_KEY_BYTES: usize = 32;

/// Generate a human-readable recovery key.
///
/// Produces a Base32-encoded string from 256 bits of random data,
/// formatted in groups of 5 characters separated by hyphens for readability.
///
/// Example: `ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-ZABCD-EFGHI-JKLMN`
///
/// The recovery key is shown to the user once and never stored by the app.
pub fn generate_recovery_key() -> String {
    let bytes = generate_random_bytes(RECOVERY_KEY_BYTES);
    let encoded = base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &bytes);

    // Format in groups of 5 characters
    encoded
        .chars()
        .collect::<Vec<char>>()
        .chunks(5)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<String>>()
        .join("-")
}

/// Decode a recovery key from its human-readable format back to raw bytes.
///
/// Strips hyphens and whitespace, then Base32-decodes.
pub fn decode_recovery_key(recovery_key: &str) -> Option<Vec<u8>> {
    let cleaned: String = recovery_key
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect();

    base32::decode(base32::Alphabet::Rfc4648 { padding: false }, &cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_recovery_key_format() {
        let key = generate_recovery_key();

        // Should contain hyphens
        assert!(key.contains('-'));

        // Each group should be <= 5 characters
        for group in key.split('-') {
            assert!(group.len() <= 5, "Group too long: {group}");
            // Should be valid Base32 characters
            assert!(
                group.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()),
                "Invalid Base32 character in group: {group}"
            );
        }
    }

    #[test]
    fn test_recovery_key_roundtrip() {
        let key = generate_recovery_key();
        let decoded = decode_recovery_key(&key);
        assert!(decoded.is_some());
        assert_eq!(decoded.unwrap().len(), RECOVERY_KEY_BYTES);
    }

    #[test]
    fn test_recovery_key_uniqueness() {
        let key1 = generate_recovery_key();
        let key2 = generate_recovery_key();
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_decode_with_whitespace() {
        let key = generate_recovery_key();
        let with_spaces = format!("  {} ", key.replace('-', " - "));
        let decoded = decode_recovery_key(&with_spaces);
        assert!(decoded.is_some());
    }

    #[test]
    fn test_decode_invalid_key() {
        let result = decode_recovery_key("not-a-valid-key-!!!");
        // base32 decode will fail on invalid characters
        assert!(result.is_none() || result.unwrap().len() != RECOVERY_KEY_BYTES);
    }

    #[test]
    fn test_recovery_key_entropy() {
        // 256 bits of randomness should produce sufficiently varied keys
        let keys: Vec<String> = (0..100).map(|_| generate_recovery_key()).collect();
        let unique: std::collections::HashSet<_> = keys.iter().collect();
        assert_eq!(keys.len(), unique.len());
    }
}
