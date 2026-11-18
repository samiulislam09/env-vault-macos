use localvault_core::ComparisonStatus;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

use crate::variable::Variable;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ComparisonEntry {
    pub key: String,
    pub status: ComparisonStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonResult {
    pub entries: Vec<ComparisonEntry>,
    pub identical_count: usize,
    pub different_count: usize,
    pub missing_in_a_count: usize,
    pub missing_in_b_count: usize,
}

/// Compare variables between Environment A and Environment B.
/// Performed securely in Rust: NEVER returns secret values, only status classifications.
pub fn compare_environments(
    vars_a: &[Variable],
    vars_b: &[Variable],
) -> ComparisonResult {
    let map_a: BTreeMap<&str, &Variable> = vars_a.iter().map(|v| (v.key.as_str(), v)).collect();
    let map_b: BTreeMap<&str, &Variable> = vars_b.iter().map(|v| (v.key.as_str(), v)).collect();

    let mut all_keys: HashSet<&str> = HashSet::new();
    all_keys.extend(map_a.keys());
    all_keys.extend(map_b.keys());

    let mut sorted_keys: Vec<&str> = all_keys.into_iter().collect();
    sorted_keys.sort();

    let mut entries = Vec::new();
    let mut identical_count = 0;
    let mut different_count = 0;
    let mut missing_in_a_count = 0;
    let mut missing_in_b_count = 0;

    for key in sorted_keys {
        let entry_a = map_a.get(key);
        let entry_b = map_b.get(key);

        let status = match (entry_a, entry_b) {
            (Some(a), Some(b)) => {
                if a.value == b.value {
                    if a.var_type != b.var_type {
                        ComparisonStatus::TypeMismatch
                    } else if a.value.is_empty() {
                        ComparisonStatus::Empty
                    } else {
                        identical_count += 1;
                        ComparisonStatus::Identical
                    }
                } else {
                    different_count += 1;
                    ComparisonStatus::Different
                }
            }
            (None, Some(_)) => {
                missing_in_a_count += 1;
                ComparisonStatus::MissingInFirst
            }
            (Some(_), None) => {
                missing_in_b_count += 1;
                ComparisonStatus::MissingInSecond
            }
            (None, None) => unreachable!(),
        };

        entries.push(ComparisonEntry {
            key: key.to_string(),
            status,
        });
    }

    ComparisonResult {
        entries,
        identical_count,
        different_count,
        missing_in_a_count,
        missing_in_b_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use localvault_core::VarType;

    #[test]
    fn test_compare_environments() {
        let var_common_same = Variable::new(
            "PORT".to_string(),
            "3000".to_string(),
            VarType::Number,
            None,
            vec![],
        );
        let var_common_diff_a = Variable::new(
            "DB_URL".to_string(),
            "postgres://localhost:5432/dev".to_string(),
            VarType::Secret,
            None,
            vec![],
        );
        let var_common_diff_b = Variable::new(
            "DB_URL".to_string(),
            "postgres://prod-db.internal:5432/prod".to_string(),
            VarType::Secret,
            None,
            vec![],
        );
        let var_only_a = Variable::new(
            "DEV_TOOL".to_string(),
            "true".to_string(),
            VarType::Boolean,
            None,
            vec![],
        );
        let var_only_b = Variable::new(
            "PROD_KEY".to_string(),
            "xyz".to_string(),
            VarType::Secret,
            None,
            vec![],
        );

        let env_a = vec![var_common_same.clone(), var_common_diff_a, var_only_a];
        let env_b = vec![var_common_same, var_common_diff_b, var_only_b];

        let result = compare_environments(&env_a, &env_b);

        assert_eq!(result.identical_count, 1);
        assert_eq!(result.different_count, 1);
        assert_eq!(result.missing_in_a_count, 1);
        assert_eq!(result.missing_in_b_count, 1);
    }
}
