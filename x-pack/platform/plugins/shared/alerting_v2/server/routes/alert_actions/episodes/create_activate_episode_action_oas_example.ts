/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CreateActivateEpisodeActionBody } from '@kbn/alerting-v2-schemas';
import type { AlertingOasOperationObject } from '../../oas_types';
import { buildOasOperation } from '../../oas_utils';
import {
  ALERT_EPISODE_NOT_FOUND_RESPONSE,
  INVALID_EPISODE_ACTION_PARAMS_RESPONSE,
} from '../alert_oas_shared_examples';

export const CREATE_ACTIVATE_EPISODE_ACTION_REQUEST: CreateActivateEpisodeActionBody = {
  reason: 'Issue reappeared after silence window.',
};

export const createActivateEpisodeActionOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'createActivateEpisodeActionRequest',
      summary: 'Activate with a reason',
      value: CREATE_ACTIVATE_EPISODE_ACTION_REQUEST,
    },
    responses: {
      400: INVALID_EPISODE_ACTION_PARAMS_RESPONSE,
      404: ALERT_EPISODE_NOT_FOUND_RESPONSE,
    },
  });
