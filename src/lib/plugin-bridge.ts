import { invoke } from '@tauri-apps/api/core';
import type { FontMetadata } from '@/types/font';

export interface PluginConnection {
  plugin_id: string;
  plugin_name: string;
  host: string;
  document_name: string | null;
  last_seen: string;
}

interface PluginConnectionsResponse {
  plugins: PluginConnection[];
}

export function sendFontToPlugin(metadata: FontMetadata): Promise<string> {
  return invoke<string>('send_font_to_plugin', {
    payload: {
      safe_name: metadata.safe_name,
      font_name: metadata.font_name,
      family_name: metadata.family_name,
      family_names: metadata.family_names,
      preferred_family_names: metadata.preferred_family_names,
      style_name: metadata.style_name || '',
      style_names: metadata.style_names || {},
      preferred_style_names: metadata.preferred_style_names || {},
      publishers: metadata.publishers,
      designers: metadata.designers,
      weight: metadata.weight,
      weights: metadata.weights,
    },
  });
}

export function getConnectedPlugins(): Promise<PluginConnectionsResponse> {
  return invoke<PluginConnectionsResponse>('get_connected_plugins');
}
