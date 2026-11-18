use localvault_core::{now_timestamp, VarId, VarType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Variable {
    pub id: VarId,
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub var_type: VarType,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Variable {
    pub fn new(
        key: String,
        value: String,
        var_type: VarType,
        description: Option<String>,
        tags: Vec<String>,
    ) -> Self {
        let now = now_timestamp();
        Self {
            id: VarId::new(),
            key,
            value,
            description,
            var_type,
            tags,
            created_at: now,
            updated_at: now,
        }
    }
}
