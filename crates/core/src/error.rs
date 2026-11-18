use thiserror::Error;

/// Central error type for all LocalVault operations.
#[derive(Debug, Error)]
pub enum LvError {
    // Vault errors
    #[error("Vault not found — no vault has been created yet")]
    VaultNotFound,

    #[error("Vault already exists")]
    VaultAlreadyExists,

    #[error("Vault is locked — unlock before performing this operation")]
    VaultLocked,

    #[error("Vault is already unlocked")]
    VaultAlreadyUnlocked,

    // Authentication errors
    #[error("Authentication failed — wrong password or recovery key")]
    AuthFailed,

    #[error("Invalid recovery key format")]
    InvalidRecoveryKey,

    // Crypto errors
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Key derivation failed: {0}")]
    KeyDerivationFailed(String),

    #[error("Invalid key length: expected {expected}, got {got}")]
    InvalidKeyLength { expected: usize, got: usize },

    // Storage errors
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Deserialization error: {0}")]
    Deserialization(String),

    #[error("Invalid file format: {0}")]
    InvalidFormat(String),

    #[error("File integrity check failed: {0}")]
    IntegrityError(String),

    #[error("Atomic write failed: {0}")]
    AtomicWriteFailed(String),

    // Record errors
    #[error("Record not found: {0}")]
    RecordNotFound(String),

    #[error("Record already exists: {0}")]
    RecordAlreadyExists(String),

    #[error("Duplicate key: {0}")]
    DuplicateKey(String),

    // Project/Environment errors
    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),

    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    #[error("Environment not found: {0}")]
    EnvironmentNotFound(String),

    #[error("Variable not found: {0}")]
    VariableNotFound(String),

    // Validation errors
    #[error("Invalid variable key: {0}")]
    InvalidVariableKey(String),

    #[error("Password too short: minimum {min} characters required")]
    PasswordTooShort { min: usize },

    // Path errors
    #[error("Could not resolve application data directory")]
    PathResolution,

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    // Backup errors
    #[error("Backup verification failed: {0}")]
    BackupVerificationFailed(String),

    #[error("Backup restore failed: {0}")]
    BackupRestoreFailed(String),

    // Import/Export errors
    #[error("Import error: {0}")]
    ImportError(String),

    #[error("Export error: {0}")]
    ExportError(String),

    #[error("Export requires explicit confirmation")]
    ExportNotConfirmed,

    // Production safety
    #[error("Operation on production environment requires explicit confirmation")]
    ProductionConfirmationRequired,
}

pub type LvResult<T> = Result<T, LvError>;
