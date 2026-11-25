#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod commands;
mod container;
mod features;
mod infra;
mod shared;

fn main() {
    shared::env::isolate_webview_data();
    bootstrap::run();
}
