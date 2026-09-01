#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod commands;
mod container;
mod features;
mod infra;
mod shared;
#[cfg(test)]
#[path = "../test/shared/mod.rs"]
mod testing;

fn main() {
    shared::env::isolate_webview_data();
    bootstrap::run();
}
