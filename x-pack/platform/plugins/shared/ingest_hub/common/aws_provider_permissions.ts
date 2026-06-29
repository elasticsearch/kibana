/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface ProviderPermissions {
  actions?: string[];
  managedPolicyArns?: string[];
}

/** Actions shared by most aws/metrics data streams at package level. */
export const AWS_METRICS_PACKAGE_ACTIONS = [
  'cloudwatch:GetMetricData',
  'cloudwatch:ListMetrics',
  'tag:GetResources',
  'ec2:DescribeRegions',
  'iam:ListAccountAliases',
  'sts:GetCallerIdentity',
] as const;

/** Actions for aws-s3 input (S3-backed logs via bucket/SQS). */
export const AWS_S3_INPUT_ACTIONS = [
  's3:GetObject',
  's3:ListBucket',
  's3:GetBucketLocation',
  'sqs:ReceiveMessage',
  'sqs:DeleteMessage',
  'sqs:ChangeMessageVisibility',
  'sqs:GetQueueAttributes',
] as const;

/** Actions for aws-cloudwatch input. */
export const AWS_CLOUDWATCH_INPUT_ACTIONS = [
  'logs:DescribeLogGroups',
  'logs:DescribeLogStreams',
  'logs:FilterLogEvents',
  'logs:GetLogEvents',
] as const;

/** S3 inventory / storage metrics family. */
export const AWS_S3_INVENTORY_METRICS_ACTIONS = [
  's3:GetBucketTagging',
  's3:ListAllMyBuckets',
  'cloudwatch:GetMetricData',
] as const;

const actions = (...groups: ReadonlyArray<readonly string[]>): ProviderPermissions => ({
  actions: [...new Set(groups.flat())],
});

/**
 * Provider permissions keyed by data stream id for agentless services.
 * Services with only cloud_forwarder/firehose delivery are omitted.
 * Used as fallback when a package does not yet declare provider_permissions in its manifest.
 */
export const AWS_SERVICE_PROVIDER_PERMISSIONS: Readonly<Record<string, ProviderPermissions>> = {
  // ── Serverless & Compute ────────────────────────────────────────────────
  apigateway_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, ['apigateway:GET']),
  lambda: actions(AWS_METRICS_PACKAGE_ACTIONS, ['lambda:ListFunctions', 'lambda:ListTags']),
  lambda_logs: actions(AWS_CLOUDWATCH_INPUT_ACTIONS),

  // ── Infrastructure ──────────────────────────────────────────────────────
  ec2_logs: actions(AWS_S3_INPUT_ACTIONS, AWS_CLOUDWATCH_INPUT_ACTIONS),
  ec2_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, ['ec2:DescribeInstances', 'tag:GetResources']),
  ecs_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'ecs:ListClusters',
    'ecs:ListServices',
    'ecs:DescribeServices',
    'ecs:ListTasks',
    'ecs:DescribeTasks',
  ]),
  emr_logs: actions(AWS_S3_INPUT_ACTIONS, AWS_CLOUDWATCH_INPUT_ACTIONS),
  emr_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'elasticmapreduce:DescribeCluster',
    'elasticmapreduce:ListClusters',
  ]),

  // ── Monitoring ──────────────────────────────────────────────────────────
  awshealth: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'health:DescribeEvents',
    'health:DescribeEventDetails',
    'health:DescribeEventsForOrganization',
  ]),
  cloudwatch_logs: actions(AWS_CLOUDWATCH_INPUT_ACTIONS),
  cloudwatch_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS),

  // ── Cost & Billing ──────────────────────────────────────────────────────
  billing: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'ce:GetCostAndUsage',
    'ce:GetDimensionValues',
    'ce:GetTags',
  ]),
  usage: actions(AWS_METRICS_PACKAGE_ACTIONS, ['ce:GetCostAndUsage', 'ce:GetDimensionValues']),

  // ── Security ────────────────────────────────────────────────────────────
  cloudtrail: actions(AWS_S3_INPUT_ACTIONS, AWS_CLOUDWATCH_INPUT_ACTIONS),
  config: actions([
    'config:SelectResourceConfig',
    'config:GetResourceConfigHistory',
    'config:ListDiscoveredResources',
    'config:DescribeConfigurationRecorders',
    'config:DescribeConfigurationRecorderStatus',
  ]),
  guardduty: actions(AWS_S3_INPUT_ACTIONS, [
    'guardduty:GetDetector',
    'guardduty:ListDetectors',
    'guardduty:GetFindings',
    'guardduty:ListFindings',
  ]),
  inspector: actions([
    'inspector2:ListFindings',
    'inspector2:GetFindings',
    'inspector2:ListCoverage',
  ]),
  firewall_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'network-firewall:DescribeFirewall',
    'network-firewall:ListFirewalls',
  ]),
  securityhub_findings: actions([
    'securityhub:GetFindings',
    'securityhub:DescribeHub',
    'securityhub:GetEnabledStandards',
  ]),
  securityhub_findings_full_posture: actions([
    'securityhub:GetFindings',
    'securityhub:DescribeHub',
    'securityhub:GetEnabledStandards',
    'securityhub:ListSecurityControlDefinitions',
    'securityhub:GetSecurityControlDefinition',
  ]),
  securityhub_insights: actions([
    'securityhub:GetFindings',
    'securityhub:GetInsights',
    'securityhub:DescribeHub',
  ]),

  // ── Networking ──────────────────────────────────────────────────────────
  elb_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'elasticloadbalancing:DescribeLoadBalancers',
    'elasticloadbalancing:DescribeTargetGroups',
    'elasticloadbalancing:DescribeTags',
  ]),
  natgateway: actions(AWS_METRICS_PACKAGE_ACTIONS, ['ec2:DescribeNatGateways']),
  route53_resolver_logs: actions(AWS_S3_INPUT_ACTIONS, AWS_CLOUDWATCH_INPUT_ACTIONS),
  transitgateway: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'ec2:DescribeTransitGateways',
    'ec2:DescribeTransitGatewayAttachments',
  ]),
  vpcflow: actions(AWS_S3_INPUT_ACTIONS, AWS_CLOUDWATCH_INPUT_ACTIONS),
  vpn: actions(AWS_METRICS_PACKAGE_ACTIONS, ['ec2:DescribeVpnConnections']),

  // ── Storage ─────────────────────────────────────────────────────────────
  ebs: actions(AWS_METRICS_PACKAGE_ACTIONS, ['ec2:DescribeVolumes']),
  s3_daily_storage: actions(AWS_S3_INVENTORY_METRICS_ACTIONS),
  s3_request: actions(AWS_S3_INVENTORY_METRICS_ACTIONS),
  s3_storage_lens: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    's3:GetStorageLensConfiguration',
    's3:ListStorageLensConfigurations',
  ]),

  // ── Databases ───────────────────────────────────────────────────────────
  dynamodb: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'dynamodb:DescribeTable',
    'dynamodb:ListTables',
    'dynamodb:DescribeTimeToLive',
  ]),
  rds: actions(AWS_METRICS_PACKAGE_ACTIONS, ['rds:DescribeDBInstances', 'rds:ListTagsForResource']),
  redshift: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'redshift:DescribeClusters',
    'redshift:DescribeLoggingStatus',
  ]),

  // ── Messaging ───────────────────────────────────────────────────────────
  kafka_metrics: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'kafka:ListClusters',
    'kafka:DescribeCluster',
  ]),
  kinesis: actions(AWS_METRICS_PACKAGE_ACTIONS, ['kinesis:ListStreams', 'kinesis:DescribeStream']),
  sns: actions(AWS_METRICS_PACKAGE_ACTIONS, ['sns:ListTopics', 'sns:GetTopicAttributes']),
  sqs: actions(AWS_METRICS_PACKAGE_ACTIONS, ['sqs:ListQueues', 'sqs:GetQueueAttributes']),

  // ── aws_bedrock ─────────────────────────────────────────────────────────
  guardrails: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'bedrock:GetGuardrail',
    'bedrock:ListGuardrails',
  ]),
  invocation: actions(AWS_S3_INPUT_ACTIONS, AWS_CLOUDWATCH_INPUT_ACTIONS),
  runtime: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'bedrock:ListFoundationModels',
    'bedrock:GetFoundationModel',
  ]),
  bedrock_agentcore: actions([
    'bedrock-agentcore:ListAgentRuntimes',
    'bedrock-agentcore:GetAgentRuntime',
  ]),

  // ── awsfargate ──────────────────────────────────────────────────────────
  fargate: actions(AWS_METRICS_PACKAGE_ACTIONS, [
    'ecs:ListClusters',
    'ecs:ListServices',
    'ecs:DescribeServices',
  ]),

  // ── aws_mq ──────────────────────────────────────────────────────────────
  mq: actions(AWS_METRICS_PACKAGE_ACTIONS, ['mq:ListBrokers', 'mq:DescribeBroker']),
};
