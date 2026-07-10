/**
 * Resume Lambda handler for the Context Switcher.
 *
 * Handles GET /snapshots/{project}/latest requests.
 * Retrieves the most recent snapshot for a project, invokes Bedrock to
 * generate an AI briefing, and returns the formatted briefing.
 * On Bedrock timeout (>15s) or error, returns raw snapshot data with a fallback indicator.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { BRIEFING_MAX_WORDS } from "@ctx-switch/shared";
import type { Snapshot } from "@ctx-switch/shared";
import { getLatestSnapshot } from "../data/snapshot-repo.js";
import { getPayload } from "../data/archive-repo.js";

/** Timeout for Bedrock invocation in milliseconds (Requirement 2.6). */
const BEDROCK_TIMEOUT_MS = 15_000;

/** Bedrock model ID — defaults to Claude via environment variable. */
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-6";

/** AWS region for Bedrock client. */
const BEDROCK_REGION = process.env.AWS_REGION || "us-east-1";

/** Minimal API Gateway proxy event type for Lambda handlers. */
export interface APIGatewayProxyEvent {
  body: string | null;
  headers: Record<string, string | undefined>;
  pathParameters: Record<string, string | undefined> | null;
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
 * Builds the system prompt for the Bedrock briefing generator.
 * Defines the 4-section format, 500-word limit, and terminology constraints.
 */
function buildSystemPrompt(): string {
  return `You are a developer context resumption assistant. Your job is to synthesize a snapshot of a developer's working context into a concise, actionable briefing.

Generate a briefing with EXACTLY these four sections in this order:
1. "## Last Session Summary" — A brief paragraph summarizing what was being worked on.
2. "## Key Changes" — A bullet list of the most important recent changes.
3. "## Open Items" — A bullet list of open issues, blockers, or notes. Include any developer-provided notes verbatim.
4. "## Suggested Next Steps" — A numbered list of recommended actions to resume work.

Rules:
- Maximum ${BRIEFING_MAX_WORDS} words total.
- Use ONLY terminology that appears in the developer's project files, commit messages, or notes.
- If a section has no relevant data, display the section heading followed by "None".
- Be concise and actionable. Developers want to scan this quickly.`;
}

/**
 * Builds the user message for Bedrock from snapshot data.
 */
function buildUserMessage(snapshot: Snapshot): string {
  const parts: string[] = [];

  parts.push(`Project: ${snapshot.projectName}`);
  parts.push(`Branch: ${snapshot.git.branch}`);
  parts.push(`Timestamp: ${snapshot.timestamp}`);

  if (snapshot.git.lastCommits.length > 0) {
    parts.push(`\nRecent commits:\n${snapshot.git.lastCommits.map((c) => `- ${c}`).join("\n")}`);
  }

  if (snapshot.git.modifiedFiles.length > 0) {
    parts.push(`\nModified files:\n${snapshot.git.modifiedFiles.map((f) => `- ${f}`).join("\n")}`);
  }

  if (snapshot.git.uncommittedDiff) {
    // Truncate diff to avoid exceeding model context
    const diff = snapshot.git.uncommittedDiff.slice(0, 4000);
    parts.push(`\nUncommitted diff (truncated):\n${diff}`);
  }

  if (snapshot.note) {
    parts.push(`\nDeveloper note:\n${snapshot.note}`);
  }

  if (snapshot.terminalHistory && snapshot.terminalHistory.length > 0) {
    parts.push(`\nTerminal history:\n${snapshot.terminalHistory.join("\n")}`);
  }

  if (snapshot.github) {
    if (snapshot.github.pullRequests.length > 0) {
      parts.push(
        `\nOpen PRs:\n${snapshot.github.pullRequests.map((pr) => `- #${pr.number}: ${pr.title}`).join("\n")}`
      );
    }
    if (snapshot.github.unresolvedComments.length > 0) {
      parts.push(
        `\nUnresolved review comments:\n${snapshot.github.unresolvedComments.map((c) => `- ${c.path}:${c.line} — ${c.body}`).join("\n")}`
      );
    }
  }

  return parts.join("\n");
}

/**
 * Invokes Amazon Bedrock with the snapshot data and returns the generated briefing.
 * Throws on timeout (>15s) or any API error.
 */
export async function invokeBedrock(
  snapshot: Snapshot,
  client?: BedrockRuntimeClient
): Promise<string> {
  const bedrockClient =
    client || new BedrockRuntimeClient({ region: BEDROCK_REGION });

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(snapshot);

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BEDROCK_TIMEOUT_MS);

  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: new TextEncoder().encode(requestBody),
      }),
      { abortSignal: controller.signal }
    );

    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as { content: Array<{ text: string }> };

    return responseBody.content[0]?.text ?? "";
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * AWS Lambda handler for resuming a project (generating a briefing).
 *
 * Expects:
 * - pathParameters.project: the project ID
 * - requestContext.authorizer.userId: the authenticated user ID
 *
 * Returns 200 with briefing on success, 200 with raw data + fallback on Bedrock failure,
 * 404 if no snapshot exists, 401 if unauthenticated.
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
    const projectId = event.pathParameters?.project;
    if (!projectId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Project identifier is required" }),
      };
    }

    // Retrieve latest snapshot
    const snapshot = await getLatestSnapshot(userId, projectId);
    if (!snapshot) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: `No context has been captured for project '${projectId}'`,
        }),
      };
    }

    // If snapshot has a payloadRef, fetch full payload from S3
    let fullSnapshot = snapshot;
    const snapshotWithRef = snapshot as Snapshot & { payloadRef?: string };
    if (snapshotWithRef.payloadRef) {
      fullSnapshot = await getPayload(snapshotWithRef.payloadRef);
    }

    // Attempt Bedrock briefing generation
    try {
      const briefing = await invokeBedrock(fullSnapshot);
      return {
        statusCode: 200,
        body: JSON.stringify({
          projectId,
          projectName: fullSnapshot.projectName,
          briefing,
          fallback: false,
        }),
      };
    } catch (bedrockError: unknown) {
      // On Bedrock timeout or error, return raw snapshot data with fallback indicator
      const errorMessage =
        bedrockError instanceof Error ? bedrockError.message : "Bedrock invocation failed";
      console.error(`[Resume] Bedrock failed: ${errorMessage}`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          projectId,
          projectName: fullSnapshot.projectName,
          snapshot: fullSnapshot,
          fallback: true,
          fallbackReason: errorMessage,
        }),
      };
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
}
