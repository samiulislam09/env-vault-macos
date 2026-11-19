import { invoke } from "@tauri-apps/api/core";
import type {
  ComparisonResult,
  EnvironmentRecord,
  ImportPreview,
  ProjectRecord,
  UnlockResponse,
  VariableSummary,
  VaultCreated,
  VaultStatusResponse,
  WorkspaceRecord,
  TursoConfig,
  TursoTestResponse,
  TursoSyncResult,
  TursoRemoteStatus,
  UserSession,
  UserAccountSummary,
  AuthResponse,
  AuthStatusResponse,
  BiometricStatus,
  VariableRevision,
  SharedProjectSummary,
  BreachResult,
  KeyBreachResult,
  MergeDiffReport,
  MergeResultSummary,
} from "./types";

export const api = {
  // Vault commands
  getVaultStatus: () => invoke<VaultStatusResponse>("vault_status"),
  createVault: (password: string) =>
    invoke<VaultCreated>("create_vault_cmd", { password }),
  unlockVault: (password: string) =>
    invoke<UnlockResponse>("unlock_vault_cmd", { password }),
  unlockWithRecovery: (recoveryKey: string) =>
    invoke<UnlockResponse>("unlock_with_recovery_cmd", {
      recoveryKey,
    }),
  lockVault: () => invoke<void>("lock_vault_cmd"),

  // Workspace commands
  listWorkspaces: () => invoke<WorkspaceRecord[]>("list_workspaces_cmd"),
  createWorkspace: (name: string, description?: string) =>
    invoke<WorkspaceRecord>("create_workspace_cmd", { name, description }),

  // Project commands
  listProjects: (workspaceId?: string) =>
    invoke<ProjectRecord[]>("list_projects_cmd", { workspaceId }),
  createProject: (input: {
    workspaceId?: string;
    name: string;
    description?: string;
    icon?: string;
    rootDirectory?: string;
  }) => invoke<ProjectRecord>("create_project_cmd", { input }),
  deleteProject: (projectId: string) =>
    invoke<void>("delete_project_cmd", {
      projectId,
      project_id: projectId,
    }),

  // Environment commands
  listEnvironments: (projectId: string) =>
    invoke<EnvironmentRecord[]>("list_environments_cmd", {
      projectId,
      project_id: projectId,
    }),
  createEnvironment: (input: {
    projectId: string;
    name: string;
    color?: string;
    icon?: string;
    isDefault: boolean;
    isProduction: boolean;
    templateId?: string;
  }) => invoke<EnvironmentRecord>("create_environment_cmd", { input }),
  duplicateEnvironment: (sourceEnvId: string, name: string, isProduction: boolean) =>
    invoke<EnvironmentRecord>("duplicate_environment_cmd", {
      input: { sourceEnvId, name, isProduction },
    }),
  updateEnvironment: (input: {
    envId: string;
    name: string;
    isProduction: boolean;
  }) => invoke<EnvironmentRecord>("update_environment_cmd", { input }),
  deleteEnvironment: (envId: string) =>
    invoke<void>("delete_environment_cmd", {
      envId,
      env_id: envId,
    }),

  // Variable commands
  listVariables: (envId: string) =>
    invoke<VariableSummary[]>("list_variables_cmd", {
      envId,
      env_id: envId,
    }),
  revealVariableValue: (envId: string, varId: string) =>
    invoke<string>("reveal_variable_value_cmd", {
      envId,
      env_id: envId,
      varId,
      var_id: varId,
    }),
  createVariable: (input: {
    envId: string;
    key: string;
    value: string;
    varType: string;
    description?: string;
    tags: string[];
    expiresAt?: number | null;
  }) => invoke<VariableSummary>("create_variable_cmd", { input }),
  updateVariable: (input: {
    envId: string;
    varId: string;
    key: string;
    value?: string;
    varType: string;
    description?: string;
    tags: string[];
    expiresAt?: number | null;
  }) => invoke<void>("update_variable_cmd", { input }),
  deleteVariable: (envId: string, varId: string) =>
    invoke<void>("delete_variable_cmd", {
      envId,
      env_id: envId,
      varId,
      var_id: varId,
    }),
  compareEnvironments: (envAId: string, envBId: string) =>
    invoke<ComparisonResult>("compare_environments_cmd", {
      envAId,
      envBId,
    }),

  // Import / Export
  previewImport: (envId: string, fileContent: string, format: string) =>
    invoke<ImportPreview>("preview_import_cmd", {
      envId,
      fileContent,
      format,
    }),
  executeImport: (
    envId: string,
    fileContent: string,
    format: string,
    strategy: string
  ) =>
    invoke<number>("execute_import_cmd", {
      input: {
        envId,
        fileContent,
        format,
        strategy,
      },
    }),
  exportEnvironment: (
    envId: string,
    destPath: string,
    format: string,
    confirmed: boolean
  ) =>
    invoke<void>("export_environment_cmd", {
      envId,
      env_id: envId,
      destPath,
      dest_path: destPath,
      format,
      confirmed,
    }),
  getDownloadsDir: () => invoke<string>("get_downloads_dir_cmd"),
  pickExportPath: (defaultDir?: string, defaultFilename?: string) =>
    invoke<string | null>("pick_export_path_cmd", {
      defaultDir,
      default_dir: defaultDir,
      defaultFilename,
      default_filename: defaultFilename,
    }),
  writeExportedFile: (destPath: string, content: string) =>
    invoke<void>("write_exported_file_cmd", {
      destPath,
      dest_path: destPath,
      content,
    }),

  // Backups
  createBackup: (passphrase: string, destPath?: string) =>
    invoke<{ filePath: string; fileSizeBytes: number; createdAt: number }>(
      "create_backup_cmd",
      { passphrase, destPath }
    ),
  verifyBackup: (backupPath: string, passphrase: string) =>
    invoke<{ isValid: boolean; fileCount: number; createdAt: number }>(
      "verify_backup_cmd",
      { backupPath, passphrase }
    ),
  restoreBackup: (backupPath: string, passphrase: string) =>
    invoke<number>("restore_backup_cmd", { backupPath, passphrase }),

  // Turso Cloud Sync
  getTursoConfig: () => invoke<TursoConfig>("turso_get_config_cmd"),
  saveTursoConfig: (config: TursoConfig) =>
    invoke<void>("turso_save_config_cmd", { config }),
  testTursoConnection: (url?: string, token?: string) =>
    invoke<TursoTestResponse>("turso_test_connection_cmd", { url, token }),
  getTursoRemoteStatus: () =>
    invoke<TursoRemoteStatus>("turso_remote_status_cmd"),
  tursoSyncPush: () => invoke<TursoSyncResult>("turso_sync_push_cmd"),
  tursoSyncPull: () => invoke<TursoSyncResult>("turso_sync_pull_cmd"),

  // User Authentication & Multi-Tenant Isolation
  getAuthStatus: () => invoke<AuthStatusResponse>("auth_get_status_cmd"),
  register: (email: string, password: string) =>
    invoke<AuthResponse>("auth_register_cmd", { email, password }),
  login: (email: string, password: string) =>
    invoke<AuthResponse>("auth_login_cmd", { email, password }),
  logout: () => invoke<void>("auth_logout_cmd"),
  changePassword: (oldPassword: string, newPassword: string) =>
    invoke<string>("auth_change_password_cmd", { oldPassword, newPassword }),

  // Biometric / Touch ID
  getBiometricStatus: (userId?: string) =>
    invoke<BiometricStatus>("biometric_get_status_cmd", { userId }),
  enableBiometric: (userId: string, password: string) =>
    invoke<boolean>("biometric_enable_cmd", { userId, password }),
  disableBiometric: (userId: string) =>
    invoke<boolean>("biometric_disable_cmd", { userId }),
  biometricUnlock: (email: string, userId: string) =>
    invoke<AuthResponse>("biometric_unlock_cmd", { email, userId }),

  // Variable Revision History & Rollbacks
  listVariableRevisions: (envId?: string) =>
    invoke<VariableRevision[]>("list_variable_revisions_cmd", { envId }),
  rollbackVariable: (revisionId: string) =>
    invoke<string>("rollback_variable_cmd", { revisionId }),

  // End-to-End Encrypted Project Sharing
  publishSharingIdentity: () =>
    invoke<string>("sharing_publish_identity_cmd"),
  shareProject: (recipientEmail: string, projectId: string) =>
    invoke<string>("sharing_share_project_cmd", { recipientEmail, projectId }),
  listReceivedShares: () =>
    invoke<SharedProjectSummary[]>("sharing_list_received_shares_cmd"),
  acceptShare: (shareId: string) =>
    invoke<string>("sharing_accept_share_cmd", { shareId }),

  // Zero-Knowledge Breach & Compromise Checker (HaveIBeenPwned k-Anonymity)
  checkSecretCompromise: (secret: string) =>
    invoke<BreachResult>("check_secret_compromise_cmd", { secret }),
  scanEnvironmentBreaches: (envId: string) =>
    invoke<KeyBreachResult[]>("scan_environment_breaches_cmd", {
      envId,
      env_id: envId,
    }),

  // Environment Branching & Merging
  branchEnvironment: (sourceEnvId: string, branchName: string) =>
    invoke<EnvironmentRecord>("branch_environment_cmd", {
      input: { sourceEnvId, branchName },
    }),
  getMergeDiff: (sourceEnvId: string, targetEnvId: string) =>
    invoke<MergeDiffReport>("get_merge_diff_cmd", {
      sourceEnvId,
      targetEnvId,
    }),
  mergeEnvironments: (
    sourceEnvId: string,
    targetEnvId: string,
    selectedKeys: string[]
  ) =>
    invoke<MergeResultSummary>("merge_environments_cmd", {
      input: { sourceEnvId, targetEnvId, selectedKeys },
    }),
};
