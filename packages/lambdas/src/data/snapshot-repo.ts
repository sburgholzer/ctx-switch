/**
 * DynamoDB repository for snapshot and project CRUD operations.
 *
 * All queries are scoped to the authenticated userId via PK = USER#{userId}.
 * Uses the single-table design with composite keys from @ctx-switch/shared.
 */

import {
  PutCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  userPK,
  projectSK,
  snapshotSK,
  snapshotSKPrefix,
  SK_PROJECT_PREFIX,
} from "@ctx-switch/shared";
import type { Snapshot, ProjectRecord } from "@ctx-switch/shared";
import { docClient, TABLE_NAME } from "./dynamo-client.js";

/**
 * Stores a snapshot in DynamoDB.
 * PK = USER#{userId}, SK = SNAPSHOT#{projectId}#{timestamp}
 */
export async function putSnapshot(
  userId: string,
  snapshot: Snapshot
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: userPK(userId),
        SK: snapshotSK(snapshot.projectId, snapshot.timestamp),
        ...snapshot,
      },
    })
  );
}

/**
 * Retrieves the most recent snapshot for a project.
 * Queries SK begins_with SNAPSHOT#{projectId}#, ScanIndexForward=false, Limit=1.
 * Returns undefined if no snapshot exists.
 */
export async function getLatestSnapshot(
  userId: string,
  projectId: string
): Promise<Snapshot | undefined> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": userPK(userId),
        ":skPrefix": snapshotSKPrefix(projectId),
      },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return undefined;
  }

  const item = result.Items[0];
  return itemToSnapshot(item);
}

/**
 * Retrieves up to 10 most recent snapshots for a project, ordered newest-first.
 * Queries SK begins_with SNAPSHOT#{projectId}#, ScanIndexForward=false, Limit=10.
 */
export async function getSnapshotHistory(
  userId: string,
  projectId: string
): Promise<Snapshot[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": userPK(userId),
        ":skPrefix": snapshotSKPrefix(projectId),
      },
      ScanIndexForward: false,
      Limit: 10,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return [];
  }

  return result.Items.map(itemToSnapshot);
}

/**
 * Lists all projects for the authenticated user.
 * Queries SK begins_with PROJECT#.
 */
export async function listProjects(
  userId: string
): Promise<ProjectRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": userPK(userId),
        ":skPrefix": SK_PROJECT_PREFIX,
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return [];
  }

  return result.Items.map(itemToProjectRecord);
}

/**
 * Deletes all snapshots for a project and returns the count of deleted items.
 * Queries all snapshot keys, then batch-deletes them in groups of 25.
 */
export async function deleteProjectSnapshots(
  userId: string,
  projectId: string
): Promise<number> {
  const pk = userPK(userId);
  const skPrefix = snapshotSKPrefix(projectId);

  // Query all snapshot keys for this project
  const keys: Array<{ PK: string; SK: string }> = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":skPrefix": skPrefix,
        },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      for (const item of result.Items) {
        keys.push({ PK: item.PK as string, SK: item.SK as string });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  // Batch delete in groups of 25 (DynamoDB BatchWriteItem limit)
  const BATCH_SIZE = 25;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((key) => ({
            DeleteRequest: { Key: key },
          })),
        },
      })
    );
  }

  return keys.length;
}

/**
 * Creates or updates a project record in DynamoDB.
 * PK = USER#{userId}, SK = PROJECT#{projectId}
 */
export async function putProjectRecord(
  userId: string,
  record: ProjectRecord
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: userPK(userId),
        SK: projectSK(record.projectId),
        ...record,
      },
    })
  );
}

/**
 * Deletes a project record from DynamoDB.
 * PK = USER#{userId}, SK = PROJECT#{projectId}
 */
export async function deleteProjectRecord(
  userId: string,
  projectId: string
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: userPK(userId),
        SK: projectSK(projectId),
      },
    })
  );
}

// --- Internal helpers ---

function itemToSnapshot(item: Record<string, unknown>): Snapshot {
  return {
    projectId: item.projectId as string,
    projectName: item.projectName as string,
    timestamp: item.timestamp as string,
    source: item.source as "manual" | "auto",
    git: item.git as Snapshot["git"],
    note: item.note as string | undefined,
    terminalHistory: item.terminalHistory as string[] | undefined,
    github: item.github as Snapshot["github"] | undefined,
  };
}

function itemToProjectRecord(item: Record<string, unknown>): ProjectRecord {
  return {
    userId: item.userId as string,
    projectId: item.projectId as string,
    projectName: item.projectName as string,
    lastParkTimestamp: item.lastParkTimestamp as string,
    summary: item.summary as string,
    snapshotCount: item.snapshotCount as number,
  };
}
