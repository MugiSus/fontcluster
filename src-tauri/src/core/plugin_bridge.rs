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
const PLUGIN_CONNECTION_TIMEOUT_SECONDS: i64 = 5;

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
    #[serde(default)]
    pub copyright: Option<String>,
    #[serde(default)]
    pub trademark: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub postscript_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub vendor_url: Option<String>,
    #[serde(default)]
    pub designer_url: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub license_url: Option<String>,
    #[serde(default)]
    pub sample_text: Option<String>,
    pub weight: i32,
    pub weights: Vec<String>,
}

#[derive(Debug, Serialize)]
struct PluginDataResponse {
    session: Option<SessionConfig>,
    font: Option<PluginFontMetadata>,
    modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginConnection {
    pub plugin_id: String,
    pub plugin_name: String,
    pub host: String,
    pub document_name: Option<String>,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct PluginHeartbeatRequest {
    plugin_id: String,
    plugin_name: String,
    host: String,
    document_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct PluginHeartbeatResponse {
    ok: bool,
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
    let mut buffer = [0_u8; 4096];
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

    if first_line.starts_with("POST /heartbeat ") {
        let body = request.split("\r\n\r\n").nth(1).unwrap_or_default();
        let Ok(heartbeat) = serde_json::from_str::<PluginHeartbeatRequest>(body) else {
            write_response(
                &mut stream,
                400,
                "Bad Request",
                "text/plain",
                "Invalid JSON",
            );
            return;
        };

        let now = Utc::now();
        match state.plugin_connections.lock() {
            Ok(mut connections) => {
                connections.insert(
                    heartbeat.plugin_id.clone(),
                    PluginConnection {
                        plugin_id: heartbeat.plugin_id,
                        plugin_name: heartbeat.plugin_name,
                        host: heartbeat.host,
                        document_name: heartbeat.document_name,
                        last_seen: now,
                    },
                );

                let body = serde_json::to_string(&PluginHeartbeatResponse { ok: true })
                    .unwrap_or_else(|_| "{\"ok\":true}".to_string());
                write_response(&mut stream, 200, "OK", "application/json", &body);
            }
            Err(_) => write_response(
                &mut stream,
                500,
                "Internal Server Error",
                "text/plain",
                "Failed to lock plugin connections",
            ),
        }
        return;
    }

    write_response(&mut stream, 404, "Not Found", "text/plain", "Not found");
}

pub fn get_active_plugin_connections(state: &AppState) -> Result<Vec<PluginConnection>> {
    let now = Utc::now();
    let mut connections = state
        .plugin_connections
        .lock()
        .map_err(|_| AppError::Processing("Failed to lock plugin connections".to_string()))?;

    connections.retain(|_, connection| {
        now.signed_duration_since(connection.last_seen)
            .num_seconds()
            <= PLUGIN_CONNECTION_TIMEOUT_SECONDS
    });

    Ok(connections.values().cloned().collect())
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
        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
        Access-Control-Allow-Headers: Content-Type\r\n\
        Cache-Control: no-store\r\n\
        Connection: close\r\n\
        \r\n\
        {body}",
        body.len()
    );

    let _ = stream.write_all(response.as_bytes());
}
