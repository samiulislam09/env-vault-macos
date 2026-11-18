use localvault_core::LvResult;
use localvault_variables::Variable;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub total_keys: usize,
    pub new_keys: Vec<String>,
    pub duplicate_keys: Vec<String>,
}

/// Generate a preview of variables to be imported against existing variables.
/// Security rule: Secret values are NEVER included in the preview payload!
pub fn generate_import_preview(
    imported_keys: &[String],
    existing_vars: &[Variable],
) -> LvResult<ImportPreview> {
    let existing_set: HashSet<&str> = existing_vars.iter().map(|v| v.key.as_str()).collect();

    let mut new_keys = Vec::new();
    let mut duplicate_keys = Vec::new();

    for key in imported_keys {
        if existing_set.contains(key.as_str()) {
            duplicate_keys.push(key.clone());
        } else {
            new_keys.push(key.clone());
        }
    }

    Ok(ImportPreview {
        total_keys: imported_keys.len(),
        new_keys,
        duplicate_keys,
    })
}
