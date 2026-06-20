/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsBulkUpdateObject, SavedObjectsFindResult } from '@kbn/core/server';
import type { UntypedNormalizedRuleType } from '../../../rule_type_registry';
import type { RuleDomain, RuleParams } from '../../../application/rule/types';
import type { BulkEditActionSkipResult, RawRule, SanitizedRule } from '../../../types';
import type { BulkOperationError } from '../../types';
import type { Rule } from '../../../../common';

export type ShouldIncrementRevision<Params extends RuleParams> = (params?: Params) => boolean;

interface ParamsModifierResult<Params extends RuleParams> {
  modifiedParams: Params;
  isParamsUpdateSkipped: boolean;
}

export type ParamsModifier<Params extends RuleParams> = (
  rule: Rule<Params>
) => Promise<ParamsModifierResult<Params>>;

export type ApiKeysMap = Map<
  string,
  {
    oldApiKey?: string;
    newApiKey?: string;
    oldUiamApiKey?: string | null;
    newUiamApiKey?: string | null;
    oldApiKeyCreatedByUser?: boolean | null;
    newApiKeyCreatedByUser?: boolean | null;
  }
>;

// TODO (http-versioning): This should be of type Rule, change this when all rule types are fixed
export interface BulkEditResult<Params extends RuleParams> {
  rules: Array<SanitizedRule<Params>>;
  skipped: BulkEditActionSkipResult[];
  errors: BulkOperationError[];
  total: number;
}

export interface UpdateAttributesFnOpts<Params extends RuleParams> {
  domainRule: RuleDomain<Params>;
  ruleActions: RuleDomain['actions'] | RuleDomain['systemActions'];
  ruleType: UntypedNormalizedRuleType;
}

export interface UpdateAttributesFnResult<Params extends RuleParams> {
  rule: RuleDomain<Params>;
  ruleActions: RuleDomain['actions'] | RuleDomain['systemActions'];
  hasUpdateApiKeyOperation: boolean;
  isAttributesUpdateSkipped: boolean;
}
export interface UpdateOperationOpts {
  rule: SavedObjectsFindResult<RawRule>;
  apiKeysMap: ApiKeysMap;
  rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
  skipped: BulkEditActionSkipResult[];
  errors: BulkOperationError[];
  username: string | null;
  legacyActionsMigratedRuleIds: string[];
}
