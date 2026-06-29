/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Minimal server-side lookup for each AWS service data stream.
 * Contains only the fields needed to fetch and map package-manifest permissions:
 * packageName, policyTemplate, and input types.
 *
 * This is the server counterpart to the browser-only `aws_service_matrix.ts`, which
 * carries additional display-oriented fields (category, badges, delivery methods, etc.).
 */
export interface AwsServiceLookupEntry {
  packageName: string;
  policyTemplate?: string;
  inputs?: readonly string[];
  /** Data stream path when it differs from the service id (e.g. fargate → task_stats). */
  dataStream?: string;
}

/** Keyed by data stream id (matches `AwsServiceMatrixEntry.id`). */
export const AWS_SERVICE_LOOKUP: Readonly<Record<string, AwsServiceLookupEntry>> = {
  // ── aws package — Application Integration / Serverless ─────────────────
  apigateway_logs: {
    packageName: 'aws',
    policyTemplate: 'apigateway',
    inputs: ['aws-s3', 'aws-cloudwatch'],
  },
  apigateway_metrics: { packageName: 'aws', policyTemplate: 'apigateway', inputs: ['aws/metrics'] },
  lambda: { packageName: 'aws', policyTemplate: 'lambda', inputs: ['aws/metrics'] },
  lambda_logs: { packageName: 'aws', policyTemplate: 'lambda', inputs: ['aws-cloudwatch'] },

  // ── aws package — Compute ───────────────────────────────────────────────
  ec2_logs: { packageName: 'aws', policyTemplate: 'ec2', inputs: ['aws-s3', 'aws-cloudwatch'] },
  ec2_metrics: { packageName: 'aws', policyTemplate: 'ec2', inputs: ['aws/metrics'] },
  ecs_metrics: { packageName: 'aws', policyTemplate: 'ecs', inputs: ['aws/metrics'] },
  emr_logs: { packageName: 'aws', policyTemplate: 'emr', inputs: ['aws-s3', 'aws-cloudwatch'] },
  emr_metrics: { packageName: 'aws', policyTemplate: 'emr', inputs: ['aws/metrics'] },

  // ── aws package — Management and Governance ─────────────────────────────
  awshealth: { packageName: 'aws', policyTemplate: 'awshealth', inputs: ['aws/metrics'] },
  cloudwatch_logs: { packageName: 'aws', policyTemplate: 'cloudwatch', inputs: ['aws-cloudwatch'] },
  cloudwatch_metrics: { packageName: 'aws', policyTemplate: 'cloudwatch', inputs: ['aws/metrics'] },

  // ── aws package — Cloud Financial Management ────────────────────────────
  billing: { packageName: 'aws', policyTemplate: 'billing', inputs: ['aws/metrics'] },
  usage: { packageName: 'aws', policyTemplate: 'usage', inputs: ['aws/metrics'] },

  // ── aws package — Security, Identity and Compliance ─────────────────────
  cloudtrail: {
    packageName: 'aws',
    policyTemplate: 'cloudtrail',
    inputs: ['aws-s3', 'aws-cloudwatch'],
  },
  config: { packageName: 'aws', policyTemplate: 'config', inputs: ['cel'] },
  guardduty: { packageName: 'aws', policyTemplate: 'guardduty', inputs: ['aws-s3', 'httpjson'] },
  inspector: { packageName: 'aws', policyTemplate: 'inspector', inputs: ['httpjson'] },
  firewall_logs: {
    packageName: 'aws',
    policyTemplate: 'firewall',
    inputs: ['aws-s3', 'aws-cloudwatch'],
  },
  firewall_metrics: { packageName: 'aws', policyTemplate: 'firewall', inputs: ['aws/metrics'] },
  securityhub_findings: { packageName: 'aws', policyTemplate: 'securityhub', inputs: ['httpjson'] },
  securityhub_findings_full_posture: {
    packageName: 'aws',
    policyTemplate: 'securityhub',
    inputs: ['httpjson'],
  },
  securityhub_insights: { packageName: 'aws', policyTemplate: 'securityhub', inputs: ['httpjson'] },
  waf: { packageName: 'aws', policyTemplate: 'waf', inputs: ['aws-s3', 'aws-cloudwatch'] },

  // ── aws package — Networking and Content Delivery ───────────────────────
  cloudfront_logs: { packageName: 'aws', policyTemplate: 'cloudfront', inputs: ['aws-s3'] },
  elb_logs: { packageName: 'aws', policyTemplate: 'elb', inputs: ['aws-s3', 'aws-cloudwatch'] },
  elb_metrics: { packageName: 'aws', policyTemplate: 'elb', inputs: ['aws/metrics'] },
  natgateway: { packageName: 'aws', policyTemplate: 'natgateway', inputs: ['aws/metrics'] },
  route53_public_logs: {
    packageName: 'aws',
    policyTemplate: 'route53',
    inputs: ['aws-cloudwatch'],
  },
  route53_resolver_logs: {
    packageName: 'aws',
    policyTemplate: 'route53',
    inputs: ['aws-s3', 'aws-cloudwatch'],
  },
  transitgateway: { packageName: 'aws', policyTemplate: 'transitgateway', inputs: ['aws/metrics'] },
  vpcflow: { packageName: 'aws', policyTemplate: 'vpcflow', inputs: ['aws-s3', 'aws-cloudwatch'] },
  vpn: { packageName: 'aws', policyTemplate: 'vpn', inputs: ['aws/metrics'] },

  // ── aws package — Storage ────────────────────────────────────────────────
  ebs: { packageName: 'aws', policyTemplate: 'ebs', inputs: ['aws/metrics'] },
  s3_daily_storage: { packageName: 'aws', policyTemplate: 's3', inputs: ['aws/metrics'] },
  s3_request: { packageName: 'aws', policyTemplate: 's3', inputs: ['aws/metrics'] },
  s3access: { packageName: 'aws', policyTemplate: 's3', inputs: ['aws-s3'] },
  s3_storage_lens: {
    packageName: 'aws',
    policyTemplate: 's3_storage_lens',
    inputs: ['aws/metrics'],
  },

  // ── aws package — Databases ─────────────────────────────────────────────
  dynamodb: { packageName: 'aws', policyTemplate: 'dynamodb', inputs: ['aws/metrics'] },
  rds: { packageName: 'aws', policyTemplate: 'rds', inputs: ['aws/metrics'] },
  redshift: { packageName: 'aws', policyTemplate: 'redshift', inputs: ['aws/metrics'] },

  // ── aws package — Messaging / Analytics ─────────────────────────────────
  kafka_metrics: { packageName: 'aws', policyTemplate: 'kafka', inputs: ['aws/metrics'] },
  kinesis: { packageName: 'aws', policyTemplate: 'kinesis', inputs: ['aws/metrics'] },
  sns: { packageName: 'aws', policyTemplate: 'sns', inputs: ['aws/metrics'] },
  sqs: { packageName: 'aws', policyTemplate: 'sqs', inputs: ['aws/metrics'] },

  // ── aws_bedrock package ─────────────────────────────────────────────────
  guardrails: {
    packageName: 'aws_bedrock',
    policyTemplate: 'aws_bedrock',
    inputs: ['aws/metrics'],
  },
  invocation: {
    packageName: 'aws_bedrock',
    policyTemplate: 'aws_bedrock',
    inputs: ['aws-s3', 'aws-cloudwatch'],
  },
  runtime: { packageName: 'aws_bedrock', policyTemplate: 'aws_bedrock', inputs: ['aws/metrics'] },

  // ── aws_bedrock_agentcore package ───────────────────────────────────────
  bedrock_agentcore: {
    packageName: 'aws_bedrock_agentcore',
    policyTemplate: 'aws_bedrock_agentcore',
    inputs: [],
  },

  // ── awsfargate package ──────────────────────────────────────────────────
  fargate: {
    packageName: 'awsfargate',
    policyTemplate: 'awsfargate',
    inputs: ['awsfargate/metrics'],
    dataStream: 'task_stats',
  },

  // ── aws_mq package ──────────────────────────────────────────────────────
  mq: { packageName: 'aws_mq', policyTemplate: 'amazon_mq', inputs: [] },

  // ── OTel packages ───────────────────────────────────────────────────────
  cloudtrail_otel: { packageName: 'aws_cloudtrail_otel', inputs: [] },
  vpcflow_otel: { packageName: 'aws_vpcflow_otel', inputs: [] },
  waf_otel: { packageName: 'aws_waf_otel', inputs: [] },

  // ── aws_logs package ────────────────────────────────────────────────────
  aws_logs: {
    packageName: 'aws_logs',
    policyTemplate: 'aws_logs',
    inputs: ['aws-s3', 'aws-cloudwatch'],
  },

  // ── awsfirehose package ─────────────────────────────────────────────────
  firehose: { packageName: 'awsfirehose', inputs: [] },
} as const;

/** All known service ids. Used to validate the `services` query parameter. */
export const KNOWN_AWS_SERVICE_IDS: ReadonlySet<string> = new Set(Object.keys(AWS_SERVICE_LOOKUP));
