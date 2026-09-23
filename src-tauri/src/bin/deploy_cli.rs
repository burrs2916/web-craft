//! CLI deployment trigger — bypasses Tauri IPC to call DeployService::deploy directly.
//! Usage:
//!   cargo run --bin deploy_cli -- [site_id]

use std::sync::Arc;
use web_craft_lib::app::deploy_service::{DeployProgress, DeployService};
use web_craft_lib::app::sftp_service::SftpService;
use web_craft_lib::infra::security::crypto;
use web_craft_lib::infra::storage::database::Database;

fn main() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let data_dir = std::path::Path::new(manifest_dir).join(".data").join("dev");
    let db_path = data_dir.join("webcraft.db");

    // Initialize crypto (needed to decrypt SSH passwords)
    if let Err(e) = crypto::init(&data_dir) {
        eprintln!("[warn] crypto init failed: {} (passwords may not decrypt)", e);
    }

    // Open database
    let db = match Database::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            eprintln!("[error] failed to open database at {:?}: {}", db_path, e);
            std::process::exit(1);
        }
    };

    // Site ID from arg or default
    let site_id = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "site-2fe27e8a-c913-4f1b-9199-667c9ec1b13a".to_string());

    println!("============================================================");
    println!("  WebCraft CLI Deploy");
    println!("  Site ID: {}", site_id);
    println!("  Data dir: {:?}", data_dir);
    println!("============================================================\n");

    // Create SftpService (empty, connections established on-demand)
    let sftp = SftpService::new();

    // Progress callback
    let on_progress: Arc<dyn Fn(DeployProgress) + Send + Sync> = Arc::new(|p| {
        println!("  [{:>3}%] {} — {}", p.percent, p.step, p.message);
    });

    // Deploy
    let started = std::time::Instant::now();
    match DeployService::deploy(
        &db,
        &sftp,
        &site_id,
        &data_dir,
        "manual",
        on_progress,
    ) {
        Ok(outcome) => {
            println!("\n============================================================");
            println!("  DEPLOYMENT SUCCESS");
            println!("============================================================");
            println!("  Deployment ID: {}", outcome.deployment_id);
            println!("  Base URL:      {}", outcome.base_url);
            println!("  Uploaded:       {} files", outcome.uploaded_count);
            println!("  Data size:      {} bytes", outcome.total_bytes);
            println!("  Duration:       {} ms", outcome.duration_ms);
            println!("============================================================\n");

            println!("--- Deployment Log ---");
            for line in &outcome.log {
                println!("{}", line);
            }
        }
        Err(e) => {
            println!("\n============================================================");
            println!("  DEPLOYMENT FAILED");
            println!("============================================================");
            println!("  Error: {}", e);
            println!("  Elapsed: {:?}", started.elapsed());
            println!("============================================================\n");

            // Print any partial log from the error
            if let Some(log) = e.to_string().strip_prefix("[failed] ") {
                println!("  Detail: {}", log);
            }
        }
    }
}
