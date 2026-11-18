use localvault_core::VarType;
use localvault_variables::Variable;

#[derive(Debug, Clone)]
pub struct TemplateVariable {
    pub key: &'static str,
    pub var_type: VarType,
    pub description: &'static str,
}

#[derive(Debug, Clone)]
pub struct EnvironmentTemplate {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub variables: &'static [TemplateVariable],
}

pub const TEMPLATES: &[EnvironmentTemplate] = &[
    EnvironmentTemplate {
        id: "nextjs",
        name: "Next.js",
        description: "Standard Next.js frontend and API route environment variables",
        variables: &[
            TemplateVariable {
                key: "NEXT_PUBLIC_APP_URL",
                var_type: VarType::Url,
                description: "Public base URL of the frontend application",
            },
            TemplateVariable {
                key: "NEXT_PUBLIC_API_URL",
                var_type: VarType::Url,
                description: "Public API base URL",
            },
            TemplateVariable {
                key: "DATABASE_URL",
                var_type: VarType::Secret,
                description: "PostgreSQL or MySQL database connection string",
            },
            TemplateVariable {
                key: "NEXTAUTH_SECRET",
                var_type: VarType::Secret,
                description: "NextAuth / Auth.js encryption secret",
            },
            TemplateVariable {
                key: "NEXTAUTH_URL",
                var_type: VarType::Url,
                description: "Canonical URL of your site for NextAuth",
            },
        ],
    },
    EnvironmentTemplate {
        id: "nodejs",
        name: "Node.js / Express",
        description: "General Node.js backend server configuration",
        variables: &[
            TemplateVariable {
                key: "PORT",
                var_type: VarType::Number,
                description: "Server HTTP port",
            },
            TemplateVariable {
                key: "NODE_ENV",
                var_type: VarType::Configuration,
                description: "Runtime environment mode (development, staging, production)",
            },
            TemplateVariable {
                key: "JWT_SECRET",
                var_type: VarType::Secret,
                description: "JSON Web Token signing secret key",
            },
            TemplateVariable {
                key: "CORS_ORIGIN",
                var_type: VarType::Url,
                description: "Allowed origin for CORS requests",
            },
        ],
    },
    EnvironmentTemplate {
        id: "python",
        name: "Python / FastAPI",
        description: "FastAPI / Django / Flask Python environment setup",
        variables: &[
            TemplateVariable {
                key: "DEBUG",
                var_type: VarType::Boolean,
                description: "Enable debug mode",
            },
            TemplateVariable {
                key: "SECRET_KEY",
                var_type: VarType::Secret,
                description: "Application cryptographic secret key",
            },
            TemplateVariable {
                key: "DATABASE_URL",
                var_type: VarType::Secret,
                description: "Database connection URI",
            },
            TemplateVariable {
                key: "REDIS_URL",
                var_type: VarType::Secret,
                description: "Redis caching and message broker URL",
            },
        ],
    },
    EnvironmentTemplate {
        id: "ai_llm",
        name: "AI & LLM Services",
        description: "API keys and endpoints for modern AI/LLM providers",
        variables: &[
            TemplateVariable {
                key: "OPENAI_API_KEY",
                var_type: VarType::Secret,
                description: "OpenAI API secret key",
            },
            TemplateVariable {
                key: "ANTHROPIC_API_KEY",
                var_type: VarType::Secret,
                description: "Anthropic Claude API secret key",
            },
            TemplateVariable {
                key: "GEMINI_API_KEY",
                var_type: VarType::Secret,
                description: "Google Gemini API secret key",
            },
            TemplateVariable {
                key: "MODEL_NAME",
                var_type: VarType::Configuration,
                description: "Default foundation model identifier",
            },
        ],
    },
];

pub fn get_template(id: &str) -> Option<&'static EnvironmentTemplate> {
    TEMPLATES.iter().find(|t| t.id == id)
}

pub fn create_template_variables(template: &EnvironmentTemplate) -> Vec<Variable> {
    template
        .variables
        .iter()
        .map(|v| {
            Variable::new(
                v.key.to_string(),
                String::new(), // intentionally empty, no placeholder credentials
                v.var_type,
                Some(v.description.to_string()),
                vec![template.name.to_lowercase()],
            )
        })
        .collect()
}
