import type { Config } from "./config.js";

export interface ApiClient {
  get(path: string): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
}

export function createApiClient(config: Config): ApiClient {
  const baseUrl = config.apiEndpoint.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "x-api-key": config.apiKey,
    "Content-Type": "application/json",
  };

  async function apiGet(path: string): Promise<Response> {
    const url = `${baseUrl}${path}`;
    return fetch(url, {
      method: "GET",
      headers,
    });
  }

  async function apiPost(path: string, body: unknown): Promise<Response> {
    const url = `${baseUrl}${path}`;
    return fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  async function apiDelete(path: string): Promise<Response> {
    const url = `${baseUrl}${path}`;
    return fetch(url, {
      method: "DELETE",
      headers,
    });
  }

  return {
    get: apiGet,
    post: apiPost,
    delete: apiDelete,
  };
}
