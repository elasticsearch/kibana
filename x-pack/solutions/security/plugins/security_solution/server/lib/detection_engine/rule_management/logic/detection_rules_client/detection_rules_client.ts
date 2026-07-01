/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';

import { ProductFeatureKey } from '@kbn/security-solution-features/keys';
import type { ILicense } from '@kbn/licensing-types';
import { SecurityRuleChangeTrackingAction } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { DetectionRulesAuthz } from '../../../../../../common/detection_engine/rule_management/authz';
import type { RuleResponse } from '../../../../../../common/api/detection_engine/model/rule_schema';
import { withSecuritySpan } from '../../../../../utils/with_security_span';
import type { MlAuthz } from '../../../../machine_learning/authz';
import type { ProductFeaturesService } from '../../../../product_features_service';
import { createPrebuiltRuleAssetsClient } from '../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import type { RuleImportErrorObject } from '../import/errors';
import type {
  BulkDeleteRulesArgs,
  BulkDeleteRulesReturn,
  CreateCustomRuleArgs,
  CreatePrebuiltRuleArgs,
  DeleteRuleArgs,
  GetHistoryForRuleArgs,
  IDetectionRulesClient,
  ImportRuleArgs,
  ImportRulesArgs,
  PatchRuleArgs,
  RestoreRuleFromHistoryArgs,
  RevertPrebuiltRuleArgs,
  UpdateRuleArgs,
  UpgradePrebuiltRuleArgs,
  BulkCreatePrebuiltRulesArgs,
} from './detection_rules_client_interface';
import type { RestoreRuleFromHistoryResponse } from '../../../../../../common/api/detection_engine/rule_management';
import { createRule } from './methods/create_rule';
import { bulkCreatePrebuiltRules } from './methods/bulk_create_prebuilt_rules';
import { bulkDeleteRules } from './methods/bulk_delete_rules';
import { deleteRule } from './methods/delete_rule';
import { importRule } from './methods/import_rule';
import { importRules } from './methods/import_rules';
import { patchRule } from './methods/patch_rule';
import { updateRule } from './methods/update_rule';
import { upgradePrebuiltRule } from './methods/upgrade_prebuilt_rule';
import { revertPrebuiltRule } from './methods/revert_prebuilt_rule';
import { getHistoryForRule } from './methods/get_history_for_rule';
import { restoreRuleFromHistory } from './methods/restore_rule_from_history';
import { MINIMUM_RULE_CUSTOMIZATION_LICENSE } from '../../../../../../common/constants';

interface DetectionRulesClientParams {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  savedObjectsClient: SavedObjectsClientContract;
  mlAuthz: MlAuthz;
  rulesAuthz: DetectionRulesAuthz;
  productFeaturesService: ProductFeaturesService;
  license: ILicense;
}

export const createDetectionRulesClient = ({
  actionsClient,
  rulesClient,
  mlAuthz,
  rulesAuthz,
  savedObjectsClient,
  productFeaturesService,
  license,
}: DetectionRulesClientParams): IDetectionRulesClient => {
  const prebuiltRuleAssetClient = createPrebuiltRuleAssetsClient(savedObjectsClient);

  return {
    getRuleCustomizationStatus() {
      /**
       * The prebuilt rules customization feature is gated by the license level.
       *
       * The license level is verified against the minimum required level for
       * the feature (Enterprise). However, since Serverless always operates at
       * the Enterprise license level, we must also check if the feature is
       * enabled in the product features. In Serverless, for different tiers,
       * unavailable features are disabled.
       */
      const isRulesCustomizationEnabled =
        license.hasAtLeast(MINIMUM_RULE_CUSTOMIZATION_LICENSE) &&
        productFeaturesService.isEnabled(ProductFeatureKey.prebuiltRuleCustomization);

      return {
        isRulesCustomizationEnabled,
      };
    },
    async createCustomRule(args: CreateCustomRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.createCustomRule', async () => {
        return createRule({
          actionsClient,
          rulesClient,
          rule: {
            ...args.params,
            // For backwards compatibility, we default to true if not provided.
            // The default enabled value is false for prebuilt rules, and true
            // for custom rules.
            enabled: args.params.enabled ?? true,
            immutable: false,
          },
          mlAuthz,
          changeTracking: args.changeTracking,
        });
      });
    },

    async createPrebuiltRule(args: CreatePrebuiltRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.createPrebuiltRule', async () => {
        return createRule({
          actionsClient,
          rulesClient,
          rule: {
            ...args.params,
            immutable: true,
          },
          mlAuthz,
          changeTracking: {
            action: SecurityRuleChangeTrackingAction.ruleInstall,
            ...args.changeTracking,
          },
        });
      });
    },

    async bulkCreatePrebuiltRules(args: BulkCreatePrebuiltRulesArgs) {
      return withSecuritySpan('DetectionRulesClient.bulkCreatePrebuiltRules', async () => {
        return bulkCreatePrebuiltRules({ actionsClient, rulesClient, mlAuthz, args });
      });
    },

    async updateRule({ ruleUpdate, changeTracking }: UpdateRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.updateRule', async () => {
        return updateRule({
          actionsClient,
          rulesClient,
          prebuiltRuleAssetClient,
          mlAuthz,
          rulesAuthz,
          ruleUpdate,
          changeTracking,
        });
      });
    },

    async patchRule({ rulePatch, changeTracking }: PatchRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.patchRule', async () => {
        return patchRule({
          actionsClient,
          rulesClient,
          prebuiltRuleAssetClient,
          mlAuthz,
          rulesAuthz,
          rulePatch,
          changeTracking,
        });
      });
    },

    async deleteRule({ ruleId }: DeleteRuleArgs): Promise<void> {
      return withSecuritySpan('DetectionRulesClient.deleteRule', async () => {
        return deleteRule({ rulesClient, ruleId });
      });
    },

    async bulkDeleteRules({
      ruleIds,
      changeTracking,
    }: BulkDeleteRulesArgs): Promise<BulkDeleteRulesReturn> {
      return withSecuritySpan('DetectionRulesClient.bulkDeleteRules', async () => {
        return bulkDeleteRules({ rulesClient, ruleIds, changeTracking });
      });
    },

    async upgradePrebuiltRule({
      ruleAsset,
      changeTracking,
    }: UpgradePrebuiltRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.upgradePrebuiltRule', async () => {
        return upgradePrebuiltRule({
          actionsClient,
          rulesClient,
          ruleAsset,
          mlAuthz,
          prebuiltRuleAssetClient,
          changeTracking,
        });
      });
    },

    async revertPrebuiltRule({
      ruleAsset,
      existingRule,
      changeTracking,
    }: RevertPrebuiltRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.revertPrebuiltRule', async () => {
        return revertPrebuiltRule({
          actionsClient,
          rulesClient,
          ruleAsset,
          mlAuthz,
          prebuiltRuleAssetClient,
          existingRule,
          changeTracking,
        });
      });
    },

    async importRule(args: ImportRuleArgs): Promise<RuleResponse> {
      return withSecuritySpan('DetectionRulesClient.importRule', async () => {
        return importRule({
          actionsClient,
          rulesClient,
          importRulePayload: args,
          mlAuthz,
          prebuiltRuleAssetClient,
          changeTracking: args.changeTracking,
        });
      });
    },

    async importRules(args: ImportRulesArgs): Promise<Array<RuleResponse | RuleImportErrorObject>> {
      return withSecuritySpan('DetectionRulesClient.importRules', async () => {
        return importRules({
          ...args,
          detectionRulesClient: this,
          savedObjectsClient,
        });
      });
    },

    async getHistoryForRule(args: GetHistoryForRuleArgs) {
      return withSecuritySpan('DetectionRulesClient.getHistoryForRule', async () => {
        return getHistoryForRule({ rulesClient, ...args });
      });
    },

    async restoreRuleFromHistory({
      ruleId,
      changeId,
      currentRuleRevision,
    }: RestoreRuleFromHistoryArgs): Promise<RestoreRuleFromHistoryResponse> {
      return withSecuritySpan('DetectionRulesClient.restoreRuleFromHistory', async () => {
        return restoreRuleFromHistory({
          actionsClient,
          rulesClient,
          prebuiltRuleAssetClient,
          mlAuthz,
          rulesAuthz,
          ruleId,
          changeId,
          currentRuleRevision,
        });
      });
    },
  };
};
