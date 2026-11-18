pub mod comparison;
pub mod validation;
pub mod variable;

pub use comparison::{compare_environments, ComparisonEntry, ComparisonResult};
pub use validation::validate_variable_key;
pub use variable::Variable;
