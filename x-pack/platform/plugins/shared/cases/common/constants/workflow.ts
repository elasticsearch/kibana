/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const CASES_WORKFLOW_EXECUTION_SOURCE = 'cases' as const;
export const CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION = 1 as const;
export const MAX_CASE_WORKFLOW_RUN_ID_LENGTH = 1024 as const;
export const MAX_CASES_PER_WORKFLOW_RUN = 10 as const;
export const MAX_ATTACHMENTS_PER_WORKFLOW_RUN = 1000 as const;
export const MAX_WORKFLOW_INPUT_KEY_LENGTH = 1024 as const;
export const MAX_WORKFLOW_INPUTS_BYTES = 1_000_000 as const;

export const CASE_WORKFLOW_ORIGIN_TYPE = 'cases.case' as const;
export const OBSERVABLE_WORKFLOW_ORIGIN_TYPE = 'cases.observable' as const;
export const OBSERVABLES_WORKFLOW_ORIGIN_TYPE = 'cases.observables' as const;
export const ATTACHMENT_WORKFLOW_ORIGIN_TYPE = 'cases.attachment' as const;
export const ATTACHMENTS_WORKFLOW_ORIGIN_TYPE = 'cases.attachments' as const;

export const CASE_WORKFLOW_RUN_ORIGIN_TYPES = [
  CASE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
] as const;
