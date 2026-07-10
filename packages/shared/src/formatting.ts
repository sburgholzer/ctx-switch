import { SUMMARY_MAX_CHARS } from "./constants.js";

/**
 * Truncates a summary string to at most SUMMARY_MAX_CHARS (80) characters.
 * If the summary exceeds the limit, it is truncated and an ellipsis ("…") is appended,
 * so the final string is at most 80 characters including the ellipsis.
 */
export function truncateSummary(summary: string): string {
  if (summary.length <= SUMMARY_MAX_CHARS) {
    return summary;
  }
  return summary.slice(0, SUMMARY_MAX_CHARS - 1) + "…";
}

/**
 * Formats an ISO 8601 timestamp string into a human-readable display format.
 * Output format: "YYYY-MM-DD HH:MM AM/PM" (e.g., "2024-01-15 10:30 AM").
 */
export function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const hoursStr = String(hours).padStart(2, "0");

  return `${year}-${month}-${day} ${hoursStr}:${minutes} ${ampm}`;
}

/**
 * Formats a single row for the project listing display.
 * Each row shows the project name, formatted timestamp, and truncated summary.
 */
export function formatProjectRow(
  projectName: string,
  timestamp: string,
  summary: string
): string {
  const formattedTime = formatTimestamp(timestamp);
  const truncatedSummary = truncateSummary(summary);
  return `${projectName}  ${formattedTime}  ${truncatedSummary}`;
}
