// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

fn main() {
    let mut args = std::env::args();
    let _exe = args.next();
    if let Some(arg) = args.next() {
        if fontcluster_lib::commands::is_worker_run_jobs_arg(&arg) {
            let Some(request_json) = args.next() else {
                eprintln!("Missing worker request payload");
                std::process::exit(2);
            };
            if let Err(error) = fontcluster_lib::commands::run_jobs_worker(&request_json) {
                eprintln!("{error}");
                std::process::exit(1);
            }
            return;
        }
    }

    fontcluster_lib::run()
}
