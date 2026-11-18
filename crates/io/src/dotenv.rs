use localvault_core::LvResult;
use localvault_variables::{validate_variable_key, Variable};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedEnvEntry {
    pub key: String,
    pub value: String,
    pub comment: Option<String>,
}

/// Robust .env format parser.
/// Handles:
/// - Leading/trailing whitespace
/// - Comments starting with '#'
/// - Key=Value pairs
/// - Quotes: single '...' (literal) and double "..." (with escape sequences)
/// - Multiline values within quotes
/// - Export prefix: e.g. `export KEY=VALUE`
pub fn parse_dotenv(content: &str) -> LvResult<Vec<ParsedEnvEntry>> {
    let mut entries = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut idx = 0;

    while idx < lines.len() {
        let raw_line = lines[idx];
        let trimmed = raw_line.trim();

        // Skip blank lines and pure comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            idx += 1;
            continue;
        }

        let mut line_to_parse = trimmed;
        // Strip optional `export ` prefix
        if line_to_parse.starts_with("export ") {
            line_to_parse = line_to_parse["export ".len()..].trim_start();
        }

        // Split on first '='
        if let Some(equals_pos) = line_to_parse.find('=') {
            let mut key = line_to_parse[..equals_pos].trim().to_string();
            if (key.starts_with('"') && key.ends_with('"'))
                || (key.starts_with('\'') && key.ends_with('\''))
            {
                if key.len() >= 2 {
                    key = key[1..key.len() - 1].trim().to_string();
                }
            }
            let remainder = line_to_parse[equals_pos + 1..].trim_start();

            // Validate key
            if let Err(e) = validate_variable_key(&key) {
                eprintln!("Warning skipping invalid env key: {e}");
                idx += 1;
                continue;
            }

            // Parse value (handling quotes and multiline)
            let (value, lines_consumed) = parse_value(remainder, &lines[idx + 1..])?;
            idx += 1 + lines_consumed;

            entries.push(ParsedEnvEntry {
                key,
                value,
                comment: None,
            });
        } else {
            idx += 1;
        }
    }

    Ok(entries)
}

fn parse_value(start: &str, following_lines: &[&str]) -> LvResult<(String, usize)> {
    if start.starts_with('"') {
        // Double quoted: can span multiple lines, supports escape sequences
        let mut value = String::new();
        let rest = &start[1..];

        if let Some(end_quote) = find_closing_quote(rest, '"') {
            value.push_str(&rest[..end_quote]);
            return Ok((unescape_double_quotes(&value), 0));
        }

        // Multiline double quote
        value.push_str(rest);
        value.push('\n');
        let mut consumed = 0;

        for (i, line) in following_lines.iter().enumerate() {
            consumed = i + 1;
            if let Some(end_quote) = find_closing_quote(line, '"') {
                value.push_str(&line[..end_quote]);
                return Ok((unescape_double_quotes(&value), consumed));
            } else {
                value.push_str(line);
                value.push('\n');
            }
        }

        // Unclosed quote: return whatever we read
        Ok((unescape_double_quotes(&value), consumed))
    } else if start.starts_with('\'') {
        // Single quoted: literal string, no escape sequences
        let rest = &start[1..];
        if let Some(end_quote) = rest.find('\'') {
            return Ok((rest[..end_quote].to_string(), 0));
        }

        let mut value = rest.to_string();
        value.push('\n');
        let mut consumed = 0;

        for (i, line) in following_lines.iter().enumerate() {
            consumed = i + 1;
            if let Some(end_quote) = line.find('\'') {
                value.push_str(&line[..end_quote]);
                return Ok((value, consumed));
            } else {
                value.push_str(line);
                value.push('\n');
            }
        }

        Ok((value, consumed))
    } else {
        // Unquoted: inline comment stripping after space
        let mut val = start;
        if let Some(comment_pos) = val.find(" #") {
            val = &val[..comment_pos];
        }
        Ok((val.trim().to_string(), 0))
    }
}

fn find_closing_quote(s: &str, quote: char) -> Option<usize> {
    let mut escaped = false;
    for (i, c) in s.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if c == '\\' {
            escaped = true;
            continue;
        }
        if c == quote {
            return Some(i);
        }
    }
    None
}

fn unescape_double_quotes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(next) = chars.next() {
                match next {
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    '\\' => out.push('\\'),
                    '"' => out.push('"'),
                    other => {
                        out.push('\\');
                        out.push(other);
                    }
                }
            } else {
                out.push('\\');
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Format a list of Variables into .env format.
pub fn format_dotenv(variables: &[Variable]) -> String {
    let mut out = String::new();
    out.push_str("# Exported by LocalVault\n\n");

    for var in variables {
        if let Some(ref desc) = var.description {
            out.push_str(&format!("# {}\n", desc));
        }

        // Format value: quote if contains special chars or newlines
        let value_str = if var.value.contains('\n') || var.value.contains('"') || var.value.contains(' ') {
            format!("\"{}\"", var.value.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n"))
        } else {
            var.value.clone()
        };

        out.push_str(&format!("{}={}\n", var.key, value_str));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use localvault_core::VarType;

    #[test]
    fn test_parse_simple_dotenv() {
        let content = r#"
# Server settings
PORT=8080
DATABASE_URL=postgres://localhost/db
DEBUG=true
"#;
        let parsed = parse_dotenv(content).unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].key, "PORT");
        assert_eq!(parsed[0].value, "8080");
        assert_eq!(parsed[1].key, "DATABASE_URL");
        assert_eq!(parsed[1].value, "postgres://localhost/db");
    }

    #[test]
    fn test_parse_quoted_dotenv() {
        let content = r#"
DOUBLE="Hello \"World\"\nNew Line"
SINGLE='Literal $Value without \n escape'
EXPORT_VAR=export VAR=value
"#;
        let parsed = parse_dotenv(content).unwrap();
        assert_eq!(parsed[0].key, "DOUBLE");
        assert_eq!(parsed[0].value, "Hello \"World\"\nNew Line");
        assert_eq!(parsed[1].key, "SINGLE");
        assert_eq!(parsed[1].value, "Literal $Value without \\n escape");
    }

    #[test]
    fn test_format_and_reparse_dotenv() {
        let original = vec![
            Variable::new("PORT".into(), "3000".into(), VarType::Number, None, vec![]),
            Variable::new("SECRET".into(), "my secret key".into(), VarType::Secret, Some("App Secret".into()), vec![]),
        ];

        let formatted = format_dotenv(&original);
        let parsed = parse_dotenv(&formatted).unwrap();

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].key, "PORT");
        assert_eq!(parsed[0].value, "3000");
        assert_eq!(parsed[1].key, "SECRET");
        assert_eq!(parsed[1].value, "my secret key");
    }
}
