/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CSPM_POLICY_TEMPLATE,
  KSPM_POLICY_TEMPLATE,
  CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN,
  CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS,
} from '@kbn/cloud-security-posture-common';
import { CNVM_POLICY_TEMPLATE } from '@kbn/cloud-security-posture-plugin/common/constants';
export const CLOUD_SECURITY_TASK_TYPE = 'cloud_security';
export const AGGREGATION_PRECISION_THRESHOLD = 40000;
export const ASSETS_SAMPLE_GRANULARITY = '24h';
export const THRESHOLD_MINUTES = 30;

export const CSPM = CSPM_POLICY_TEMPLATE;
export const KSPM = KSPM_POLICY_TEMPLATE;
export const CNVM = CNVM_POLICY_TEMPLATE;

export const METERING_CONFIGS = {
  [CSPM]: {
    index: CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS,
    assets_identifier: 'resource.id',
  },
  [KSPM]: {
    index: CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS,
    assets_identifier: 'agent.id',
  },
  [CNVM]: {
    index: CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN,
    assets_identifier: 'cloud.instance.id',
  },
};

// GCP Compute instance duration-based metering filter
// Only count gcp-compute-instance resources that have been running for at least this duration
export const GCP_COMPUTE_MIN_RUNNING_DURATION_HOURS = 24;
export const GCP_COMPUTE_INSTANCE_SUB_TYPE = 'gcp-compute-instance';
// Runtime field name used to compute GCP compute instance running duration at query time.
// resource.raw is stored with enabled:false so its sub-fields are inaccessible via doc[]; a runtime
// field is the only way to read _source in a filter context.
export const GCP_COMPUTE_DURATION_RUNTIME_FIELD = '_kibana_cspm_gcp_running_duration_ms';

// see https://github.com/elastic/security-team/issues/8970 for billable asset definition
export const BILLABLE_ASSETS_CONFIG = {
  [CSPM]: {
    filter_attribute: 'resource.sub_type',
    values: [
      // 'aws-ebs', we can't include EBS volumes until https://github.com/elastic/security-team/issues/9283 is resolved
      // 'aws-ec2', we can't include EC2 instances until https://github.com/elastic/security-team/issues/9254 is resolved
      'aws-s3',
      'aws-rds',
      'azure-disk',
      'azure-document-db-database-account',
      'azure-flexible-mysql-server-db',
      'azure-flexible-postgresql-server-db',
      'azure-mysql-server-db',
      'azure-postgresql-server-db',
      'azure-sql-server',
      'azure-storage-account',
      'azure-vm',
      'gcp-bigquery-dataset',
      'gcp-compute-disk',
      'gcp-compute-instance',
      'gcp-sqladmin-instance',
      'gcp-storage-bucket',
    ],
  },
  [KSPM]: {
    filter_attribute: 'resource.sub_type',
    values: ['Node', 'node'],
  },
};
