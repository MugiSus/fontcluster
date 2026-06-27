//! Minimal HTTP bridge for external design-tool plugins.
//!
//! A tiny hand-rolled HTTP server runs on a fixed localhost port so plugins
//! (e.g. an Illustrator/Photoshop extension) can poll the currently selected
//! font and session and register heartbeats. The protocol is deliberately
//! small — three routes (`GET /data`, `POST /heartbeat`, CORS `OPTIONS`) — so
//! it avoids pulling in a full web framework.

use crate::config::{FontMetadata, SessionConfig};
use crate::error::{AppError, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

use super::session::AppState;

/// Fixed localhost port the bridge listens on; plugins are configured to match.
pub const PLUGIN_BRIDGE_PORT: u16 = 38653;
/// A connection is considered active for this long after its last heartbeat.
const PLUGIN_CONNECTION_TIMEOUT_SECONDS: i64 = 5;

/// Body of `GET /data`: the current session, selected font, and change time.
#[derive(Debug, Serialize)]
struct PluginDataResponse {
    session: Option<SessionConfig>,
    font: Option<FontMetadata>,
    modified_date: Option<DateTime<Utc>>,
    /// Preview text the user typed when the font was pushed; plugins use it as
    /// the contents of a newly created text node.
    preview_text: Option<String>,
}

/// A connected plugin as last reported by its heartbeat.
#[derive(Debug, Clone, Serialize)]
pub struct PluginConnection {
    pub plugin_id: String,
    pub plugin_name: String,
    pub host: String,
    pub document_name: Option<String>,
    pub last_seen: DateTime<Utc>,
}

/// Request body of `POST /heartbeat`.
#[derive(Debug, Deserialize)]
struct PluginHeartbeatRequest {
    plugin_id: String,
    plugin_name: String,
    host: String,
    document_name: Option<String>,
}

/// Response body of `POST /heartbeat`.
#[derive(Debug, Serialize)]
struct PluginHeartbeatResponse {
    ok: bool,
}

/// Spawns the bridge server on a background thread; failures are logged.
pub fn start_plugin_bridge_server(state: AppState) {
    thread::spawn(move || {
        if let Err(error) = run_plugin_bridge_server(state) {
            eprintln!("Failed to start plugin bridge server: {error}");
        }
    });
}

/// Binds the listener and serves connections until the process exits.
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

/// Reads one request and dispatches it to the matching route, replying with a
/// 404 for anything unrecognised.
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
        let preview_text = state
            .plugin_bridge_preview_text
            .lock()
            .map(|preview_text| preview_text.clone())
            .unwrap_or(None);
        let body = serde_json::to_string(&PluginDataResponse {
            session,
            font,
            modified_date,
            preview_text,
        })
        .unwrap_or_else(|_| {
            "{\"session\":null,\"font\":null,\"modified_date\":null,\"preview_text\":null}"
                .to_string()
        });

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

/// Returns the plugins seen within [`PLUGIN_CONNECTION_TIMEOUT_SECONDS`],
/// pruning any that have timed out as a side effect.
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

/// Writes a complete HTTP/1.1 response with permissive CORS headers and
/// `Connection: close`. Write errors are ignored (the peer has gone away).
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
