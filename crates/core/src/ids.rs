use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

/// Macro to define a strongly-typed ID wrapper around UUID.
macro_rules! define_id {
    ($name:ident, $display_prefix:expr) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub struct $name(Uuid);

        impl $name {
            /// Create a new random ID.
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }

            /// Create from an existing UUID.
            pub fn from_uuid(uuid: Uuid) -> Self {
                Self(uuid)
            }

            /// Parse from a string representation.
            pub fn parse(s: &str) -> Result<Self, uuid::Error> {
                Ok(Self(Uuid::parse_str(s)?))
            }

            /// Get the underlying UUID.
            pub fn as_uuid(&self) -> &Uuid {
                &self.0
            }

            /// Get the UUID bytes (for use in AAD).
            pub fn as_bytes(&self) -> &[u8; 16] {
                self.0.as_bytes()
            }

            /// Convert to a string representation.
            pub fn to_string_repr(&self) -> String {
                self.0.to_string()
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}{}", $display_prefix, self.0)
            }
        }

        impl From<Uuid> for $name {
            fn from(uuid: Uuid) -> Self {
                Self(uuid)
            }
        }

        impl AsRef<[u8]> for $name {
            fn as_ref(&self) -> &[u8] {
                self.0.as_bytes()
            }
        }
    };
}

define_id!(VaultId, "vault:");
define_id!(WorkspaceId, "ws:");
define_id!(ProjectId, "proj:");
define_id!(EnvId, "env:");
define_id!(VarId, "var:");
define_id!(RecordId, "rec:");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_id_generation_uniqueness() {
        let ids: Vec<VaultId> = (0..1000).map(|_| VaultId::new()).collect();
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(ids.len(), unique.len(), "Generated IDs must be unique");
    }

    #[test]
    fn test_id_roundtrip() {
        let id = ProjectId::new();
        let s = id.to_string_repr();
        let parsed = ProjectId::parse(&s).unwrap();
        assert_eq!(id, parsed);
    }

    #[test]
    fn test_id_serialization() {
        let id = EnvId::new();
        let json = serde_json::to_string(&id).unwrap();
        let deserialized: EnvId = serde_json::from_str(&json).unwrap();
        assert_eq!(id, deserialized);
    }

    #[test]
    fn test_id_bytes_length() {
        let id = VaultId::new();
        assert_eq!(id.as_bytes().len(), 16);
    }
}
