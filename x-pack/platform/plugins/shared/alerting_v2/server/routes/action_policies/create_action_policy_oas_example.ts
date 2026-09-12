/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertingOasOperationObject } from '../oas_types';
import {
  CREATE_ACTION_POLICY_REQUEST,
  actionPolicyResponseExample,
  invalidActionPolicyDataResponse,
} from './action_policy_oas_shared_examples';
import { buildOasOperation } from '../oas_utils';

export const createActionPolicyOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'createActionPolicyRequest',
      summary: 'Notification for alerts from rules with the production tag',
      value: CREATE_ACTION_POLICY_REQUEST,
    },
    responses: {
      201: actionPolicyResponseExample('createActionPolicyResponse', 'Newly created action policy'),
      400: invalidActionPolicyDataResponse('create'),
    },
  });
