#!/usr/bin/env node
/**
 * CDK app entry point for the Context Switcher infrastructure.
 */
import * as cdk from "aws-cdk-lib";
import { ContextSwitcherStack } from "../lib/context-switcher-stack.js";

const app = new cdk.App();

new ContextSwitcherStack(app, "ContextSwitcherStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: "Context Switcher - AI-powered developer context capture and resumption tool",
});

app.synth();
