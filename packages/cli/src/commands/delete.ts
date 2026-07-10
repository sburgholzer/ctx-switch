import type { ApiClient } from "../api-client.js";
import { createInterface } from "node:readline";

export async function confirmDeletion(projectName: string, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<boolean> {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(
      `Are you sure you want to delete project '${projectName}'? (y/n) `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      }
    );
  });
}

interface DeleteResponse {
  projectName: string;
  snapshotsRemoved: number;
}

export async function deleteCommand(
  projectName: string,
  apiClient: ApiClient,
  confirm: (name: string) => Promise<boolean> = confirmDeletion
): Promise<void> {
  const confirmed = await confirm(projectName);

  if (!confirmed) {
    console.log("Operation cancelled. No data was removed.");
    return;
  }

  try {
    const response = await apiClient.delete(`/projects/${projectName}`);

    if (response.status === 404) {
      console.error(`Project '${projectName}' not found`);
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? "Failed to delete project";
      console.error(message);
      return;
    }

    const data = (await response.json()) as DeleteResponse;
    console.log(`Deleted project '${data.projectName}' (${data.snapshotsRemoved} snapshots removed)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${message}`);
  }
}
