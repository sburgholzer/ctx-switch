/**
 * Configured DynamoDB Document Client for the Context Switcher.
 *
 * Uses automatic retries with exponential backoff (3 attempts max)
 * as specified in the design document's retry strategy.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  maxAttempts: 3,
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_NAME = process.env.TABLE_NAME ?? "ctx-switch-context-store";
