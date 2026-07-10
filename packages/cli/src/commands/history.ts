import type { ApiClient } from "../api-client.js";
import { formatTimestamp, truncateSummary } from "@ctx-switch/shared";

interface SnapshotEntry {
  timestamp: string;
  summary: string;
}

export async function historyCommand(
  projectName: string,
  apiClient: ApiClient
): Promise<void> {
  try {
    const response = await apiClient.get(`/snapshots/${projectName}/history`);

    if (response.status === 404) {
      console.error(`No context has been captured for project '${projectName}'`);
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = (body as { message?: string }).message ?? "Failed to fetch history";
      console.error(message);
      return;
    }

    const data = (await response.json()) as { snapshots: SnapshotEntry[] };
    const snapshots = data.snapshots;

    if (snapshots.length === 0) {
      console.error(`No context has been captured for project '${projectName}'`);
      return;
    }

    for (const snapshot of snapshots) {
      const formattedTime = formatTimestamp(snapshot.timestamp);
      const truncatedSummary = truncateSummary(snapshot.summary);
      console.log(`${formattedTime}  ${truncatedSummary}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${message}`);
  }
}
