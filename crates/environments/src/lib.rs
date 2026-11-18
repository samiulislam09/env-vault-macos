pub mod environment;
pub mod templates;

pub use environment::EnvironmentRecord;
pub use templates::{create_template_variables, get_template, EnvironmentTemplate, TEMPLATES};
