/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RegisterRuleTypesParams } from '../types';
import { getRuleType } from './rule_type';

export function register(params: RegisterRuleTypesParams) {
  const { alerting } = params;
  alerting.registerType(getRuleType());
}
