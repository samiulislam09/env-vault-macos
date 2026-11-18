use localvault_core::{LvError, LvResult};
use localvault_variables::Variable;
use serde_json::Value;
use std::collections::BTreeMap;

/// Parse a JSON string (either an object of key-value strings or structured objects).
pub fn parse_json_vars(content: &str) -> LvResult<Vec<(String, String)>> {
    let val: Value = serde_json::from_str(content)
        .map_err(|e| LvError::ImportError(format!("Invalid JSON: {e}")))?;

    let mut pairs = Vec::new();

    if let Value::Object(map) = val {
        for (k, v) in map {
            let val_str = match v {
                Value::String(s) => s,
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                Value::Null => String::new(),
                other => other.to_string(),
            };
            pairs.push((k, val_str));
        }
    } else {
        return Err(LvError::ImportError(
            "Root JSON must be a key-value object".to_string(),
        ));
    }

    Ok(pairs)
}

/// Format variables as a JSON string.
pub fn format_json_vars(variables: &[Variable]) -> LvResult<String> {
    let mut map = BTreeMap::new();
    for v in variables {
        map.insert(&v.key, &v.value);
    }

    serde_json::to_string_pretty(&map)
        .map_err(|e| LvError::ExportError(format!("Failed to serialize JSON: {e}")))
}
