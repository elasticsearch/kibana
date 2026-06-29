/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Re-export from common so the server and browser share a single implementation.
export type { ProviderPermissions } from '../../common/aws_provider_permissions';
export {
  AWS_METRICS_PACKAGE_ACTIONS,
  AWS_S3_INPUT_ACTIONS,
  AWS_CLOUDWATCH_INPUT_ACTIONS,
  AWS_S3_INVENTORY_METRICS_ACTIONS,
  AWS_SERVICE_PROVIDER_PERMISSIONS,
} from '../../common/aws_provider_permissions';
