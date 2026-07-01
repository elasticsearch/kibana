/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkOperationError } from '@kbn/alerting-plugin/server';
import type { SecurityRuleChangeTracking } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type {
  RuleCreateProps,
  RuleUpdateProps,
  RulePatchProps,
  RuleObjectId,
  RuleResponse,
  RuleToImport,
  RuleSource,
} from '../../../../../../common/api/detection_engine';
import type {
  RuleChangesHistoryResponse,
  RestoreRuleFromHistoryResponse,
} from '../../../../../../common/api/detection_engine/rule_management';
import type { IRuleSourceImporter } from '../import/rule_source_importer';
import type { RuleImportErrorObject } from '../import/errors';
import type { PrebuiltRuleAsset } from '../../../prebuilt_rules';
import type { PrebuiltRulesCustomizationStatus } from '../../../../../../common/detection_engine/prebuilt_rules/prebuilt_rule_customization_status';
import type { RuleAlertType } from '../../../rule_schema';

export interface IDetectionRulesClient {
  getRuleCustomizationStatus: () => PrebuiltRulesCustomizationStatus;
  createCustomRule: (args: CreateCustomRuleArgs) => Promise<RuleResponse>;
  createPrebuiltRule: (args: CreatePrebuiltRuleArgs) => Promise<RuleResponse>;
  bulkCreatePrebuiltRules: (
    args: BulkCreatePrebuiltRulesArgs
  ) => Promise<BulkCreatePrebuiltRulesResult>;
  updateRule: (args: UpdateRuleArgs) => Promise<RuleResponse>;
  patchRule: (args: PatchRuleArgs) => Promise<RuleResponse>;
  deleteRule: (args: DeleteRuleArgs) => Promise<void>;
  bulkDeleteRules: (args: BulkDeleteRulesArgs) => Promise<BulkDeleteRulesReturn>;
  upgradePrebuiltRule: (args: UpgradePrebuiltRuleArgs) => Promise<RuleResponse>;
  revertPrebuiltRule: (args: RevertPrebuiltRuleArgs) => Promise<RuleResponse>;
  importRule: (args: ImportRuleArgs) => Promise<RuleResponse>;
  importRules: (args: ImportRulesArgs) => Promise<Array<RuleResponse | RuleImportErrorObject>>;
  getHistoryForRule: (args: GetHistoryForRuleArgs) => Promise<RuleChangesHistoryResponse>;
  restoreRuleFromHistory: (
    args: RestoreRuleFromHistoryArgs
  ) => Promise<RestoreRuleFromHistoryResponse>;
}

export interface CreateCustomRuleArgs {
  params: RuleCreateProps;
  changeTracking?: SecurityRuleChangeTracking;
}

export interface CreatePrebuiltRuleArgs {
  params: RuleCreateProps;
  changeTracking?: SecurityRuleChangeTracking<never>;
}

export interface UpdateRuleArgs {
  ruleUpdate: RuleUpdateProps;
  changeTracking?: SecurityRuleChangeTracking;
}

export interface PatchRuleArgs {
  rulePatch: RulePatchProps;
  changeTracking?: SecurityRuleChangeTracking;
}

export interface DeleteRuleArgs {
  ruleId: RuleObjectId;
}

export interface BulkDeleteRulesArgs {
  ruleIds: RuleObjectId[];
  changeTracking?: SecurityRuleChangeTracking<never>;
}

export interface BulkDeleteRulesReturn {
  rules: RuleAlertType[];
  errors: BulkOperationError[];
}

export interface UpgradePrebuiltRuleArgs {
  ruleAsset: PrebuiltRuleAsset;
  changeTracking?: SecurityRuleChangeTracking<never>;
}

export interface RevertPrebuiltRuleArgs {
  ruleAsset: PrebuiltRuleAsset;
  existingRule: RuleResponse;
  changeTracking?: SecurityRuleChangeTracking<never>;
}

export interface ImportRuleArgs {
  ruleToImport: RuleToImport;
  overrideFields?: { rule_source: RuleSource; immutable: boolean };
  overwriteRules?: boolean;
  allowMissingConnectorSecrets?: boolean;
  changeTracking?: SecurityRuleChangeTracking<never>;
}

export interface ImportRulesArgs {
  rules: RuleToImport[];
  overwriteRules: boolean;
  ruleSourceImporter: IRuleSourceImporter;
  allowMissingConnectorSecrets?: boolean;
  changeTracking?: SecurityRuleChangeTracking<never>;
}

export interface GetHistoryForRuleArgs {
  ruleId: RuleObjectId;
  page?: number;
  perPage?: number;
}

export interface RestoreRuleFromHistoryArgs {
  ruleId: RuleObjectId;
  changeId: string;
  /**
   * Current rule's revision for concurrency control.
   * It has to be omitted for restoring a deleted rule.
   */
  currentRuleRevision?: number;
}

export interface BulkCreatePrebuiltRulesArgs {
  rules: PrebuiltRuleAsset[];
}

export interface BulkCreatePrebuiltRulesResultItem {
  id: string;
  rule_id: string;
  version: number;
}

export interface BulkCreatePrebuiltRulesResult {
  results: BulkCreatePrebuiltRulesResultItem[];
  errors: Array<{ item: PrebuiltRuleAsset; error: Error }>;
}
