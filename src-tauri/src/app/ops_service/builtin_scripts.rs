//! Built-in ops-script library, split by category.
//!
//! `builtin_scripts()` concatenates the category modules in their original
//! declaration order, so the seeded library keeps its historical ordering.

mod backup;
mod cert;
mod db;
mod deploy;
mod redis;
mod service;
mod system;
mod web;

use crate::core::types::{OpsScript, ParamKind, ScriptParam};

/// Built-in scripts shipped with the app.
pub(super) fn builtin_scripts() -> Vec<OpsScript> {
    let mut scripts = Vec::new();
    scripts.extend(web::scripts());
    scripts.extend(cert::scripts());
    scripts.extend(system::scripts());
    scripts.extend(backup::scripts());
    scripts.extend(deploy::scripts());
    scripts.extend(db::scripts());
    scripts.extend(service::scripts());
    scripts.extend(redis::scripts());
    scripts
}

pub(super) fn param(name: &str, label: &str) -> ScriptParam {
    ScriptParam {
        name: name.to_string(),
        label: label.to_string(),
        kind: ParamKind::Text,
        default_value: None,
        options: vec![],
        required: false,
    }
}

pub(super) fn select_param(name: &str, label: &str, options: &[&str]) -> ScriptParam {
    ScriptParam {
        name: name.to_string(),
        label: label.to_string(),
        kind: ParamKind::Select,
        default_value: options.first().map(|s| s.to_string()),
        options: options.iter().map(|s| s.to_string()).collect(),
        required: false,
    }
}
