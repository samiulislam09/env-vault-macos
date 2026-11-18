use localvault_core::{LvError, LvResult};

/// Validate if an environment variable key meets naming standards.
/// Standard naming: starts with [A-Za-z_], followed by [A-Za-z0-9_]*.
pub fn validate_variable_key(key: &str) -> LvResult<()> {
    let trimmed = key.trim().trim_matches('"').trim_matches('\'');
    if trimmed.is_empty() {
        return Err(LvError::InvalidVariableKey(
            "Variable key cannot be empty".to_string(),
        ));
    }

    let mut chars = trimmed.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_alphanumeric() && first != '_' {
        return Err(LvError::InvalidVariableKey(format!(
            "Variable key must start with an alphanumeric character or underscore: '{key}'"
        )));
    }

    for c in chars {
        if !c.is_ascii_alphanumeric() && c != '_' && c != '-' && c != '.' {
            return Err(LvError::InvalidVariableKey(format!(
                "Variable key contains invalid character '{c}'. Only alphanumeric, underscores, hyphens, and dots are allowed: '{key}'"
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_keys() {
        assert!(validate_variable_key("DATABASE_URL").is_ok());
        assert!(validate_variable_key("_SECRET").is_ok());
        assert!(validate_variable_key("API_KEY_V2").is_ok());
        assert!(validate_variable_key("PORT").is_ok());
        assert!(validate_variable_key("DASH-ALLOWED-KEY").is_ok());
        assert!(validate_variable_key("app.config.port").is_ok());
        assert!(validate_variable_key("123_NUMERIC_PREFIX").is_ok());
    }

    #[test]
    fn test_invalid_keys() {
        assert!(validate_variable_key("").is_err());
        assert!(validate_variable_key("HAS SPACE").is_err());
        assert!(validate_variable_key("SPECIAL$CHAR").is_err());
    }
}
