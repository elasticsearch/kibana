/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stableStringify } from '@kbn/std';
import type { NormalizedPolicyConfig } from './normalized_policy_config';

export const hashPolicyConfig = (policy: NormalizedPolicyConfig): string => stableStringify(policy);
