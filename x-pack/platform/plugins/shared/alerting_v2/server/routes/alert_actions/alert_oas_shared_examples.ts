/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ErrorResponse } from '@kbn/alerting-v2-schemas';
import { ALERTING_ERROR_CODES } from '../../lib/errors/error_codes';
import {
  getAlertEpisodeNotFoundMessage,
  getAlertSeriesNotFoundMessage,
} from '../../lib/errors/alert_error_messages';
import { invalidResponseExample } from '../oas_utils';
import type { OasExampleEntry } from '../oas_types';

export const SAMPLE_GROUP_HASH = 'group-hash-1';
export const SAMPLE_EPISODE_ID = 'episode-1';

/** Shared 400 body for series-level alert-action routes (missing path params). */
export const INVALID_SERIES_ACTION_PARAMS_RESPONSE = invalidResponseExample({
  summary: 'Path is missing required group_hash.',
  message: 'group_hash: Required',
  details: { errors: { group_hash: ['Required'] } },
});

/** Shared 400 body for episode-level alert-action routes (missing path params). */
export const INVALID_EPISODE_ACTION_PARAMS_RESPONSE = invalidResponseExample({
  summary: 'Path is missing required episode_id',
  message: 'episode_id: Required',
  details: { errors: { episode_id: ['Required'] } },
});

/** Shared 404 body for series-level alert-action routes. */
export const ALERT_SERIES_NOT_FOUND_RESPONSE: OasExampleEntry = {
  name: 'alertSeriesNotFound',
  summary: 'No alert episode series exists for the given group_hash',
  value: {
    code: ALERTING_ERROR_CODES.ALERT_EVENT_NOT_FOUND,
    error: 'Not Found',
    message: getAlertSeriesNotFoundMessage(SAMPLE_GROUP_HASH),
    details: {
      group_hash: SAMPLE_GROUP_HASH,
    },
  } satisfies ErrorResponse,
};

/** Shared 404 body for episode-level alert-action routes. */
export const ALERT_EPISODE_NOT_FOUND_RESPONSE: OasExampleEntry = {
  name: 'alertEpisodeNotFound',
  summary: 'No alert episode exists for the given episode_id',
  value: {
    code: ALERTING_ERROR_CODES.ALERT_EPISODE_NOT_FOUND,
    error: 'Not Found',
    message: getAlertEpisodeNotFoundMessage(SAMPLE_EPISODE_ID),
    details: {
      episode_id: SAMPLE_EPISODE_ID,
    },
  } satisfies ErrorResponse,
};
