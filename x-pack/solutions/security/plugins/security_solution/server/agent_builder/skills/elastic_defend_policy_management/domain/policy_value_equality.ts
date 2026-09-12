/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';

export const policyValuesEqual = (left: unknown, right: unknown): boolean =>
  Object.is(left, right) || (Array.isArray(left) && Array.isArray(right) && isEqual(left, right));
