use localvault_core::{EnvId, LvError, VarId, VarType};
use localvault_environments::EnvironmentRecord;
use localvault_variables::{
    compare_environments, validate_variable_key, ComparisonResult, Variable,
};
use localvault_vault::VaultState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableSummary {
    pub id: String,
    pub key: String,
    pub var_type: VarType,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub has_value: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn list_variables_cmd(
    env_id: String,
    state: State<'_, VaultState>,
) -> Result<Vec<VariableSummary>, String> {
    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_id.clone()))?;

        let env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        let summaries = env
            .variables
            .iter()
            .map(|v| VariableSummary {
                id: v.id.to_string_repr(),
                key: v.key.clone(),
                var_type: v.var_type,
                description: v.description.clone(),
                tags: v.tags.clone(),
                has_value: !v.value.is_empty(),
                created_at: v.created_at,
                updated_at: v.updated_at,
            })
            .collect();

        Ok(summaries)
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reveal_variable_value_cmd(
    env_id: String,
    var_id: String,
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;
    let vid = VarId::parse(&var_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_id.clone()))?;

        let env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        let var = env
            .variables
            .iter()
            .find(|v| v.id == vid)
            .ok_or_else(|| LvError::VariableNotFound(var_id.clone()))?;

        Ok(var.value.clone())
    }).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateVarInput {
    pub env_id: String,
    pub key: String,
    pub value: String,
    pub var_type: VarType,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[tauri::command]
pub async fn create_variable_cmd(
    input: CreateVarInput,
    state: State<'_, VaultState>,
) -> Result<VariableSummary, String> {
    validate_variable_key(&input.key).map_err(|e| e.to_string())?;
    let eid = EnvId::parse(&input.env_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(input.env_id.clone()))?;

        let mut env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        // Check for duplicate key in this environment
        if env.variables.iter().any(|v| v.key == input.key) {
            return Err(LvError::DuplicateKey(input.key.clone()));
        }

        let new_var = Variable::new(
            input.key,
            input.value,
            input.var_type,
            input.description,
            input.tags,
        );

        let summary = VariableSummary {
            id: new_var.id.to_string_repr(),
            key: new_var.key.clone(),
            var_type: new_var.var_type,
            description: new_var.description.clone(),
            tags: new_var.tags.clone(),
            has_value: !new_var.value.is_empty(),
            created_at: new_var.created_at,
            updated_at: new_var.updated_at,
        };

        env.variables.push(new_var);
        env.save(&entry.record_id, &vault.vek, &vault.paths)?;

        Ok(summary)
    }).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpdateVarInput {
    pub env_id: String,
    pub var_id: String,
    pub key: String,
    pub value: Option<String>,
    pub var_type: VarType,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[tauri::command]
pub async fn update_variable_cmd(
    input: UpdateVarInput,
    state: State<'_, VaultState>,
) -> Result<(), String> {
    validate_variable_key(&input.key).map_err(|e| e.to_string())?;
    let eid = EnvId::parse(&input.env_id).map_err(|e| e.to_string())?;
    let vid = VarId::parse(&input.var_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(input.env_id.clone()))?;

        let mut env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

        let var = env
            .variables
            .iter_mut()
            .find(|v| v.id == vid)
            .ok_or_else(|| LvError::VariableNotFound(input.var_id.clone()))?;

        var.key = input.key;
        if let Some(new_val) = input.value {
            var.value = new_val;
        }
        var.var_type = input.var_type;
        var.description = input.description;
        var.tags = input.tags;
        var.updated_at = localvault_core::now_timestamp();

        env.save(&entry.record_id, &vault.vek, &vault.paths)?;
        Ok(())
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_variable_cmd(
    env_id: String,
    var_id: String,
    state: State<'_, VaultState>,
) -> Result<(), String> {
    let eid = EnvId::parse(&env_id).map_err(|e| e.to_string())?;
    let vid = VarId::parse(&var_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let entry = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_id.clone()))?;

        let mut env = EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;
        env.variables.retain(|v| v.id != vid);
        env.save(&entry.record_id, &vault.vek, &vault.paths)?;

        Ok(())
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn compare_environments_cmd(
    env_a_id: String,
    env_b_id: String,
    state: State<'_, VaultState>,
) -> Result<ComparisonResult, String> {
    let eid_a = EnvId::parse(&env_a_id).map_err(|e| e.to_string())?;
    let eid_b = EnvId::parse(&env_b_id).map_err(|e| e.to_string())?;

    state.with_unlocked(|vault| {
        let entry_a = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid_a)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_a_id.clone()))?;

        let entry_b = vault
            .manifest
            .environments
            .iter()
            .find(|e| e.id == eid_b)
            .ok_or_else(|| LvError::EnvironmentNotFound(env_b_id.clone()))?;

        let env_a = EnvironmentRecord::load(&entry_a.record_id, &vault.vek, &vault.paths)?;
        let env_b = EnvironmentRecord::load(&entry_b.record_id, &vault.vek, &vault.paths)?;

        let result = compare_environments(&env_a.variables, &env_b.variables);
        Ok(result)
    }).map_err(|e| e.to_string())
}
