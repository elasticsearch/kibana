/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { BaseParams } from '@kbn/reporting-common/types';

export function checkParamsVersion(jobParams: BaseParams, logger: Logger, defaultVersion: string) {
  if (jobParams.version) {
    logger.debug(`Using reporting job params v${jobParams.version}`);
    return jobParams.version;
  }

  logger.debug(`No version provided in report job params. Defaulting to ${defaultVersion}`);
  return defaultVersion;
}
