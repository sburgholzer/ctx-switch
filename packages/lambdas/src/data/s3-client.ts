/**
 * Configured S3 client for the Context Switcher Snapshot Archive.
 *
 * Uses automatic retries with exponential backoff (3 attempts max)
 * as specified in the design document's retry strategy.
 */

import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  maxAttempts: 3,
});

export const BUCKET_NAME =
  process.env.BUCKET_NAME ?? "ctx-switch-snapshot-archive";
