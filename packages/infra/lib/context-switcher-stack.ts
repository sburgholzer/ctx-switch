/**
 * CDK stack for the Context Switcher infrastructure.
 *
 * Defines all AWS resources:
 * - DynamoDB table with PK/SK schema and GSI-1
 * - S3 bucket with 90-day lifecycle policy
 * - API Gateway REST API with API key authorizer
 * - Lambda functions for all handlers with IAM roles
 * - EventBridge rule for auto-capture scheduling
 *
 * Requirements: 5.1, 5.2, 7.2
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the compiled Lambda handlers. */
const LAMBDAS_DIST_PATH = path.resolve(__dirname, "../../lambdas/dist");

export class ContextSwitcherStack extends cdk.Stack {
  /** The DynamoDB context store table. */
  public readonly contextTable: dynamodb.Table;

  /** The S3 snapshot archive bucket. */
  public readonly archiveBucket: s3.Bucket;

  /** The API Gateway REST API. */
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ──────────────────────────────────────────────
    // DynamoDB Table: ctx-switch-context-store
    // ──────────────────────────────────────────────
    this.contextTable = new dynamodb.Table(this, "ContextStore", {
      tableName: "ctx-switch-context-store",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // GSI-1 for auto-capture project lookups
    this.contextTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ──────────────────────────────────────────────
    // S3 Bucket: ctx-switch-snapshot-archive
    // ──────────────────────────────────────────────
    this.archiveBucket = new s3.Bucket(this, "SnapshotArchive", {
      bucketName: `ctx-switch-snapshot-archive-${cdk.Aws.ACCOUNT_ID}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "expire-old-snapshots",
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // ──────────────────────────────────────────────
    // Lambda Execution Role (shared base permissions)
    // ──────────────────────────────────────────────
    const lambdaEnvironment: Record<string, string> = {
      TABLE_NAME: this.contextTable.tableName,
      BUCKET_NAME: this.archiveBucket.bucketName,
      GSI1_INDEX_NAME: "GSI1",
      NODE_OPTIONS: "--enable-source-maps",
    };

    // ──────────────────────────────────────────────
    // Lambda Functions
    // ──────────────────────────────────────────────

    // Authorizer Lambda
    const authorizerFn = new lambda.Function(this, "AuthorizerFunction", {
      functionName: "ctx-switch-authorizer",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/authorizer.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: {
        TABLE_NAME: this.contextTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    this.contextTable.grantReadData(authorizerFn);

    // Capture Lambda
    const captureFn = new lambda.Function(this, "CaptureFunction", {
      functionName: "ctx-switch-capture",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/capture.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    this.contextTable.grantReadWriteData(captureFn);
    this.archiveBucket.grantReadWrite(captureFn);

    // Resume Lambda
    const resumeFn = new lambda.Function(this, "ResumeFunction", {
      functionName: "ctx-switch-resume",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/resume.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    this.contextTable.grantReadData(resumeFn);
    this.archiveBucket.grantRead(resumeFn);
    // Bedrock access for briefing generation
    resumeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    // List Lambda
    const listFn = new lambda.Function(this, "ListFunction", {
      functionName: "ctx-switch-list",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/list.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    this.contextTable.grantReadData(listFn);

    // Delete Lambda
    const deleteFn = new lambda.Function(this, "DeleteFunction", {
      functionName: "ctx-switch-delete",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/delete.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    this.contextTable.grantReadWriteData(deleteFn);
    this.archiveBucket.grantDelete(deleteFn);
    this.archiveBucket.grantRead(deleteFn);

    // History Lambda
    const historyFn = new lambda.Function(this, "HistoryFunction", {
      functionName: "ctx-switch-history",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/history.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    this.contextTable.grantReadData(historyFn);

    // Auto-Capture Lambda
    const autoCaptureFn = new lambda.Function(this, "AutoCaptureFunction", {
      functionName: "ctx-switch-auto-capture",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handlers/auto-capture.handler",
      code: lambda.Code.fromAsset(LAMBDAS_DIST_PATH),
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
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

    // Custom Lambda authorizer (TOKEN type using x-api-key header)
    const authorizer = new apigateway.TokenAuthorizer(this, "ApiKeyAuthorizer", {
      handler: authorizerFn,
      identitySource: "method.request.header.x-api-key",
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Method options for authorized endpoints
    const authorizedMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // POST /snapshots -> Capture Lambda
    const snapshotsResource = this.api.root.addResource("snapshots");
    snapshotsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(captureFn),
      authorizedMethodOptions
    );

    // GET /snapshots/{project}/latest -> Resume Lambda
    const snapshotProjectResource = snapshotsResource.addResource("{project}");
    const latestResource = snapshotProjectResource.addResource("latest");
    latestResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(resumeFn),
      authorizedMethodOptions
    );

    // GET /snapshots/{project}/history -> History Lambda
    const historyResource = snapshotProjectResource.addResource("history");
    historyResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(historyFn),
      authorizedMethodOptions
    );

    // GET /projects -> List Lambda
    const projectsResource = this.api.root.addResource("projects");
    projectsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(listFn),
      authorizedMethodOptions
    );

    // DELETE /projects/{project} -> Delete Lambda
    const projectResource = projectsResource.addResource("{project}");
    projectResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(deleteFn),
      authorizedMethodOptions
    );

    // ──────────────────────────────────────────────
    // EventBridge Rule for Auto-Capture Scheduling
    // ──────────────────────────────────────────────
    const autoCaptureRule = new events.Rule(this, "AutoCaptureScheduleRule", {
      ruleName: "ctx-switch-auto-capture-schedule",
      description: "Triggers auto-capture Lambda on a configurable schedule",
      // Default schedule: weekdays at 5 PM UTC (developer can override via configuration)
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "17",
        weekDay: "MON-FRI",
      }),
      enabled: false, // Disabled by default; enabled per-user via configuration
    });

    autoCaptureRule.addTarget(new targets.LambdaFunction(autoCaptureFn));

    // ──────────────────────────────────────────────
    // Stack Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: this.api.url,
      description: "API Gateway endpoint URL",
      exportName: "ContextSwitcherApiEndpoint",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: this.contextTable.tableName,
      description: "DynamoDB table name",
      exportName: "ContextSwitcherTableName",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.archiveBucket.bucketName,
      description: "S3 archive bucket name",
      exportName: "ContextSwitcherBucketName",
    });
  }
}
