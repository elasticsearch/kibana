/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const EXTERNAL_RESUME_API_PATH =
  '/api/workflows/executions/{executionId}/resume/external' as const;

export const WORKFLOW_EXTERNAL_RESUME_ROLE = 'workflow_external_resume' as const;

export const WORKFLOW_EXTERNAL_RESUME_APPLICATION = 'kibana-workflows' as const;

export { DEFAULT_WAIT_FOR_APPROVAL_TIMEOUT } from '../../common/wait_for_approval';
