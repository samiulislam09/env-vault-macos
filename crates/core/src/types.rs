use serde::{Deserialize, Serialize};

/// Variable type classification.
/// These are presentation/validation hints, NOT security classifications.
/// Do not assume "Public" means safe to expose without user consent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VarType {
    Secret,
    Public,
    Configuration,
    Boolean,
    Number,
    Url,
    Json,
}

impl Default for VarType {
    fn default() -> Self {
        Self::Secret
    }
}

impl VarType {
    /// Returns a human-readable label.
    pub fn label(&self) -> &'static str {
        match self {
            Self::Secret => "Secret",
            Self::Public => "Public",
            Self::Configuration => "Configuration",
            Self::Boolean => "Boolean",
            Self::Number => "Number",
            Self::Url => "URL",
            Self::Json => "JSON",
        }
    }
}

/// Record type identifiers used in the encrypted blob format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RecordType {
    VaultHeader = 0x01,
    Manifest = 0x02,
    Record = 0x03,
    Backup = 0x04,
    Preferences = 0x05,
}

impl RecordType {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0x01 => Some(Self::VaultHeader),
            0x02 => Some(Self::Manifest),
            0x03 => Some(Self::Record),
            0x04 => Some(Self::Backup),
            0x05 => Some(Self::Preferences),
            _ => None,
        }
    }

    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Import format types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportFormat {
    DotEnv,
    Json,
}

/// Export format types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    DotEnv,
    Json,
}

/// Import conflict resolution strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportStrategy {
    /// Overwrite existing variables with imported ones.
    Overwrite,
    /// Skip variables that already exist.
    Skip,
    /// Error if any duplicates found.
    Error,
}

/// Comparison status between two environments.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComparisonStatus {
    Identical,
    Different,
    MissingInFirst,
    MissingInSecond,
    Empty,
    TypeMismatch,
}

/// Current format version for the encrypted blob format.
pub const FORMAT_VERSION: u8 = 1;

/// Magic bytes for LocalVault encrypted files.
pub const MAGIC_BYTES: &[u8; 6] = b"LVAULT";

/// Minimum master password length.
pub const MIN_PASSWORD_LENGTH: usize = 8;

/// Recommended master password length.
pub const RECOMMENDED_PASSWORD_LENGTH: usize = 12;

/// Returns the current unix timestamp in seconds.
pub fn now_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}
