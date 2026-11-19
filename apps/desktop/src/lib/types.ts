export type VarType =
  | "secret"
  | "public"
  | "configuration"
  | "boolean"
  | "number"
  | "url"
  | "json";

export interface VaultStatusResponse {
  exists: boolean;
  is_unlocked: boolean;
  vault_path: string;
}

export interface VaultCreated {
  vault_id: string;
  recovery_key: string;
}

export interface UnlockResponse {
  vault_id: string;
  workspace_count: number;
  project_count: number;
  environment_count: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  description?: string;
  project_ids: string[];
  created_at: number;
  updated_at: number;
}

export interface ProjectRecord {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  icon?: string;
  root_directory?: string;
  environment_ids: string[];
  is_favorite: boolean;
  created_at: number;
  updated_at: number;
}

export interface EnvironmentRecord {
  id: string;
  project_id: string;
  name: string;
  color?: string;
  icon?: string;
  is_default: boolean;
  is_production: boolean;
  created_at: number;
  updated_at: number;
}

export interface VariableSummary {
  id: string;
  key: string;
  var_type: VarType;
  description?: string;
  tags: string[];
  has_value: boolean;
  expires_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface ComparisonEntry {
  key: string;
  status:
    | "identical"
    | "different"
    | "missing_in_first"
    | "missing_in_second"
    | "empty"
    | "type_mismatch";
}

export interface ComparisonResult {
  entries: ComparisonEntry[];
  identical_count: number;
  different_count: number;
  missing_in_a_count: number;
  missing_in_b_count: number;
}

export interface ImportPreview {
  total_keys: number;
  new_keys: string[];
  duplicate_keys: string[];
}

export interface TursoConfig {
  enabled: boolean;
  databaseUrl: string;
  authToken: string;
  autoSync: boolean;
  lastSyncedAt: number | null;
}

export interface TursoTestResponse {
  success: boolean;
  latencyMs: number;
  message: string;
}

export interface TursoSyncResult {
  success: boolean;
  count: number;
  timestamp: number;
  message: string;
}

export interface TursoRemoteStatus {
  configured: boolean;
  recordCount: number;
  lastRemoteUpdate: number | null;
}

export interface UserSession {
  userId: string;
  email: string;
}

export interface UserAccountSummary {
  id: string;
  email: string;
  hasLocalVault: boolean;
  createdAt: number;
}

export interface AuthResponse {
  userId: string;
  email: string;
  recoveryKey?: string;
  workspaceCount: number;
  projectCount: number;
  environmentCount: number;
}

export interface AuthStatusResponse {
  isUnlocked: boolean;
  currentUser: UserSession | null;
  localAccounts: UserAccountSummary[];
  vaultPath: string;
}

export interface BiometricStatus {
  isAvailable: boolean;
  isEnrolled: boolean;
  platform: string;
}

export interface VariableRevision {
  id: string;
  envId: string;
  varId: string;
  varKey: string;
  action: "create" | "update" | "delete" | "rollback";
  previousValue?: string;
  newValue?: string;
  author: string;
  timestamp: number;
}

export interface SharedProjectSummary {
  id: string;
  projectId: string;
  projectName: string;
  senderEmail: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: number;
}

export type VaultRole = "admin" | "editor" | "viewer";

export interface BreachResult {
  breached: boolean;
  count: number;
}

export interface KeyBreachResult {
  key: string;
  breached: boolean;
  count: number;
}

export interface MergeDiffItem {
  key: string;
  status: "new" | "modified" | "identical" | "missing_in_source";
  source_has_value: boolean;
  target_has_value: boolean;
  source_value?: string;
  target_value?: string;
  var_type: VarType;
  description?: string;
  expires_at?: number | null;
}

export interface MergeDiffReport {
  source_env_name: string;
  target_env_name: string;
  items: MergeDiffItem[];
  new_count: number;
  modified_count: number;
  identical_count: number;
  missing_count: number;
}

export interface MergeResultSummary {
  applied_count: number;
  target_env_name: string;
}




