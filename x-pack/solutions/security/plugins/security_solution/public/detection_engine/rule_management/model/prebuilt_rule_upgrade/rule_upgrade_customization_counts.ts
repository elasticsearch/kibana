/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The shape both the Selected-scope and All-scope customized-rule checks return.
 */
export interface RuleUpgradeCustomizationCounts {
  total: number;
  customizedCount: number;
}
