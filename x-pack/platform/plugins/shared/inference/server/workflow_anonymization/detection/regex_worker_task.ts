/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PiiRegexWorkerTaskPayload } from './types';
import { executeRegexRules } from './execute_regex_rules';

// eslint-disable-next-line import/no-default-export
export default function (payload: PiiRegexWorkerTaskPayload) {
  return executeRegexRules(payload);
}
