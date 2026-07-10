/**
 * History Lambda handler for the Context Switcher.
 *
 * Handles GET /snapshots/{project}/history requests from the CLI and web dashboard.
 * Returns up to 10 most recent snapshots for the specified project,
 * sorted newest-first. Each entry includes the timestamp and a summary
 * truncated to 80 characters.
 *
 * Requirements: 3.3, 3.6
 */

import { truncateSummary } from "@ctx-switch/shared";
import { getSnapshotHistory } from "../data/snapshot-repo.js";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "./capture.js";

/**
 * Derives a summary string from a snapshot.
 * Prefers the note field, falls back to the first commit message,
 * and finally falls back to the branch name.
 */
function deriveSummary(snapshot: {
  note?: string;
  git: { lastCommits: string[]; branch: string };
}): string {
  if (snapshot.note) {
    return snapshot.note;
  }
  if (snapshot.git.lastCommits.length > 0) {
    return snapshot.git.lastCommits[0];
  }
  return `Working on ${snapshot.git.branch}`;
}

/**
 * AWS Lambda handler for retrieving snapshot history for a project.
 *
 * Expects:
 * - pathParameters.project: the project ID
 * - requestContext.authorizer.userId: the authenticated user ID
 *
 * Returns 200 with { projectId, snapshots: [...] } on success.
 * Returns 404 if no snapshots exist for the project (project not found).
 * Returns 400 if project ID is missing from path parameters.
 * Returns 401 if userId is missing from the authorizer context.
 * Returns 500 for unexpected errors.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Extract userId from authorizer context
    const userId = event.requestContext.authorizer?.userId as string;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized: missing user identity" }),
      };
    }

    // Extract project ID from path parameters
    const projectId = (event.pathParameters as Record<string, string | undefined> | null | undefined)?.project;
    if (!projectId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Project identifier is required" }),
      };
    }

    // Query up to 10 most recent snapshots for this project
    const snapshots = await getSnapshotHistory(userId, projectId);

    // If no snapshots exist, the project is not found
    if (snapshots.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: `No context has been captured for project '${projectId}'`,
        }),
      };
    }

    // Map each snapshot to { timestamp, summary } with truncated summary
    const historyEntries = snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      summary: truncateSummary(deriveSummary(snapshot)),
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        projectId,
        snapshots: historyEntries,
      }),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
}
