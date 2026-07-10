/**
 * Capture Lambda handler for the Context Switcher.
 *
 * Handles POST /snapshots requests from the CLI and web dashboard.
 * Validates the incoming snapshot payload, routes to S3 if overflow,
 * stores in DynamoDB, and updates the project record.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import {
  validateNote,
  truncateHistory,
  truncatePRs,
  truncateComments,
  needsOverflow,
  truncateSummary,
  ValidationError,
} from "@ctx-switch/shared";
import type { Snapshot, ProjectRecord } from "@ctx-switch/shared";
import { putSnapshot, putProjectRecord } from "../data/snapshot-repo.js";
import { putPayload } from "../data/archive-repo.js";

/** Minimal API Gateway proxy event type for Lambda handlers. */
export interface APIGatewayProxyEvent {
  body: string | null;
  headers: Record<string, string | undefined>;
  requestContext: {
    authorizer?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Minimal API Gateway proxy result type for Lambda handlers. */
export interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * AWS Lambda handler for capturing a project snapshot.
 *
 * Expects the request body to contain a Snapshot payload.
 * The userId is extracted from the API Gateway authorizer context.
 *
 * Returns 200 with { projectName, timestamp } on success.
 * Returns 400 for ValidationError.
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

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is required" }),
      };
    }

    const snapshot: Snapshot = JSON.parse(event.body);

    // Validate note length (throws ValidationError if > 5000 chars)
    if (snapshot.note) {
      validateNote(snapshot.note);
    }

    // Truncate terminal history to last 50 lines
    if (snapshot.terminalHistory) {
      snapshot.terminalHistory = truncateHistory(snapshot.terminalHistory);
    }

    // Truncate GitHub data if present
    if (snapshot.github) {
      snapshot.github.pullRequests = truncatePRs(snapshot.github.pullRequests);
      snapshot.github.unresolvedComments = truncateComments(
        snapshot.github.unresolvedComments
      );
    }

    // Check payload size and route accordingly
    if (needsOverflow(snapshot)) {
      // Store full payload in S3 and save reference in DynamoDB
      const payloadRef = await putPayload(
        userId,
        snapshot.projectId,
        snapshot.timestamp,
        snapshot
      );

      // Store a lightweight snapshot in DynamoDB with the S3 reference
      const snapshotWithRef: Snapshot & { payloadRef?: string } = {
        projectId: snapshot.projectId,
        projectName: snapshot.projectName,
        timestamp: snapshot.timestamp,
        source: snapshot.source,
        git: {
          branch: snapshot.git.branch,
          lastCommits: [],
          uncommittedDiff: "",
          modifiedFiles: [],
        },
        payloadRef,
      };
      await putSnapshot(userId, snapshotWithRef as Snapshot);
    } else {
      // Store directly in DynamoDB
      await putSnapshot(userId, snapshot);
    }

    // Generate summary for project record (use note or first commit message)
    const summary = snapshot.note
      || (snapshot.git.lastCommits.length > 0 ? snapshot.git.lastCommits[0] : "")
      || `Working on ${snapshot.git.branch}`;

    // Update project record
    const projectRecord: ProjectRecord = {
      userId,
      projectId: snapshot.projectId,
      projectName: snapshot.projectName,
      lastParkTimestamp: snapshot.timestamp,
      summary: truncateSummary(summary),
      snapshotCount: 1, // Will be incremented via conditional update in production; for now, set to 1
    };
    await putProjectRecord(userId, projectRecord);

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        projectName: snapshot.projectName,
        timestamp: snapshot.timestamp,
      }),
    };
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: error.message }),
      };
    }

    if (error instanceof SyntaxError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    // Unexpected error
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
}
