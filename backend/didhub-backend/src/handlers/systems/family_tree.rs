use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Query};
use axum::http::HeaderMap;
use axum::response::Json;
use serde_json::{json, Value};

use crate::error::ApiError;
use crate::state::AppState;

// DB-backed implementation for GET /systems/family-tree
// Returns a tree structure rooted at `startId` (query param) up to `depth` (query param).
#[allow(clippy::unused_async)]
pub async fn get(
    Extension(state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    let params = query.map(|q| q.0).unwrap_or_default();
    let start_id_param = params.get("startId").cloned();
    let depth = params
        .get("depth")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(2);

    // Acquire DB connection
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Load users, alters, relationships
    let users = didhub_db::generated::users::list_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    let alters = didhub_db::generated::alters::list_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    let relationships = didhub_db::generated::relationships::list_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    // Build node map and adjacency
    #[derive(Clone)]
    struct NodeInfo {
        #[allow(dead_code)]
        id: String,
        label: String,
        kind: String, // "user" or "alter"
    }

    let mut nodes: HashMap<String, NodeInfo> = HashMap::new();
    for u in users.into_iter() {
        let id_str = format!("user:{}", u.id);
        let label = u.display_name.clone().unwrap_or(u.username);
        nodes.insert(
            id_str.clone(),
            NodeInfo {
                id: id_str,
                label,
                kind: "user".to_string(),
            },
        );
    }
    for a in alters.into_iter() {
        let id_str = format!("alter:{}", a.id);
        let label = a.name.clone();
        nodes.insert(
            id_str.clone(),
            NodeInfo {
                id: id_str,
                label,
                kind: "alter".to_string(),
            },
        );
    }

    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    let mut add_edge = |a: &str, b: &str| {
        adj.entry(a.to_string()).or_default().push(b.to_string());
        adj.entry(b.to_string()).or_default().push(a.to_string());
    };

    for r in relationships.into_iter() {
        let side_a = if let Some(uid) = r.side_a_user_id {
            format!("user:{}", uid)
        } else if let Some(aid) = r.side_a_alter_id {
            format!("alter:{}", aid)
        } else {
            continue;
        };
        let side_b = if let Some(uid) = r.side_b_user_id {
            format!("user:{}", uid)
        } else if let Some(aid) = r.side_b_alter_id {
            format!("alter:{}", aid)
        } else {
            continue;
        };
        // only add edge if both nodes exist
        if nodes.contains_key(&side_a) && nodes.contains_key(&side_b) {
            add_edge(&side_a, &side_b);
        }
    }

    // Choose start node
    let start_node: Option<String> = if let Some(s) = start_id_param {
        // allow receiving ids with or without prefix
        if nodes.contains_key(&s) {
            Some(s)
        } else if nodes.contains_key(&format!("user:{}", s)) {
            Some(format!("user:{}", s))
        } else if nodes.contains_key(&format!("alter:{}", s)) {
            Some(format!("alter:{}", s))
        } else {
            // fallback to any node
            nodes.keys().next().cloned()
        }
    } else {
        nodes.keys().next().cloned()
    };

    let root_id = match start_node {
        Some(s) => s,
        None => return Ok(Json(json!({ "root": null }))),
    };

    // BFS to build tree up to depth
    use std::collections::HashSet;
    let mut visited: HashSet<String> = HashSet::new();
    visited.insert(root_id.clone());

    #[derive(serde::Serialize)]
    struct TreeNode {
        id: String,
        name: String,
        #[serde(rename = "type")]
        kind: String,
        children: Vec<TreeNode>,
    }

    fn build_subtree(
        id: &str,
        adj: &HashMap<String, Vec<String>>,
        nodes: &HashMap<String, NodeInfo>,
        visited: &mut std::collections::HashSet<String>,
        depth: usize,
    ) -> TreeNode {
        let info = nodes.get(id).unwrap();
        let mut children = Vec::new();
        if depth > 0 {
            if let Some(nbs) = adj.get(id) {
                for nb in nbs.iter() {
                    if visited.contains(nb) {
                        continue;
                    }
                    visited.insert(nb.clone());
                    let subtree = build_subtree(nb, adj, nodes, visited, depth - 1);
                    children.push(subtree);
                }
            }
        }
        TreeNode {
            id: id.to_string(),
            name: info.label.clone(),
            kind: info.kind.clone(),
            children,
        }
    }

    let mut visited2 = visited.clone();
    let tree = build_subtree(&root_id, &adj, &nodes, &mut visited2, depth);

    Ok(Json(json!({ "root": tree })))
}
