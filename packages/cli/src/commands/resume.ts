/**
 * `ctx resume [project-name]` command implementation.
 *
 * If a project name is provided, retrieves the latest briefing for that project.
 * If no project name is given, displays a sorted list of all available projects.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { formatProjectRow } from "@ctx-switch/shared";
import type { ApiClient } from "../api-client.js";

/** Response shape from GET /snapshots/{project}/latest */
export interface ResumeResponse {
  projectId: string;
  projectName: string;
  briefing?: string;
  snapshot?: unknown;
  fallback: boolean;
  fallbackReason?: string;
}

/** Response shape from GET /projects */
export interface ProjectsResponse {
  projects: Array<{
    projectName: string;
    lastParkTimestamp: string;
    summary: string;
  }>;
  message?: string;
}

export interface ResumeCommandDeps {
  apiClient: ApiClient;
  output: (message: string) => void;
}

/**
 * Executes the resume command logic.
 *
 * @param projectName - Optional project name to resume. If omitted, lists all projects.
 * @param deps - Injected dependencies (API client and output function).
 */
export async function resumeCommand(
  projectName: string | undefined,
  deps: ResumeCommandDeps
): Promise<void> {
  const { apiClient, output } = deps;

  if (projectName) {
    await resumeProject(projectName, apiClient, output);
  } else {
    await listProjects(apiClient, output);
  }
}

async function resumeProject(
  projectName: string,
  apiClient: ApiClient,
  output: (message: string) => void
): Promise<void> {
  const response = await apiClient.get(
    `/snapshots/${encodeURIComponent(projectName)}/latest`
  );

  if (response.status === 401) {
    output(
      "Authentication failed. Check your API key in ~/.ctx/config.json"
    );
    return;
  }

  if (response.status === 404) {
    output(`No context has been captured for project '${projectName}'`);
    return;
  }

  if (!response.ok) {
    output(`Error retrieving context: ${response.statusText}`);
    return;
  }

  const data = (await response.json()) as ResumeResponse;

  if (data.fallback) {
    output("AI briefing generation failed. Showing raw context data:");
    output("");
    output(JSON.stringify(data.snapshot, null, 2));
  } else {
    output(data.briefing ?? "");
  }
}

async function listProjects(
  apiClient: ApiClient,
  output: (message: string) => void
): Promise<void> {
  const response = await apiClient.get("/projects");

  if (response.status === 401) {
    output(
      "Authentication failed. Check your API key in ~/.ctx/config.json"
    );
    return;
  }

  if (!response.ok) {
    output(`Error retrieving projects: ${response.statusText}`);
    return;
  }

  const data = (await response.json()) as ProjectsResponse;

  if (data.projects.length === 0) {
    output("No projects have been captured");
    return;
  }

  for (const project of data.projects) {
    output(
      formatProjectRow(
        project.projectName,
        project.lastParkTimestamp,
        project.summary
      )
    );
  }
}
