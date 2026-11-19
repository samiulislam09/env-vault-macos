use localvault_core::{EnvId, LvError, RecordId, VarType};
use localvault_environments::EnvironmentRecord;
use localvault_storage::atomic_write;
use localvault_variables::Variable;
use localvault_vault::{EnvironmentEntry, VaultState};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeDiffItem {
    pub key: String,
    pub status: String, // "new", "modified", "identical", "missing_in_source"
    pub source_has_value: bool,
    pub target_has_value: bool,
    pub source_value: Option<String>,
    pub target_value: Option<String>,
    pub var_type: VarType,
    pub description: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeDiffReport {
    pub source_env_name: String,
    pub target_env_name: String,
    pub items: Vec<MergeDiffItem>,
    pub new_count: usize,
    pub modified_count: usize,
    pub identical_count: usize,
    pub missing_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeEnvironmentsInput {
    pub source_env_id: String,
    pub target_env_id: String,
    pub selected_keys: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergeResultSummary {
    pub applied_count: usize,
    pub target_env_name: String,
}

#[tauri::command]
pub async fn get_merge_diff_cmd(
    source_env_id: String,
    target_env_id: String,
    state: State<'_, VaultState>,
) -> Result<MergeDiffReport, String> {
    let src_id = EnvId::parse(&source_env_id).map_err(|e| e.to_string())?;
    let tgt_id = EnvId::parse(&target_env_id).map_err(|e| e.to_string())?;

    state
        .with_unlocked(|vault| {
            let src_entry = vault
                .manifest
                .environments
                .iter()
                .find(|e| e.id == src_id)
                .ok_or_else(|| LvError::EnvironmentNotFound(source_env_id.clone()))?;

            let tgt_entry = vault
                .manifest
                .environments
                .iter()
                .find(|e| e.id == tgt_id)
                .ok_or_else(|| LvError::EnvironmentNotFound(target_env_id.clone()))?;

            let src_env =
                EnvironmentRecord::load(&src_entry.record_id, &vault.vek, &vault.paths)?;
            let tgt_env =
                EnvironmentRecord::load(&tgt_entry.record_id, &vault.vek, &vault.paths)?;

            let map_src: BTreeMap<&str, &Variable> =
                src_env.variables.iter().map(|v| (v.key.as_str(), v)).collect();
            let map_tgt: BTreeMap<&str, &Variable> =
                tgt_env.variables.iter().map(|v| (v.key.as_str(), v)).collect();

            let mut all_keys: HashSet<&str> = HashSet::new();
            all_keys.extend(map_src.keys());
            all_keys.extend(map_tgt.keys());

            let mut sorted_keys: Vec<&str> = all_keys.into_iter().collect();
            sorted_keys.sort();

            let mut items = Vec::new();
            let mut new_count = 0;
            let mut modified_count = 0;
            let mut identical_count = 0;
            let mut missing_count = 0;

            for key in sorted_keys {
                let s_opt = map_src.get(key);
                let t_opt = map_tgt.get(key);

                match (s_opt, t_opt) {
                    (Some(s), None) => {
                        new_count += 1;
                        items.push(MergeDiffItem {
                            key: key.to_string(),
                            status: "new".to_string(),
                            source_has_value: !s.value.is_empty(),
                            target_has_value: false,
                            source_value: Some(s.value.clone()),
                            target_value: None,
                            var_type: s.var_type,
                            description: s.description.clone(),
                            expires_at: s.expires_at,
                        });
                    }
                    (Some(s), Some(t)) => {
                        if s.value == t.value && s.var_type == t.var_type {
                            identical_count += 1;
                            items.push(MergeDiffItem {
                                key: key.to_string(),
                                status: "identical".to_string(),
                                source_has_value: !s.value.is_empty(),
                                target_has_value: !t.value.is_empty(),
                                source_value: Some(s.value.clone()),
                                target_value: Some(t.value.clone()),
                                var_type: s.var_type,
                                description: s.description.clone(),
                                expires_at: s.expires_at,
                            });
                        } else {
                            modified_count += 1;
                            items.push(MergeDiffItem {
                                key: key.to_string(),
                                status: "modified".to_string(),
                                source_has_value: !s.value.is_empty(),
                                target_has_value: !t.value.is_empty(),
                                source_value: Some(s.value.clone()),
                                target_value: Some(t.value.clone()),
                                var_type: s.var_type,
                                description: s.description.clone(),
                                expires_at: s.expires_at,
                            });
                        }
                    }
                    (None, Some(t)) => {
                        missing_count += 1;
                        items.push(MergeDiffItem {
                            key: key.to_string(),
                            status: "missing_in_source".to_string(),
                            source_has_value: false,
                            target_has_value: !t.value.is_empty(),
                            source_value: None,
                            target_value: Some(t.value.clone()),
                            var_type: t.var_type,
                            description: t.description.clone(),
                            expires_at: t.expires_at,
                        });
                    }
                    (None, None) => unreachable!(),
                }
            }

            Ok(MergeDiffReport {
                source_env_name: src_env.name,
                target_env_name: tgt_env.name,
                items,
                new_count,
                modified_count,
                identical_count,
                missing_count,
            })
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_environments_cmd(
    input: MergeEnvironmentsInput,
    state: State<'_, VaultState>,
) -> Result<MergeResultSummary, String> {
    let src_id = EnvId::parse(&input.source_env_id).map_err(|e| e.to_string())?;
    let tgt_id = EnvId::parse(&input.target_env_id).map_err(|e| e.to_string())?;

    let res = state
        .with_unlocked(|vault| {
            let src_entry = vault
                .manifest
                .environments
                .iter()
                .find(|e| e.id == src_id)
                .ok_or_else(|| LvError::EnvironmentNotFound(input.source_env_id.clone()))?;

            let tgt_entry = vault
                .manifest
                .environments
                .iter()
                .find(|e| e.id == tgt_id)
                .ok_or_else(|| LvError::EnvironmentNotFound(input.target_env_id.clone()))?;

            let src_env =
                EnvironmentRecord::load(&src_entry.record_id, &vault.vek, &vault.paths)?;
            let mut tgt_env =
                EnvironmentRecord::load(&tgt_entry.record_id, &vault.vek, &vault.paths)?;

            let author = super::auth::get_active_session()
                .map(|s| s.email)
                .unwrap_or_else(|| "Local User".to_string());
            let merge_author = format!("{} (Merged from {})", author, src_env.name);

            let mut applied_count = 0;

            for key in &input.selected_keys {
                if let Some(src_var) = src_env.variables.iter().find(|v| v.key == *key) {
                    if let Some(tgt_var) = tgt_env.variables.iter_mut().find(|v| v.key == *key) {
                        let old_val = tgt_var.value.clone();
                        tgt_var.value = src_var.value.clone();
                        tgt_var.var_type = src_var.var_type;
                        tgt_var.description = src_var.description.clone();
                        tgt_var.tags = src_var.tags.clone();
                        tgt_var.expires_at = src_var.expires_at;
                        tgt_var.updated_at = localvault_core::now_timestamp();

                        super::revisions::record_variable_revision(
                            vault,
                            &input.target_env_id,
                            &tgt_var.id.to_string_repr(),
                            &tgt_var.key,
                            "update",
                            Some(&old_val),
                            Some(&tgt_var.value),
                            &merge_author,
                        );
                        applied_count += 1;
                    } else {
                        let mut new_var = Variable::new(
                            src_var.key.clone(),
                            src_var.value.clone(),
                            src_var.var_type,
                            src_var.description.clone(),
                            src_var.tags.clone(),
                        );
                        new_var.expires_at = src_var.expires_at;

                        super::revisions::record_variable_revision(
                            vault,
                            &input.target_env_id,
                            &new_var.id.to_string_repr(),
                            &new_var.key,
                            "create",
                            None,
                            Some(&new_var.value),
                            &merge_author,
                        );

                        tgt_env.variables.push(new_var);
                        applied_count += 1;
                    }
                }
            }

            tgt_env.updated_at = localvault_core::now_timestamp();
            tgt_env.save(&tgt_entry.record_id, &vault.vek, &vault.paths)?;

            Ok(MergeResultSummary {
                applied_count,
                target_env_name: tgt_env.name,
            })
        })
        .map_err(|e| e.to_string())?;

    super::turso::trigger_auto_sync_background();
    Ok(res)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchEnvInput {
    pub source_env_id: String,
    pub branch_name: String,
}

#[tauri::command]
pub async fn branch_environment_cmd(
    input: BranchEnvInput,
    state: State<'_, VaultState>,
) -> Result<EnvironmentRecord, String> {
    let src_id = EnvId::parse(&input.source_env_id).map_err(|e| e.to_string())?;

    let res = state
        .with_unlocked_mut(|vault| {
            let entry = vault
                .manifest
                .environments
                .iter()
                .find(|e| e.id == src_id)
                .ok_or_else(|| LvError::EnvironmentNotFound(input.source_env_id.clone()))?
                .clone();

            let src_env =
                EnvironmentRecord::load(&entry.record_id, &vault.vek, &vault.paths)?;

            let new_env_id = EnvId::new();
            let new_record_id = RecordId::new();

            // Branch environments default to non-production
            let new_env = src_env.duplicate(new_env_id, input.branch_name, false);
            new_env.save(&new_record_id, &vault.vek, &vault.paths)?;

            vault.manifest.environments.push(EnvironmentEntry {
                id: new_env_id,
                project_id: entry.project_id,
                record_id: new_record_id,
                version: 1,
            });

            // Update project record's environment_ids
            for proj_entry in &vault.manifest.projects {
                if proj_entry.id == entry.project_id {
                    if let Ok(mut proj_rec) =
                        localvault_projects::ProjectRecord::load(
                            &proj_entry.record_id,
                            &vault.vek,
                            &vault.paths,
                        )
                    {
                        proj_rec.environment_ids.push(new_env_id);
                        let _ = proj_rec.save(&proj_entry.record_id, &vault.vek, &vault.paths);
                    }
                }
            }

            // Save updated manifest
            let manifest_bytes = vault.manifest.encrypt(&vault.vek)?;
            atomic_write(&vault.paths.manifest_file(), &manifest_bytes)?;

            Ok(new_env)
        })
        .map_err(|e| e.to_string())?;

    super::turso::trigger_auto_sync_background();
    Ok(res)
}
