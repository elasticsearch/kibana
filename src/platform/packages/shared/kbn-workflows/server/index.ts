/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { ExecutionError } from './errors/execution_error';
export { loadWorkflowExampleContent } from './examples';
export { validateWorkflowForExecution } from './lib/validate_workflow_for_execution';
export { readWorkflowVersioningEnabled } from './lib/read_workflow_versioning_enabled';
export { buildWorkflowFilters } from './lib/workflow_filters';
export type {
  BuildWorkflowFiltersParams,
  DeletedFilter,
  ManagedFilter,
  WorkflowQueryFilter,
} from './lib/workflow_filters';
export type { WorkflowsApiRequestHandlerContext, WorkflowsClient } from './types';

export {
  getStepExecutionsByIds,
  getStepExecutionsByWorkflowExecution,
} from './repositories/step_execution_repository';
export { WorkflowRepository } from './repositories/workflow_repository';
export { GLOBAL_WORKFLOW_SPACE_ID } from './constants';

export {
  EXTERNAL_RESUME_API_PATH,
  WORKFLOW_EXTERNAL_RESUME_APPLICATION,
  WORKFLOW_EXTERNAL_RESUME_ROLE,
  DEFAULT_WAIT_FOR_APPROVAL_TIMEOUT,
} from './external_resume/constants';
export { buildExternalResumeUrl } from './external_resume/build_external_resume_url';
export {
  createExternalResumeApiKey,
  invalidateExternalResumeApiKey,
} from './external_resume/create_external_resume_api_key';
export type { ExternalResumeApiKey } from './external_resume/create_external_resume_api_key';
export {
  getAuthenticatedExternalResumeApiKeyId,
  loadExternalResumeApiKeyMetadata,
  parseExternalResumeApiKeyMetadata,
  ExternalResumeApiKeyMetadataError,
} from './external_resume/external_resume_api_key_request';
export type { ExternalResumeApiKeyMetadata } from './external_resume/external_resume_api_key_request';

export type {
  GetManagedWorkflowStatusOptions,
  ManagedWorkflowStatus,
  ManagedWorkflowStatusReport,
} from './types';
