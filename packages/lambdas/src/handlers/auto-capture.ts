/**
 * Auto-Capture Lambda handler for the Context Switcher.
 *
 * Triggered by EventBridge on a developer-configured cron schedule.
 * Queries GSI-1 for all projects configured for auto-capture (max 20),
 * performs a capture for each, and returns a summary of successes/failures.
 *
 * On individual project failure, the error is logged and processing
 * continues to the next project (no retry).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  autoCapturePK,
  AUTOCAPTURE_MAX_PROJECTS,
  SK_PROJECT_PREFIX,
} from "@ctx-switch/shared";
import type { Snapshot, ProjectRecord } from "@ctx-switch/shared";
import { docClient, TABLE_NAME } from "../data/dynamo-client.js";
import { putSnapshot, putProjectRecord } from "../data/snapshot-repo.js";

/** GSI-1 index name used for auto-capture project lookups. */
export const GSI1_INDEX_NAME =
  process.env.GSI1_INDEX_NAME ?? "GSI1";

/** EventBridge event shape for auto-capture triggers. */
export interface AutoCaptureEvent {
  detail: {
    userId: string;
  };
  [key: string]: unknown;
}

/** Summary returned after an auto-capture run completes. */
export interface AutoCaptureSummary {
  userId: string;
  successCount: number;
  failureCount: number;
  total: number;
}

/** Shape of a GSI-1 auto-capture project item. */
interface AutoCaptureProjectItem {
  GSI1PK: string;
  GSI1SK: string;
  projectId: string;
  projectName: string;
  gitBranch?: string;
  lastCommits?: string[];
  note?: string;
}

/**
 * Queries GSI-1 for all projects configured for auto-capture for the given user.
 * Returns at most AUTOCAPTURE_MAX_PROJECTS (20) items.
 */
export async function getAutoCaptureProjects(
  userId: string
): Promise<AutoCaptureProjectItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX_NAME,
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": autoCapturePK(userId),
        ":skPrefix": SK_PROJECT_PREFIX,
      },
      Limit: AUTOCAPTURE_MAX_PROJECTS,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return [];
  }

  return result.Items.map((item) => ({
    GSI1PK: item.GSI1PK as string,
    GSI1SK: item.GSI1SK as string,
    projectId: item.projectId as string,
    projectName: item.projectName as string,
    gitBranch: item.gitBranch as string | undefined,
    lastCommits: item.lastCommits as string[] | undefined,
    note: item.note as string | undefined,
  }));
}

/**
 * Performs an auto-capture for a single project.
 * Creates a minimal snapshot with source="auto" and stores it in DynamoDB.
 */
async function captureProject(
  userId: string,
  project: AutoCaptureProjectItem
): Promise<void> {
  const timestamp = new Date().toISOString();

  const snapshot: Snapshot = {
    projectId: project.projectId,
    projectName: project.projectName,
    timestamp,
    source: "auto",
    git: {
      branch: project.gitBranch ?? "unknown",
      lastCommits: project.lastCommits ?? [],
      uncommittedDiff: "",
      modifiedFiles: [],
    },
    note: project.note,
  };

  await putSnapshot(userId, snapshot);

  // Update project record with new timestamp
  const projectRecord: ProjectRecord = {
    userId,
    projectId: project.projectId,
    projectName: project.projectName,
    lastParkTimestamp: timestamp,
    summary: project.note ?? `Auto-captured on ${project.gitBranch ?? "unknown"}`,
    snapshotCount: 1,
  };

  await putProjectRecord(userId, projectRecord);
}

/**
 * AWS Lambda handler for scheduled auto-capture.
 *
 * Triggered by EventBridge with event.detail.userId identifying the user.
 * Queries configured projects from GSI-1, captures each, and returns
 * a summary of results.
 */
export async function handler(
  event: AutoCaptureEvent
): Promise<AutoCaptureSummary> {
  const userId = event.detail.userId;

  // Query GSI-1 for configured auto-capture projects (max 20)
  const projects = await getAutoCaptureProjects(userId);
  const total = projects.length;

  let successCount = 0;
  let failureCount = 0;

  // Process each project individually
  for (const project of projects) {
    try {
      await captureProject(userId, project);
      successCount++;
    } catch (error: unknown) {
      failureCount++;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Auto-capture failed for project "${project.projectName}" (${project.projectId}): ${errorMessage}`
      );
    }
  }

  const summary: AutoCaptureSummary = {
    userId,
    successCount,
    failureCount,
    total,
  };

  console.log(
    `Auto-capture complete for user ${userId}: ${successCount} succeeded, ${failureCount} failed, ${total} total`
  );

  return summary;
}
