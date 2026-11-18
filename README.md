# LocalVault

<p align="center">
  <strong>Local-First, Offline, Fully Encrypted Secrets & Environment Variable Manager for Developers</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20(Intel%20%26%20Apple%20Silicon)-black?style=flat-square&logo=apple" alt="Platform" />
  <img src="https://img.shields.io/badge/Framework-Tauri%202%20%2B%20Rust-orange?style=flat-square&logo=rust" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Frontend-React%2019%20%2B%20Tailwind%20CSS-blue?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Crypto-Argon2id%20%2B%20XChaCha20--Poly1305-emerald?style=flat-square" alt="Crypto" />
  <img src="https://img.shields.io/badge/Storage-Zero%20Database%20(Filesystem%20Only)-purple?style=flat-square" alt="Zero Database" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## Overview

**LocalVault** is a production-grade desktop application and companion CLI designed for software developers who manage multiple projects across diverse environments (Development, Staging, Production, GPU Server, Testing). 

Inspired by the developer ergonomics of **Infisical**, **Doppler**, and **1Password**, LocalVault eliminates the chaos of manually hunting through unversioned `.env` files—without introducing any cloud dependency, remote backend, telemetry, or database.

### Core Guarantees

- **Zero Database**: No SQLite, PostgreSQL, MySQL, MongoDB, or Redis. The local filesystem is the sole persistent store.
- **Full Encryption at Rest**: Every piece of sensitive persistent data—variable keys, secret values, descriptions, tags, project metadata, environment names, and manifests—is authenticated and encrypted with **XChaCha20-Poly1305 AEAD**.
- **Memory-Hard KDF**: Master password derivation powered by **Argon2id** (configured with OWASP/RFC 9106 recommended parameters).
- **Ephemeral In-Memory Secrets**: Decrypted secrets are never persisted in plaintext, never written to disk, never logged, and never retained in long-lived global frontend state.
- **Offline & Local-First**: Works 100% offline. Zero remote accounts, zero subscriptions, zero network phone-homes.
- **Unified GUI & CLI**: Full native macOS desktop experience plus a lightweight companion CLI (`localvault`) for runtime process secret injection.

---

## Feature Tour

### ⚡ Quick Command Palette (`⌘K` / `Ctrl+K`)
Instant Raycast/Spotlight-style floating command palette. Press `⌘K` to search across all projects, jump between environments, add single variables, paste `.env` files, trigger security audits, or immediately lock the vault (`⌘L`).

### 📋 Full `.env` Bulk Text Field & Single-Variable Input
Add variables one-by-one or switch to **Paste Full .env** to paste multiple lines of `KEY=VALUE` at once. LocalVault automatically parses multiline strings, escaped quotes, and comments, detects conflicts in real time, and offers one-click duplicate resolution (*Overwrite* vs *Keep existing*).

### 🛡️ Live Security Health & Leak Inspector
Run an in-memory security scan on any environment to detect:
- **Default/Trivial Secrets**: Flags weak defaults (`password`, `123456`, `admin`, `secret`, `changeme`).
- **Insecure HTTP Endpoints**: Detects plaintext `http://` URLs configured in production environments.
- **Leaked Sandbox Keys**: Catches sandbox/test API keys (`sk_test_...`, `pk_test_...`) in production environments.
- **Unfilled Placeholders**: Flags lingering `TODO`, `FIXME`, or `<your-key>` template tags.
- **Entropy & Health Score**: Displays a real-time cryptographic health grade (0–100%).

### 🚀 Developer Quick Copy Formats
One-click translation of active environment secrets into deployment syntaxes:
- 🐳 **Docker Run Flags**: `-e PORT="3000" -e DATABASE_URL="postgres://..."`
- 🐚 **Shell Export Script**: `export PORT="3000"\nexport DATABASE_URL="..."`
- 📦 **JSON Object**: `{ "PORT": "3000", ... }`
- 📄 **Standard `.env` format**

### 🌍 Dashboard "Export All Environments"
Export your entire multi-project vault in one go from the main dashboard:
- **Multi-Env `.env` Bundle**: Grouped and separated by `# PROJECT:` and `# Environment:` headers.
- **Structured JSON Bundle**: Complete hierarchical JSON archive.
- **Shell Loader Script (`setup-env.sh`)**: Generates modular Bash/Zsh loader functions (`load_project_env`).
- Output via one-click **Clipboard Copy** or direct **File Download**.

### ⚖️ Side-by-Side Environment Diff Engine
Visually compare any two environments (e.g., *Development* vs *Production*). Instantly spots missing keys, mismatched configurations, or empty properties.

### 🔄 Environment Cloning & In-Place Editing
- **Clone Environment**: Duplicate any environment (e.g., clone `Development` into `Staging`) with all variables preserved in isolated encrypted files.
- **In-Place Edit**: Modify key names, values, variable types, or descriptions on the fly.
- **Instant Panic Lock (`⌘L`)**: Immediately zeroizes decryption keys in memory and locks the UI.

---

## Cryptographic Architecture

LocalVault employs a multi-tiered key hierarchy ensuring that compromise of password metadata never exposes the underlying data encryption key:

```
               Master Password
                      │
                      ▼
            Argon2id (Memory-Hard)
                      │
                      ▼
             Key Encryption Key (KEK)
                      │
                      ▼
          Decrypt Wrapped Vault Key
                      │
                      ▼
         Vault Data Encryption Key (VEK)
             [Zeroizing in Memory]
                      │
    ┌─────────────────┴─────────────────┐
    ▼                                   ▼
Encrypted Manifest             Encrypted Records
(manifest.enc)                 (records/<id>.enc)
```

### Cryptographic Standards
- **KDF**: Argon2id (64 MiB memory, 3 iterations, 4 lanes).
- **AEAD**: XChaCha20-Poly1305 authenticated encryption with 192-bit random nonces per write.
- **AAD (Additional Authenticated Data)**: All records are cryptographically bound to their record ID and format version.
- **Zeroization**: Raw decryption keys wrapped in `Zeroizing<T>` types to scrub memory upon drop.
- **Recovery Key**: 128-bit cryptographically secure entropy formatted as Crockford Base32 with automatic check digits.

---

## File-Based Storage Layout

LocalVault creates an authenticated, encrypted filesystem directory inside the OS Application Support directory (`~/Library/Application Support/LocalVault/` on macOS):

```
~/Library/Application Support/LocalVault/
│
├── vault/
│   ├── vault.header              # Format version, KDF salt/params, wrapped VEK, auth verification blob
│   ├── manifest.enc              # Encrypted index of workspaces, projects, environments, and record IDs
│   ├── records/                  # Encrypted payload records (UUID-named, no plaintext metadata)
│   │   ├── 4f8b2c1a-...enc       # Encrypted EnvironmentRecord (holds all variables for that env)
│   │   └── 9c3e7d2b-...enc       # Encrypted ProjectRecord
│   │
│   └── journal/                  # Write-ahead transaction journal for crash resilience
│
├── backups/                      # Encrypted archives (.lvbackup)
├── config/                       # Non-sensitive client preferences
└── logs/                         # Sanitized execution logs (never contains secrets or keys)
```

- **Restrictive POSIX Permissions**: Directories created with `0o700` (`rwx------`), files with `0o600` (`rw-------`).
- **Atomic Writes**: Writes utilize temp files + atomic `rename` + `fsync` to eliminate corrupted states during crashes.

---

## Repository Structure

LocalVault is structured as a modular Cargo workspace and TypeScript monorepo:

```
.
├── apps/
│   ├── desktop/                  # Tauri 2 Desktop App (Vite, React 19, Tailwind CSS v4, Zustand)
│   └── cli/                      # Standalone companion CLI tool (`localvault`)
│
├── crates/
│   ├── core/                     # Common types, IDs (VaultId, ProjectId, EnvId, VarId), errors
│   ├── crypto/                   # Argon2id, XChaCha20-Poly1305, Base32 recovery keys, key wrapping
│   ├── storage/                  # Path resolver, atomic writes, journal, POSIX permissions
│   ├── vault/                    # Vault lifecycle: create, unlock, verify, manifest encryption
│   ├── projects/                 # Workspace and Project records
│   ├── environments/             # Multi-environment records, cloning, starter templates
│   ├── variables/                # Variable CRUD, key validation, side-by-side comparison engine
│   ├── io/                       # Multi-format parser/formatter (.env, JSON, shell)
│   └── backup/                   # Encrypted archive generator and restoration engine
│
├── Cargo.toml                    # Root Rust workspace manifest
└── package.json                  # Root convenience scripts
```

---

## Getting Started

### Prerequisites

- **Rust**: `1.80+` (`rustup update stable`)
- **Node.js**: `18+` or `20+`
- **Package Manager**: `yarn` or `npm`
- **Operating System**: macOS (Apple Silicon `aarch64` or Intel `x86_64`)

---

### Running the Desktop Application (Dev Mode)

From the project root:

```bash
# Option 1: Convenience script from root
yarn desktop

# Option 2: Run directly from apps/desktop
cd apps/desktop
yarn tauri dev
```

1. Local dev server will start at `http://localhost:1420`.
2. Native Tauri 2 macOS window will launch.
3. On first run, complete the **Create Master Vault** setup and save your **Recovery Key**.

---

### Building Standalone macOS App Bundle (`.app` / `.dmg`)

```bash
cd apps/desktop
yarn tauri build
```

Compiled bundles will be generated at:
- `apps/desktop/src-tauri/target/release/bundle/dmg/LocalVault_0.1.0_aarch64.dmg`
- `apps/desktop/src-tauri/target/release/bundle/macos/LocalVault.app`

---

### Using the Companion CLI (`localvault`)

LocalVault includes a standalone Rust CLI binary with zero dependencies on the desktop GUI.

#### Build & Install CLI

```bash
# Build release binary
cargo build --release -p localvault-cli

# Install directly to system path (~/.cargo/bin/localvault)
cargo install --path apps/cli
```

#### CLI Commands

```bash
# Initialize a new encrypted vault
localvault init

# Unlock and check status
localvault status

# List projects and environments
localvault list
localvault list --project "SeloraX"

# Read a single secret value
localvault get DATABASE_URL --project "SeloraX" --env "Production"

# Export environment to stdout
localvault export --project "SeloraX" --env "Development" --format dotenv

# Runtime process injection (Inject secrets directly into child command)
localvault run --project "SeloraX" --env "Development" -- yarn dev
```

> **Process Injection**: `localvault run` spawns the target child process with decrypted variables injected directly into child memory, avoiding intermediate plaintext `.env` files on disk.

---

## Running Automated Tests

Run the test suite across all crates in the workspace:

```bash
# Run all 59 unit and integration tests
cargo test --workspace

# Verify frontend typecheck and Vite build
cd apps/desktop && yarn build
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| **`⌘K` / `Ctrl+K`** | Open Global Command Palette |
| **`⌘L` / `Ctrl+L`** | Panic Lock LocalVault immediately |
| **`Esc`** | Close active modal or command palette |
| **`↑` / `↓`** | Navigate command palette items |
| **`Enter`** | Select / execute command item |

---

## Security Best Practices

1. **Keep Your Master Password Safe**: LocalVault uses Argon2id key derivation. There is no remote password reset service.
2. **Back Up Your Recovery Key**: The Base32 recovery key generated at vault creation is the only way to recover data if you forget your master password.
3. **Handle Plaintext Exports with Care**: Exported `.env` or JSON files are unencrypted. Avoid committing exported files to version control.

---

## License

This project is licensed under the [MIT License](LICENSE).
