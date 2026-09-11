/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { APIFields } from '../../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum, FormMonitorType } from '../../../../common/runtime_types';
import { DEFAULT_FIELDS } from '../../../../common/constants/monitor_defaults';
import type { NormalizedProjectProps, NormalizerResult } from './common_fields';
import { getNormalizeCommonFields, getValueInSeconds } from './common_fields';

/**
 * Normalize a project monitor pushed by `@elastic/synthetics` as `monitor.type: api`
 * (see elastic/synthetics#997 / elastic/beats#50802) into the Kibana SO shape.
 *
 * Structurally identical to the browser normalizer, but:
 *  - emits MONITOR_TYPE === 'api' (Heartbeat routes to the api plugin, no Chromium)
 *  - inherits API-correct defaults for `screenshots` (OFF) and `throttling`
 *    (NO_THROTTLING) via DEFAULT_FIELDS[MonitorTypeEnum.API]; both are stripped
 *    from the CLI invocation by Heartbeat's api plugin (elastic/beats#50802),
 *    and neither is surfaced in the API form.
 *  - keeps `ignoreHTTPSErrors` and `playwrightOptions` (both apply to
 *    Playwright's APIRequestContext)
 */
export const getNormalizeAPIFields = ({
  locations = [],
  privateLocations = [],
  monitor,
  projectId,
  namespace,
  version,
  maintenanceWindows,
}: NormalizedProjectProps): NormalizerResult<APIFields> => {
  const defaultFields = DEFAULT_FIELDS[MonitorTypeEnum.API];

  const { errors, normalizedFields: commonFields } = getNormalizeCommonFields({
    locations,
    privateLocations,
    monitor,
    projectId,
    namespace,
    version,
    maintenanceWindows,
  });

  const normalizedFields = {
    ...commonFields,
    [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.API,
    [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.API,
    [ConfigKey.SOURCE_PROJECT_CONTENT]:
      monitor.content || defaultFields[ConfigKey.SOURCE_PROJECT_CONTENT],
    [ConfigKey.IGNORE_HTTPS_ERRORS]:
      monitor.ignoreHTTPSErrors || defaultFields[ConfigKey.IGNORE_HTTPS_ERRORS],
    [ConfigKey.PLAYWRIGHT_OPTIONS]: Object.keys(monitor.playwrightOptions || {}).length
      ? JSON.stringify(monitor.playwrightOptions)
      : defaultFields[ConfigKey.PLAYWRIGHT_OPTIONS],
    [ConfigKey.JOURNEY_FILTERS_MATCH]:
      monitor.filter?.match || defaultFields[ConfigKey.JOURNEY_FILTERS_MATCH],
    [ConfigKey.TIMEOUT]: monitor.timeout
      ? getValueInSeconds(monitor.timeout)
      : defaultFields[ConfigKey.TIMEOUT],
  };
  return {
    normalizedFields: {
      ...defaultFields,
      ...normalizedFields,
    },
    unsupportedKeys: [],
    errors,
  };
};
