use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::Ordering;
use std::thread;

use super::session::AppState;

pub const FIGMA_BRIDGE_PORT: u16 = 38653;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaFontPayload {
    pub source: String,
    pub version: u8,
    pub safe_name: String,
    pub font_name: String,
    pub family_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub weight: i32,
    pub weights: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FigmaBridgeResponse {
    sequence: u64,
    font: Option<FigmaFontPayload>,
}

pub fn start_figma_bridge_server(state: AppState) {
    thread::spawn(move || {
        if let Err(error) = run_figma_bridge_server(state) {
            eprintln!("Failed to start Figma bridge server: {error}");
        }
    });
}

fn run_figma_bridge_server(state: AppState) -> Result<()> {
    let listener = TcpListener::bind(("localhost", FIGMA_BRIDGE_PORT)).map_err(|e| {
        AppError::Network(format!(
            "Failed to bind Figma bridge on localhost:{FIGMA_BRIDGE_PORT}: {e}"
        ))
    })?;

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => handle_stream(stream, &state),
            Err(error) => eprintln!("Figma bridge connection error: {error}"),
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

    if !first_line.starts_with("GET /latest ") {
        write_response(&mut stream, 404, "Not Found", "text/plain", "Not found");
        return;
    }

    let font = state
        .figma_bridge_payload
        .lock()
        .map(|payload| payload.clone())
        .unwrap_or(None);
    let sequence = state.figma_bridge_sequence.load(Ordering::SeqCst);
    let body = serde_json::to_string(&FigmaBridgeResponse { sequence, font })
        .unwrap_or_else(|_| "{\"sequence\":0,\"font\":null}".to_string());

    write_response(&mut stream, 200, "OK", "application/json", &body);
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
