use serde::{Deserialize, Serialize};
use reqwest;
use std::collections::HashMap;
use crate::error::{FontResult, FontError};

#[derive(Debug, Deserialize)]
pub struct GoogleFontsResponse {
    pub items: Vec<GoogleFont>,
}

#[derive(Debug, Deserialize)]
pub struct GoogleFont {
    pub family: String,
    pub variants: Vec<String>,
    pub subsets: Vec<String>,
    pub version: String,
    pub files: HashMap<String, String>,
}

#[derive(Clone)]
pub struct GoogleFontsClient {
    api_key: String,
    http_client: reqwest::Client,
}

impl GoogleFontsClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn list_fonts(&self) -> FontResult<Vec<GoogleFont>> {
        let url = format!(
            "https://www.googleapis.com/webfonts/v1/webfonts?key={}",
            self.api_key
        );

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| FontError::NetworkError(format!("Failed to fetch fonts list: {}", e)))?;

        if !response.status().is_success() {
            return Err(FontError::NetworkError(format!(
                "API request failed with status: {}",
                response.status()
            )));
        }

        let fonts_response: GoogleFontsResponse = response
            .json()
            .await
            .map_err(|e| FontError::NetworkError(format!("Failed to parse response: {}", e)))?;

        Ok(fonts_response.items)
    }

    pub async fn download_font(&self, font_url: &str) -> FontResult<Vec<u8>> {
        let response = self
            .http_client
            .get(font_url)
            .send()
            .await
            .map_err(|e| FontError::NetworkError(format!("Failed to download font: {}", e)))?;

        if !response.status().is_success() {
            return Err(FontError::NetworkError(format!(
                "Font download failed with status: {}",
                response.status()
            )));
        }

        let font_data = response
            .bytes()
            .await
            .map_err(|e| FontError::NetworkError(format!("Failed to read font data: {}", e)))?;

        Ok(font_data.to_vec())
    }

    pub async fn get_font_by_family(&self, family_name: &str) -> FontResult<Option<GoogleFont>> {
        let fonts = self.list_fonts().await?;
        Ok(fonts.into_iter().find(|font| font.family == family_name))
    }
}