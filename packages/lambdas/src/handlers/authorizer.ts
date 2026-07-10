/**
 * API Key Authorizer Lambda for the Context Switcher.
 *
 * Custom authorizer that validates the `x-api-key` header against
 * registered keys in DynamoDB. Returns an IAM policy document that
 * either allows or denies access to the API Gateway resource.
 *
 * DynamoDB key schema for API keys:
 *   PK = APIKEY#{keyValue}, SK = APIKEY#{keyValue}
 *   Attributes: userId, status ("active" | "revoked"), createdAt
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../data/dynamo-client.js";

/** API Gateway custom authorizer event. */
export interface APIGatewayAuthorizerEvent {
  type: string;
  methodArn: string;
  headers?: Record<string, string | undefined>;
  authorizationToken?: string;
  [key: string]: unknown;
}

/** IAM policy statement for API Gateway authorizer response. */
interface PolicyStatement {
  Action: string;
  Effect: "Allow" | "Deny";
  Resource: string;
}

/** API Gateway custom authorizer response. */
export interface AuthorizerResult {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: PolicyStatement[];
  };
  context?: Record<string, string>;
}

/** DynamoDB record shape for an API key. */
interface ApiKeyRecord {
  PK: string;
  SK: string;
  userId: string;
  status: "active" | "revoked";
  createdAt: string;
}

/**
 * Constructs the DynamoDB key for an API key lookup.
 * Format: APIKEY#{keyValue}
 */
export function apiKeyPK(keyValue: string): string {
  return `APIKEY#${keyValue}`;
}

/**
 * Extracts the API key from request headers (case-insensitive lookup for x-api-key).
 * Returns undefined if not found.
 */
export function extractApiKey(
  headers: Record<string, string | undefined> | undefined
): string | undefined {
  if (!headers) return undefined;

  // Look for the key case-insensitively
  const headerNames = Object.keys(headers);
  for (const name of headerNames) {
    if (name.toLowerCase() === "x-api-key") {
      return headers[name] || undefined;
    }
  }
  return undefined;
}

/**
 * Generates an IAM policy document for the authorizer response.
 */
function generatePolicy(
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string,
  context?: Record<string, string>
): AuthorizerResult {
  const result: AuthorizerResult = {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (context) {
    result.context = context;
  }

  return result;
}

/**
 * Looks up an API key in DynamoDB.
 * Returns the key record if found, undefined otherwise.
 */
export async function lookupApiKey(
  keyValue: string
): Promise<ApiKeyRecord | undefined> {
  const pk = apiKeyPK(keyValue);
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: pk },
    })
  );

  if (!result.Item) {
    return undefined;
  }

  return result.Item as unknown as ApiKeyRecord;
}

/**
 * AWS Lambda handler for API Gateway custom authorizer.
 *
 * Validates the API key from the `x-api-key` header:
 * 1. If missing → Deny
 * 2. If not found in DynamoDB → Deny
 * 3. If status is "revoked" → Deny
 * 4. If active → Allow with userId in context
 */
export async function handler(
  event: APIGatewayAuthorizerEvent
): Promise<AuthorizerResult> {
  const methodArn = event.methodArn;

  // Extract API key from headers
  const apiKey = extractApiKey(event.headers);

  if (!apiKey) {
    return generatePolicy("anonymous", "Deny", methodArn);
  }

  try {
    // Look up the key in DynamoDB
    const keyRecord = await lookupApiKey(apiKey);

    if (!keyRecord) {
      return generatePolicy("anonymous", "Deny", methodArn);
    }

    if (keyRecord.status === "revoked") {
      return generatePolicy(keyRecord.userId, "Deny", methodArn);
    }

    // Key is valid and active — Allow with userId in context
    return generatePolicy(keyRecord.userId, "Allow", methodArn, {
      userId: keyRecord.userId,
    });
  } catch {
    // On any DynamoDB error, deny access
    return generatePolicy("anonymous", "Deny", methodArn);
  }
}
