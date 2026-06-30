/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  RESOLUTION_RULE_IDS,
  type ResolutionRuleId,
} from '../../../common/domain/resolution_rules/constants';

export interface ResolutionRuleConfig {
  id: ResolutionRuleId;
  description: string;
}

// The rules wired into the maintainer and exposed by the API. Adding a rule here
// is all that's needed to ship it — its per-rule state backfills on first run.
export const RESOLUTION_RULE_CONFIGS: ResolutionRuleConfig[] = [
  {
    id: RESOLUTION_RULE_IDS.EMAIL_EXACT_MATCH,
    description: 'Email exact match across identity providers',
  },
];
