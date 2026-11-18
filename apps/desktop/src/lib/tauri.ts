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
  }) => invoke<VariableSummary>("create_variable_cmd", { input }),
  updateVariable: (input: {
    envId: string;
    varId: string;
    key: string;
    value?: string;
    varType: string;
    description?: string;
    tags: string[];
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
      destPath,
      format,
      confirmed,
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
};
