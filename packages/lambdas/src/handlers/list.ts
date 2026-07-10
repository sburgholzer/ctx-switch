/**
 * List Lambda handler for the Context Switcher.
 *
 * Handles GET /projects requests from the CLI and web dashboard.
 * Returns all projects for the authenticated user, sorted by
 * lastParkTimestamp descending (newest first). Each project entry
 * includes the project name, last park timestamp, and a summary
 * truncated to 80 characters.
 *
 * Requirements: 3.1, 3.5
 */

import {
  sortProjectsByTimestamp,
  truncateSummary,
} from "@ctx-switch/shared";
import { listProjects } from "../data/snapshot-repo.js";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "./capture.js";

/**
 * AWS Lambda handler for listing all projects for the authenticated user.
 *
 * The userId is extracted from the API Gateway authorizer context.
 *
 * Returns 200 with { projects: [...] } on success.
 * Returns 200 with { projects: [], message: "No projects have been captured" } if no projects exist.
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

    // Query all projects for this user
    const projects = await listProjects(userId);

    // Handle empty state
    if (projects.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          projects: [],
          message: "No projects have been captured",
        }),
      };
    }

    // Sort by lastParkTimestamp descending (newest first)
    const sorted = sortProjectsByTimestamp(projects);

    // Map to response format with truncated summaries
    const responseProjects = sorted.map((project) => ({
      projectName: project.projectName,
      lastParkTimestamp: project.lastParkTimestamp,
      summary: truncateSummary(project.summary),
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ projects: responseProjects }),
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
