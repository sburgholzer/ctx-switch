import type { ApiClient } from "../api-client.js";
import { formatProjectRow } from "@ctx-switch/shared";

interface ProjectEntry {
  projectName: string;
  lastParkTimestamp: string;
  summary: string;
}

export async function listCommand(apiClient: ApiClient): Promise<void> {
  try {
    const response = await apiClient.get("/projects");

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? "Failed to fetch projects";
      console.error(message);
      return;
    }

    const data = (await response.json()) as { projects: ProjectEntry[] };
    const projects = data.projects;

    if (projects.length === 0) {
      console.log("No projects have been captured");
      return;
    }

    for (const project of projects) {
      console.log(
        formatProjectRow(
          project.projectName,
          project.lastParkTimestamp,
          project.summary
        )
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${message}`);
  }
}
