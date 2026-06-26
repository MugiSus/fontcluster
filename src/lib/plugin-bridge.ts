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

export function sendFontToPlugin(
  metadata: FontMetadata,
  previewText: string,
): Promise<string> {
  return invoke<string>('send_font_to_plugin', {
    payload: metadata,
    previewText,
  });
}

export function getConnectedPlugins(): Promise<PluginConnectionsResponse> {
  return invoke<PluginConnectionsResponse>('get_connected_plugins');
}
