/**
 * S3 repository for snapshot overflow storage.
 *
 * Handles snapshots that exceed DynamoDB's 400KB item size limit.
 * Objects are stored at {userId}/{projectId}/{timestamp}.json with a
 * lifecycle policy for automatic cleanup (90-day default TTL managed by S3).
 */

import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import type { Snapshot } from "@ctx-switch/shared";
import { s3Client, BUCKET_NAME } from "./s3-client.js";

/**
 * Stores a full snapshot payload in S3.
 *
 * @param userId - The authenticated user's ID
 * @param projectId - The project identifier
 * @param timestamp - The snapshot timestamp (ISO 8601)
 * @param snapshot - The full snapshot object to store
 * @returns The S3 object key where the payload was stored
 */
export async function putPayload(
  userId: string,
  projectId: string,
  timestamp: string,
  snapshot: Snapshot
): Promise<string> {
  const key = `${userId}/${projectId}/${timestamp}.json`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(snapshot),
      ContentType: "application/json",
    })
  );

  return key;
}

/**
 * Retrieves and parses a snapshot payload from S3.
 *
 * @param key - The S3 object key (e.g. "{userId}/{projectId}/{timestamp}.json")
 * @returns The parsed Snapshot object
 */
export async function getPayload(key: string): Promise<Snapshot> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  const body = await response.Body!.transformToString();
  return JSON.parse(body) as Snapshot;
}

/**
 * Deletes all snapshot payloads for a project from S3.
 *
 * Lists all objects with prefix {userId}/{projectId}/ and batch-deletes them.
 *
 * @param userId - The authenticated user's ID
 * @param projectId - The project identifier
 * @returns The number of objects deleted
 */
export async function deletePayloads(
  userId: string,
  projectId: string
): Promise<number> {
  const prefix = `${userId}/${projectId}/`;
  let totalDeleted = 0;
  let continuationToken: string | undefined;

  do {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResponse.Contents;
    if (!objects || objects.length === 0) {
      break;
    }

    const objectIds = objects
      .filter((obj) => obj.Key !== undefined)
      .map((obj) => ({ Key: obj.Key! }));

    if (objectIds.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: objectIds },
        })
      );
      totalDeleted += objectIds.length;
    }

    continuationToken = listResponse.IsTruncated
      ? listResponse.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return totalDeleted;
}
