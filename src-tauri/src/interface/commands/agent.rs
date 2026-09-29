use std::collections::HashMap;

mod conversation;
mod dto;
mod logging;
mod permission;
mod provider;
mod run;
mod setup;

static PENDING_PERMISSIONS: std::sync::LazyLock<tokio::sync::Mutex<HashMap<String, (tokio::sync::oneshot::Sender<(bool, bool)>, String, String)>>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));

pub use conversation::*;
pub use dto::*;
pub use logging::*;
pub use permission::*;
pub use provider::*;
pub use run::*;
pub use setup::*;
