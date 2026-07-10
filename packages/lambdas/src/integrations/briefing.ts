/**
 * Briefing parser and validator for Context Switcher.
 *
 * Provides Bedrock client configuration, prompt template construction,
 * response parsing, and validation for AI-generated resumption briefings.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { BRIEFING_MAX_WORDS } from "@ctx-switch/shared";
import type { Snapshot } from "@ctx-switch/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

/** The four required briefing sections in order. */
export const BRIEFING_SECTIONS = [
  "Last Session Summary",
  "Key Changes",
  "Open Items",
  "Suggested Next Steps",
] as const;

export type BriefingSectionName = (typeof BRIEFING_SECTIONS)[number];

/** A single section within a parsed briefing. */
export interface BriefingSection {
  heading: BriefingSectionName;
  content: string;
}

/** The result of parsing a Bedrock briefing response. */
export interface BriefingResult {
  sections: BriefingSection[];
  rawText: string;
}

/** The result of validating a briefing. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Bedrock Client ──────────────────────────────────────────────────────────

const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-6";

/** Configured Bedrock Runtime client. */
export const bedrockClient = new BedrockRuntimeClient({
  region: BEDROCK_REGION,
});

// ─── Prompt Construction ─────────────────────────────────────────────────────

/**
 * Constructs the system and user prompts for Bedrock to generate a briefing.
 *
 * The system prompt defines the 4-section format, 500-word limit, and rules
 * about verbatim developer notes and "None" indicators.
 *
 * @param snapshot - The most recent snapshot for the project.
 * @returns An object with system and user prompt strings.
 */
export function buildBriefingPrompt(snapshot: Snapshot): {
  system: string;
  user: string;
} {
  const system = `You are a developer context resumption assistant. Your job is to generate a concise briefing that helps a developer quickly resume work on a project.

You MUST produce a briefing with exactly 4 sections in this order:
1. ## Last Session Summary
2. ## Key Changes
3. ## Open Items
4. ## Suggested Next Steps

Rules:
- The total briefing MUST NOT exceed ${BRIEFING_MAX_WORDS} words.
- Use ONLY terminology that appears in the developer's project files, commit messages, or notes.
- "Last Session Summary" should be a brief paragraph summarizing what was being worked on.
- "Key Changes" should be a bullet list of recent changes.
- "Open Items" should be a bullet list of blockers, issues, or pending tasks. Developer-provided notes MUST appear VERBATIM in this section.
- "Suggested Next Steps" should be a numbered list of actionable next steps.
- If a section has no relevant data, display the section heading followed by "None" on the next line.
- Each section heading must be a level-2 markdown heading (## Heading).`;

  const userParts: string[] = [];
  userParts.push(`Project: ${snapshot.projectName}`);
  userParts.push(`Branch: ${snapshot.git.branch}`);

  if (snapshot.git.lastCommits.length > 0) {
    userParts.push(`\nRecent commits:\n${snapshot.git.lastCommits.map((c) => `- ${c}`).join("\n")}`);
  }

  if (snapshot.git.modifiedFiles.length > 0) {
    userParts.push(`\nModified files:\n${snapshot.git.modifiedFiles.map((f) => `- ${f}`).join("\n")}`);
  }

  if (snapshot.git.uncommittedDiff) {
    const diffPreview = snapshot.git.uncommittedDiff.slice(0, 2000);
    userParts.push(`\nUncommitted diff (preview):\n\`\`\`\n${diffPreview}\n\`\`\``);
  }

  if (snapshot.note) {
    userParts.push(`\nDeveloper note (include VERBATIM in Open Items):\n${snapshot.note}`);
  }

  if (snapshot.terminalHistory && snapshot.terminalHistory.length > 0) {
    userParts.push(`\nTerminal history:\n${snapshot.terminalHistory.join("\n")}`);
  }

  if (snapshot.github) {
    if (snapshot.github.pullRequests.length > 0) {
      userParts.push(
        `\nOpen PRs:\n${snapshot.github.pullRequests.map((pr) => `- #${pr.number}: ${pr.title}`).join("\n")}`
      );
    }
    if (snapshot.github.unresolvedComments.length > 0) {
      userParts.push(
        `\nUnresolved review comments:\n${snapshot.github.unresolvedComments.map((c) => `- [${c.path}:${c.line}] ${c.body} (${c.status})`).join("\n")}`
      );
    }
  }

  userParts.push("\nGenerate the resumption briefing now.");

  return { system, user: userParts.join("\n") };
}

// ─── Response Parsing ────────────────────────────────────────────────────────

/**
 * Parses the raw text response from Bedrock into a structured BriefingResult.
 *
 * Extracts each of the 4 sections by finding ## headings and capturing
 * the content between them.
 *
 * @param rawText - The raw text output from Bedrock.
 * @returns A BriefingResult with parsed sections.
 */
export function parseBriefing(rawText: string): BriefingResult {
  const sections: BriefingSection[] = [];
  const trimmed = rawText.trim();

  // Split on section headings (## Section Name)
  for (let i = 0; i < BRIEFING_SECTIONS.length; i++) {
    const sectionName = BRIEFING_SECTIONS[i];
    const headingPattern = new RegExp(
      `^##\\s+${escapeRegex(sectionName)}\\s*$`,
      "m"
    );
    const match = headingPattern.exec(trimmed);

    if (match) {
      const startIdx = match.index + match[0].length;

      // Find the end of this section (start of next section or end of text)
      let endIdx = trimmed.length;
      if (i < BRIEFING_SECTIONS.length - 1) {
        // Look for any subsequent section heading
        for (let j = i + 1; j < BRIEFING_SECTIONS.length; j++) {
          const nextPattern = new RegExp(
            `^##\\s+${escapeRegex(BRIEFING_SECTIONS[j])}\\s*$`,
            "m"
          );
          const nextMatch = nextPattern.exec(trimmed.slice(startIdx));
          if (nextMatch) {
            endIdx = startIdx + nextMatch.index;
            break;
          }
        }
      }

      const content = trimmed.slice(startIdx, endIdx).trim();
      sections.push({ heading: sectionName, content });
    } else {
      // Section heading not found — record it with empty content
      sections.push({ heading: sectionName, content: "" });
    }
  }

  return { sections, rawText: trimmed };
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a parsed briefing against the required format constraints.
 *
 * Checks:
 * - All 4 sections are present and in the correct order
 * - Total word count does not exceed 500
 * - Empty sections contain "None"
 *
 * @param briefing - The parsed BriefingResult to validate.
 * @returns A ValidationResult indicating whether the briefing is valid and any errors.
 */
export function validateBriefing(briefing: BriefingResult): ValidationResult {
  const errors: string[] = [];

  // Check all 4 sections are present
  if (briefing.sections.length !== BRIEFING_SECTIONS.length) {
    errors.push(
      `Expected ${BRIEFING_SECTIONS.length} sections, found ${briefing.sections.length}`
    );
  }

  // Check section order
  for (let i = 0; i < BRIEFING_SECTIONS.length; i++) {
    const section = briefing.sections[i];
    if (!section) {
      errors.push(`Missing section: "${BRIEFING_SECTIONS[i]}"`);
      continue;
    }
    if (section.heading !== BRIEFING_SECTIONS[i]) {
      errors.push(
        `Section ${i + 1} should be "${BRIEFING_SECTIONS[i]}", found "${section.heading}"`
      );
    }
  }

  // Check word count
  const totalWords = countWords(briefing.rawText);
  if (totalWords > BRIEFING_MAX_WORDS) {
    errors.push(
      `Briefing exceeds ${BRIEFING_MAX_WORDS} word limit (${totalWords} words)`
    );
  }

  // Check empty sections have "None"
  for (const section of briefing.sections) {
    if (section.content === "" || section.content.toLowerCase() === "none") {
      // Empty content should be "None"
      if (section.content === "") {
        errors.push(
          `Section "${section.heading}" has no content; should display "None"`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that developer notes appear verbatim in the Open Items section.
 *
 * @param briefing - The parsed BriefingResult.
 * @param developerNote - The developer's note from the snapshot.
 * @returns True if the note appears verbatim in Open Items, false otherwise.
 */
export function validateVerbatimNotes(
  briefing: BriefingResult,
  developerNote: string
): boolean {
  const openItemsSection = briefing.sections.find(
    (s) => s.heading === "Open Items"
  );
  if (!openItemsSection) return false;
  return openItemsSection.content.includes(developerNote);
}

/**
 * Counts words in a text string.
 * Words are sequences of non-whitespace characters separated by whitespace.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

// ─── Bedrock Invocation ──────────────────────────────────────────────────────

/** Timeout for Bedrock invocation in milliseconds (15 seconds per Requirement 2.6). */
const BEDROCK_TIMEOUT_MS = 15_000;

/**
 * Invokes Amazon Bedrock to generate a briefing from a snapshot.
 *
 * @param snapshot - The snapshot to generate a briefing for.
 * @returns The parsed BriefingResult, or null if generation failed or timed out.
 */
export async function generateBriefing(
  snapshot: Snapshot
): Promise<BriefingResult | null> {
  const { system, user } = buildBriefingPrompt(snapshot);

  try {
    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BEDROCK_TIMEOUT_MS);

    try {
      const response = await bedrockClient.send(command, {
        abortSignal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
      ) as { content: Array<{ type: string; text: string }> };

      const rawText =
        responseBody.content
          ?.filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n") ?? "";

      return parseBriefing(rawText);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Briefing Generator] Failed to generate briefing: ${message}`);
    return null;
  }
}
