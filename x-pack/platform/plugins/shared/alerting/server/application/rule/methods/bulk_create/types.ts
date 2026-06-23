/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectReference } from '@kbn/core/server';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { IntervalSchedule } from '../../../../../common';
import type { RuleParams } from '../../types';
import type { CreateRuleData } from '../create/types';
import type { CreateRuleOptions } from '../create/create_rule';
import type { BulkOperationError, RulesClientContext } from '../../../../rules_client/types';
import type { RawRule } from '../../../../types';

export interface PreparedRule {
  id: string;
  name: string;
  enabled: boolean;
  rawRule: RawRule;
  references: SavedObjectReference[];
  schedule: IntervalSchedule;
  consumer: string;
  ruleTypeId: string;
}

export interface ApiKeyEntry {
  apiKey: string | null;
  uiamApiKey: string | null;
  apiKeyCreatedByUser: boolean | null;
}

export interface PrepareRuleArgs<Params extends RuleParams> {
  context: RulesClientContext;
  actionsClient: Awaited<ReturnType<RulesClientContext['getActionsClient']>>;
  username: string | null;
  id: string;
  rule: BulkCreateRulesItem<Params>;
  apiKeys: Map<string, ApiKeyEntry>;
  invalidKeys: ApiKeyEntry[];
}

export interface BulkCreateRulesItem<Params extends RuleParams = never> {
  data: CreateRuleData<Params>;
  options?: CreateRuleOptions;
  allowMissingConnectorSecrets?: boolean;
}

export interface BulkCreateRulesParams<Params extends RuleParams = never> {
  rules: Array<BulkCreateRulesItem<Params>>;
  /** Per-batch size (callers should enforce request-level limits). */
  batchSize?: number;
  /** If true, stop on the first error of any kind. Defaults to false. */
  exitEarlyOnError?: boolean;
  /** Rule change tracking context. `action` defaults to `RuleChangeTrackingAction.ruleCreate`; consumers can override. */
  changeTracking?: RuleChangeTracking;
}

export interface BulkCreateRulesResult {
  /** IDs of rules whose SO was successfully persisted. */
  successfulIds: string[];
  errors: BulkOperationError[];
  total: number;
}

export interface BatchResult {
  successfulIds: string[];
  errors: BulkOperationError[];
}
