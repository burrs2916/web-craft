#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(e) = web_craft_lib::run() {
        eprintln!("error while running tauri application: {}", e);
        std::process::exit(1);
    }
}
