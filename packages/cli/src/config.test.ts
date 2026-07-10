import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, getConfigPath } from "./config.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

import { readFileSync, existsSync } from "node:fs";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getConfigPath", () => {
    it("returns path relative to home directory", () => {
      const path = getConfigPath();
      expect(path).toBe("/home/testuser/.ctx/config.json");
    });
  });

  describe("loadConfig", () => {
    it("loads and parses a valid config file", () => {
      const validConfig = {
        apiKey: "ctx-abc123",
        apiEndpoint: "https://api.example.com/v1",
        githubToken: "ghp_token123",
        defaultNote: "",
        autoCapture: {
          enabled: false,
          schedule: "0 17 * * MON-FRI",
          projects: [],
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const config = loadConfig();
      expect(config.apiKey).toBe("ctx-abc123");
      expect(config.apiEndpoint).toBe("https://api.example.com/v1");
      expect(config.githubToken).toBe("ghp_token123");
      expect(config.autoCapture.enabled).toBe(false);
      expect(config.autoCapture.schedule).toBe("0 17 * * MON-FRI");
    });

    it("throws error when config file does not exist", () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => loadConfig()).toThrow(
        /Configuration file not found.*Run `ctx init`/
      );
    });

    it("throws error when apiKey is missing", () => {
      const configWithoutKey = {
        apiEndpoint: "https://api.example.com/v1",
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configWithoutKey));

      expect(() => loadConfig()).toThrow(/Missing "apiKey"/);
    });

    it("throws error when apiEndpoint is missing", () => {
      const configWithoutEndpoint = {
        apiKey: "ctx-abc123",
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configWithoutEndpoint));

      expect(() => loadConfig()).toThrow(/Missing "apiEndpoint"/);
    });

    it("provides default autoCapture settings when not specified", () => {
      const minimalConfig = {
        apiKey: "ctx-abc123",
        apiEndpoint: "https://api.example.com/v1",
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(minimalConfig));

      const config = loadConfig();
      expect(config.autoCapture).toEqual({
        enabled: false,
        schedule: "0 17 * * MON-FRI",
        projects: [],
      });
    });

    it("provides default empty string for defaultNote when not specified", () => {
      const configWithoutNote = {
        apiKey: "ctx-abc123",
        apiEndpoint: "https://api.example.com/v1",
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configWithoutNote));

      const config = loadConfig();
      expect(config.defaultNote).toBe("");
    });

    it("throws error for invalid JSON", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("not valid json{");

      expect(() => loadConfig()).toThrow();
    });
  });
});
