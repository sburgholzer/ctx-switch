import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AutoCaptureConfig {
  enabled: boolean;
  schedule: string;
  projects: string[];
}

export interface Config {
  apiKey: string;
  apiEndpoint: string;
  githubToken?: string;
  defaultNote?: string;
  autoCapture: AutoCaptureConfig;
}

const CONFIG_DIR = ".ctx";
const CONFIG_FILE = "config.json";

export function getConfigPath(): string {
  return join(homedir(), CONFIG_DIR, CONFIG_FILE);
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error(
      `Configuration file not found at ${configPath}. Run \`ctx init\` to set up your configuration.`
    );
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Config;

  if (!parsed.apiKey) {
    throw new Error(
      `Missing "apiKey" in ${configPath}. Run \`ctx init\` to set up your configuration.`
    );
  }

  if (!parsed.apiEndpoint) {
    throw new Error(
      `Missing "apiEndpoint" in ${configPath}. Run \`ctx init\` to set up your configuration.`
    );
  }

  return {
    apiKey: parsed.apiKey,
    apiEndpoint: parsed.apiEndpoint,
    githubToken: parsed.githubToken,
    defaultNote: parsed.defaultNote ?? "",
    autoCapture: parsed.autoCapture ?? {
      enabled: false,
      schedule: "0 17 * * MON-FRI",
      projects: [],
    },
  };
}
