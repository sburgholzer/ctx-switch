/**
 * Delete Lambda handler for the Context Switcher.
 *
 * Handles DELETE /projects/{project} requests from the CLI and web dashboard.
 * Deletes all snapshots for the specified project from DynamoDB and S3,
 * then removes the project record.
 *
 * Requirements: 3.2, 3.4
 */

import { deleteProjectSnapshots, deleteProjectRecord } from "../data/snapshot-repo.js";
import { deletePayloads } from "../data/archive-repo.js";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "./capture.js";

/**
 * AWS Lambda handler for deleting a project and all its snapshots.
 *
 * Expects:
 * - pathParameters.project: the project ID to delete
 * - requestContext.authorizer.userId: the authenticated user ID
 *
 * Returns 200 with { projectId, snapshotsRemoved } on success.
 * Returns 404 if the project does not exist (no snapshots found).
 * Returns 400 if projectId is missing from path parameters.
 * Returns 401 if userId is missing from authorizer context.
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
    const projectId = (event as { pathParameters?: Record<string, string | undefined> | null }).pathParameters?.project;
    if (!projectId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Project identifier is required" }),
      };
    }

    // Delete all snapshots from DynamoDB
    const dynamoDeleted = await deleteProjectSnapshots(userId, projectId);

    // Delete overflow payloads from S3
    const s3Deleted = await deletePayloads(userId, projectId);

    // If no snapshots were found in either store, the project doesn't exist
    if (dynamoDeleted === 0 && s3Deleted === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Project not found" }),
      };
    }

    // Delete the project record
    await deleteProjectRecord(userId, projectId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        projectId,
        snapshotsRemoved: dynamoDeleted,
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
