use crate::config::SessionConfig;
use crate::error::{AppError, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

use super::session::AppState;

pub const PLUGIN_BRIDGE_PORT: u16 = 38653;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginFontMetadata {
    pub safe_name: String,
    pub font_name: String,
    pub family_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    #[serde(default)]
    pub style_name: String,
    #[serde(default)]
    pub style_names: HashMap<String, String>,
    #[serde(default)]
    pub preferred_style_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub weight: i32,
    pub weights: Vec<String>,
}

#[derive(Debug, Serialize)]
struct PluginDataResponse {
    session: Option<SessionConfig>,
    font: Option<PluginFontMetadata>,
    modified_date: Option<DateTime<Utc>>,
}

pub fn start_plugin_bridge_server(state: AppState) {
    thread::spawn(move || {
        if let Err(error) = run_plugin_bridge_server(state) {
            eprintln!("Failed to start plugin bridge server: {error}");
        }
    });
}

fn run_plugin_bridge_server(state: AppState) -> Result<()> {
    let listener = TcpListener::bind(("localhost", PLUGIN_BRIDGE_PORT)).map_err(|e| {
        AppError::Network(format!(
            "Failed to bind plugin bridge on localhost:{PLUGIN_BRIDGE_PORT}: {e}"
        ))
    })?;

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => handle_stream(stream, &state),
            Err(error) => eprintln!("Plugin bridge connection error: {error}"),
        }
    }

    Ok(())
}

fn handle_stream(mut stream: TcpStream, state: &AppState) {
    let mut buffer = [0_u8; 1024];
    let Ok(size) = stream.read(&mut buffer) else {
        return;
    };

    let request = String::from_utf8_lossy(&buffer[..size]);
    let first_line = request.lines().next().unwrap_or_default();

    if first_line.starts_with("OPTIONS ") {
        write_response(&mut stream, 204, "No Content", "text/plain", "");
        return;
    }

    if first_line.starts_with("GET /data ") {
        let session = state
            .current_session
            .lock()
            .map(|session| session.clone())
            .unwrap_or(None);
        let font = state
            .plugin_bridge_font
            .lock()
            .map(|payload| payload.clone())
            .unwrap_or(None);
        let modified_date = state
            .plugin_bridge_modified_date
            .lock()
            .map(|modified_date| *modified_date)
            .unwrap_or(None);
        let body = serde_json::to_string(&PluginDataResponse {
            session,
            font,
            modified_date,
        })
        .unwrap_or_else(|_| "{\"session\":null,\"font\":null,\"modified_date\":null}".to_string());

        write_response(&mut stream, 200, "OK", "application/json", &body);
        return;
    }

    write_response(&mut stream, 404, "Not Found", "text/plain", "Not found");
}

fn write_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    content_type: &str,
    body: &str,
) {
    let response = format!(
        "HTTP/1.1 {status_code} {status_text}\r\n\
        Content-Type: {content_type}\r\n\
        Content-Length: {}\r\n\
        Access-Control-Allow-Origin: *\r\n\
        Access-Control-Allow-Methods: GET, OPTIONS\r\n\
        Access-Control-Allow-Headers: Content-Type\r\n\
        Cache-Control: no-store\r\n\
        Connection: close\r\n\
        \r\n\
        {body}",
        body.len()
    );

    let _ = stream.write_all(response.as_bytes());
}
