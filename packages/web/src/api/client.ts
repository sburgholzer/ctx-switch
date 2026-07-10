const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export class ApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = API_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new ApiError("Unauthorized", 401);
      }
      const body = await response.text();
      throw new ApiError(body || response.statusText, response.status);
    }

    return response.json() as Promise<T>;
  }

  getProjects() {
    return this.request<ProjectListResponse>("/projects");
  }

  getLatestSnapshot(projectId: string) {
    return this.request<BriefingResponse>(`/snapshots/${encodeURIComponent(projectId)}/latest`);
  }

  getSnapshotHistory(projectId: string) {
    return this.request<SnapshotHistoryResponse>(`/snapshots/${encodeURIComponent(projectId)}/history`);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ProjectListResponse {
  projects: Array<{
    projectName: string;
    projectId: string;
    lastParkTimestamp: string;
    summary: string;
  }>;
}

export interface BriefingResponse {
  briefing: string;
  fallback?: boolean;
  rawSnapshot?: unknown;
}

export interface SnapshotHistoryResponse {
  snapshots: Array<{
    timestamp: string;
    summary: string;
  }>;
}
