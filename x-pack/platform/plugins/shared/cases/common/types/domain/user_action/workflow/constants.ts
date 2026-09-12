/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CASE_WORKFLOW_RUN_ORIGIN_TYPES } from '../../../../constants/workflow';

export {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  CASE_WORKFLOW_ORIGIN_TYPE,
  CASE_WORKFLOW_RUN_ORIGIN_TYPES,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from '../../../../constants/workflow';

export type CaseWorkflowRunOriginType = (typeof CASE_WORKFLOW_RUN_ORIGIN_TYPES)[number];
