/**
 * CDK stack for the Context Switcher infrastructure.
 *
 * Uses NodejsFunction for automatic esbuild bundling of Lambda handlers,
 * resolving workspace dependencies (@ctx-switch/shared) at build time.
 *
 * Requirements: 5.1, 5.2, 7.2
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the Lambda handler source files. */
const LAMBDAS_SRC_PATH = path.resolve(__dirname, "../../lambdas/src");

export class ContextSwitcherStack extends cdk.Stack {
  public readonly contextTable: dynamodb.Table;
  public readonly archiveBucket: s3.Bucket;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ──────────────────────────────────────────────
    // DynamoDB Table
    // ──────────────────────────────────────────────
    this.contextTable = new dynamodb.Table(this, "ContextStore", {
      tableName: "ctx-switch-context-store",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    this.contextTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ──────────────────────────────────────────────
    // S3 Bucket
    // ──────────────────────────────────────────────
    this.archiveBucket = new s3.Bucket(this, "SnapshotArchive", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: "expire-old-snapshots",
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // ──────────────────────────────────────────────
    // Shared Lambda environment
    // ──────────────────────────────────────────────
    const lambdaEnvironment: Record<string, string> = {
      TABLE_NAME: this.contextTable.tableName,
      BUCKET_NAME: this.archiveBucket.bucketName,
      GSI1_INDEX_NAME: "GSI1",
    };

    // Shared bundling options for NodejsFunction
    const bundlingDefaults = {
      format: "esm" as const,
      mainFields: ["module", "main"],
      sourceMap: true,
      minify: true,
    };

    // ──────────────────────────────────────────────
    // Lambda Functions (bundled with esbuild)
    // ──────────────────────────────────────────────

    const authorizerFn = new NodejsFunction(this, "AuthorizerFunction", {
      functionName: "ctx-switch-authorizer",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/authorizer.ts"),
      handler: "handler",
      environment: { TABLE_NAME: this.contextTable.tableName },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadData(authorizerFn);

    const captureFn = new NodejsFunction(this, "CaptureFunction", {
      functionName: "ctx-switch-capture",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/capture.ts"),
      handler: "handler",
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadWriteData(captureFn);
    this.archiveBucket.grantReadWrite(captureFn);

    const resumeFn = new NodejsFunction(this, "ResumeFunction", {
      functionName: "ctx-switch-resume",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/resume.ts"),
      handler: "handler",
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadData(resumeFn);
    this.archiveBucket.grantRead(resumeFn);
    resumeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    const listFn = new NodejsFunction(this, "ListFunction", {
      functionName: "ctx-switch-list",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/list.ts"),
      handler: "handler",
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadData(listFn);

    const deleteFn = new NodejsFunction(this, "DeleteFunction", {
      functionName: "ctx-switch-delete",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/delete.ts"),
      handler: "handler",
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadWriteData(deleteFn);
    this.archiveBucket.grantDelete(deleteFn);
    this.archiveBucket.grantRead(deleteFn);

    const historyFn = new NodejsFunction(this, "HistoryFunction", {
      functionName: "ctx-switch-history",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/history.ts"),
      handler: "handler",
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadData(historyFn);

    const autoCaptureFn = new NodejsFunction(this, "AutoCaptureFunction", {
      functionName: "ctx-switch-auto-capture",
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(LAMBDAS_SRC_PATH, "handlers/auto-capture.ts"),
      handler: "handler",
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: bundlingDefaults,
    });
    this.contextTable.grantReadWriteData(autoCaptureFn);
    this.archiveBucket.grantReadWrite(autoCaptureFn);

    // ──────────────────────────────────────────────
    // API Gateway REST API
    // ──────────────────────────────────────────────
    this.api = new apigateway.RestApi(this, "ContextSwitcherApi", {
      restApiName: "Context Switcher API",
      description: "REST API for the Context Switcher tool",
      deployOptions: {
        stageName: "v1",
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "x-api-key", "Authorization"],
      },
    });

    const authorizer = new apigateway.RequestAuthorizer(this, "ApiKeyAuthorizer", {
      handler: authorizerFn,
      identitySources: [apigateway.IdentitySource.header("x-api-key")],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const authorizedMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // POST /snapshots
    const snapshotsResource = this.api.root.addResource("snapshots");
    snapshotsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(captureFn),
      authorizedMethodOptions
    );

    // GET /snapshots/{project}/latest
    const snapshotProjectResource = snapshotsResource.addResource("{project}");
    const latestResource = snapshotProjectResource.addResource("latest");
    latestResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(resumeFn),
      authorizedMethodOptions
    );

    // GET /snapshots/{project}/history
    const historyResource = snapshotProjectResource.addResource("history");
    historyResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(historyFn),
      authorizedMethodOptions
    );

    // GET /projects
    const projectsResource = this.api.root.addResource("projects");
    projectsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(listFn),
      authorizedMethodOptions
    );

    // DELETE /projects/{project}
    const projectResource = projectsResource.addResource("{project}");
    projectResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(deleteFn),
      authorizedMethodOptions
    );

    // ──────────────────────────────────────────────
    // EventBridge Rule for Auto-Capture
    // ──────────────────────────────────────────────
    const autoCaptureRule = new events.Rule(this, "AutoCaptureScheduleRule", {
      ruleName: "ctx-switch-auto-capture-schedule",
      description: "Triggers auto-capture Lambda on a configurable schedule",
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "17",
        weekDay: "MON-FRI",
      }),
      enabled: false,
    });
    autoCaptureRule.addTarget(new targets.LambdaFunction(autoCaptureFn));

    // ──────────────────────────────────────────────
    // Stack Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: this.api.url,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: this.contextTable.tableName,
      description: "DynamoDB table name",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.archiveBucket.bucketName,
      description: "S3 archive bucket name",
    });
  }
}
