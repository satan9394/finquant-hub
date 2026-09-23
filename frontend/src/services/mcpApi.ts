import apiClient from './api';

export interface MCPToolItem {
  name: string;
  local_name: string;
  description: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}

export interface MCPServerItem {
  name: string;
  transport: 'http' | 'stdio';
  tools: MCPToolItem[];
}

export interface MCPMarketResponse {
  items: MCPServerItem[];
  total_servers: number;
  total_tools: number;
}

export interface MCPServerConfigItem {
  id: number;
  name: string;
  url: string | null;
  command: string | null;
  args: string[];
  transport: 'http' | 'stdio';
  is_enabled: boolean;
  connected: boolean;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
  tool_count?: number;
}

export interface MCPServerConfigInput {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
}

export async function listMCPServers(): Promise<MCPMarketResponse> {
  const response = await apiClient.get('/mcp/servers');
  return response.data;
}

export async function setMCPToolEnabled(localName: string, enabled: boolean): Promise<MCPToolItem> {
  const response = await apiClient.patch(`/mcp/tools/${encodeURIComponent(localName)}`, { enabled });
  return response.data;
}

export async function listMCPServerConfigs(): Promise<MCPServerConfigItem[]> {
  const response = await apiClient.get('/mcp/configs');
  return response.data.items;
}

export async function createMCPServerConfig(input: MCPServerConfigInput): Promise<MCPServerConfigItem> {
  const response = await apiClient.post('/mcp/configs', input);
  return response.data;
}

export async function updateMCPServerConfig(
  id: number,
  input: MCPServerConfigInput,
): Promise<MCPServerConfigItem> {
  const response = await apiClient.put(`/mcp/configs/${id}`, input);
  return response.data;
}

export async function deleteMCPServerConfig(id: number): Promise<void> {
  await apiClient.delete(`/mcp/configs/${id}`);
}

export async function connectMCPServer(id: number): Promise<MCPServerConfigItem> {
  const response = await apiClient.post(`/mcp/configs/${id}/connect`);
  return response.data;
}

export async function disconnectMCPServer(id: number): Promise<MCPServerConfigItem> {
  const response = await apiClient.post(`/mcp/configs/${id}/disconnect`);
  return response.data;
}
