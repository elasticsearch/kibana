/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { has } from 'lodash';
import type { ImportRuleError, RuleImportErrorType } from './types';

export const createRuleImportErrorObject = ({
  ruleId,
  message,
  type,
}: {
  ruleId: string;
  message: string;
  type?: RuleImportErrorType;
}): ImportRuleError => ({
  error: {
    ruleId,
    message,
    type: type ?? 'unknown',
  },
});

export const isRuleImportError = (obj: unknown): obj is ImportRuleError =>
  has(obj, 'error') &&
  has(obj, 'error.ruleId') &&
  has(obj, 'error.type') &&
  has(obj, 'error.message');
