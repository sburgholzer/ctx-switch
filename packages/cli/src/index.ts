#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { createApiClient } from "./api-client.js";
import { parkCommand } from "./commands/park.js";
import { resumeCommand } from "./commands/resume.js";
import { listCommand } from "./commands/list.js";
import { deleteCommand } from "./commands/delete.js";
import { historyCommand } from "./commands/history.js";

const program = new Command();

program
  .name("ctx")
  .version("0.1.0")
  .description("Context Switcher - Capture and resume your working context");

program
  .command("park")
  .description("Capture current working context")
  .option("--note <text>", "Attach a free-text note to the snapshot")
  .option("--history", "Include terminal history in the snapshot")
  .action(async (options) => {
    await parkCommand(options);
  });

program
  .command("resume [project-name]")
  .description("Generate a resumption briefing for a project")
  .action(async (projectName: string | undefined) => {
    const config = loadConfig();
    const apiClient = createApiClient(config);
    await resumeCommand(projectName, {
      apiClient,
      output: console.log,
    });
  });

program
  .command("list")
  .description("List all captured projects")
  .action(async () => {
    const config = loadConfig();
    const apiClient = createApiClient(config);
    await listCommand(apiClient);
  });

program
  .command("delete <project-name>")
  .description("Delete all snapshots for a project")
  .action(async (projectName: string) => {
    const config = loadConfig();
    const apiClient = createApiClient(config);
    await deleteCommand(projectName, apiClient);
  });

program
  .command("history <project-name>")
  .description("Show snapshot history for a project")
  .action(async (projectName: string) => {
    const config = loadConfig();
    const apiClient = createApiClient(config);
    await historyCommand(projectName, apiClient);
  });

program.parse(process.argv);
