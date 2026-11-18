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
