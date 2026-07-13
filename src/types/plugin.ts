export interface PluginConnection {
  plugin_id: string;
  plugin_name: string;
  host: string;
  document_name: string | null;
  last_seen: string;
}
