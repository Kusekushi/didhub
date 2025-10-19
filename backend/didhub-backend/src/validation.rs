use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ValidationIssue {
    pub field: String,
    pub code: String,
    pub message: String,
}

impl ValidationIssue {
    pub fn new(
        field: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            field: field.into(),
            code: code.into(),
            message: message.into(),
        }
    }
}

pub fn to_payload(issues: &[ValidationIssue]) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for issue in issues {
        map.insert(
            issue.field.clone(),
            serde_json::json!({ "code": issue.code, "message": issue.message }),
        );
    }
    serde_json::json!({ "validation": serde_json::Value::Object(map) })
}
