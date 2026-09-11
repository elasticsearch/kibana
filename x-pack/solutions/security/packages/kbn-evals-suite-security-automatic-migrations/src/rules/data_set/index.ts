/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { qradarPrebuiltRules } from './qradar';
import { splunkPrebuiltRules } from './splunk';
import type { PrebuiltRuleFixture } from './types';

export type { PrebuiltRuleFixture } from './types';
export { splunkPrebuiltRules } from './splunk';
export { qradarPrebuiltRules } from './qradar';

/** Every vendor's prebuilt-rule fixtures, in a single list for `loadPrebuiltRules`. */
export const prebuiltRules: PrebuiltRuleFixture[] = [
  ...splunkPrebuiltRules,
  ...qradarPrebuiltRules,
];
