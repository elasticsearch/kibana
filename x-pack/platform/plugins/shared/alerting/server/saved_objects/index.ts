/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Logger,
  SavedObject,
  SavedObjectsExportTransformContext,
  SavedObjectsServiceSetup,
} from '@kbn/core/server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import type { MigrateFunctionsObject } from '@kbn/kibana-utils-plugin/common';
import {
  triggersActionsRoute,
  createRuleFromTemplateRoute,
  getRuleDetailsRoute,
} from '@kbn/rule-data-utils';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { alertMappings } from '../../common/saved_objects/rules/mappings';
import { rulesSettingsMappings } from './rules_settings_mappings';
import { ruleTemplateMappings } from './rule_template_mappings';
import { getMigrations } from './migrations';
import { transformRulesForExport } from './transform_rule_for_export';
import type { RawRule, RawRuleTemplate } from '../types';
import { getImportWarnings } from './get_import_warnings';
import { isRuleExportable } from './is_rule_exportable';
import type { RuleTypeRegistry } from '../rule_type_registry';
export {
  atomicRemoveSnoozedInstancesWithEs,
  partiallyUpdateRule,
  partiallyUpdateRuleWithEs,
  type ExpiredSnoozedInstance,
} from './partially_update_rule';
import { RULES_SETTINGS_SAVED_OBJECT_TYPE } from '../../common';
import {
  adHocRunParamsModelVersions,
  apiKeyPendingInvalidationModelVersions,
  ruleModelVersions,
  ruleTemplateModelVersions,
  rulesSettingsModelVersions,
  gapAutoFillSchedulerModelVersions,
  uiamApiKeysProvisioningStatusModelVersions,
} from './model_versions';

export const RULE_SAVED_OBJECT_TYPE = 'alert';
export const RULE_TEMPLATE_SAVED_OBJECT_TYPE = 'alerting_rule_template';
export const AD_HOC_RUN_SAVED_OBJECT_TYPE = 'ad_hoc_run_params';
export const API_KEY_PENDING_INVALIDATION_TYPE = 'api_key_pending_invalidation';
export const GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE = 'gap_auto_fill_scheduler';
export const UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE =
  'uiam_api_keys_provisioning_status';

export const RuleAttributesToEncrypt = ['apiKey', 'uiamApiKey'];

// Use caution when removing items from this array! These fields
// are used to construct decryption AAD and must be remain in
// this array to prevent decryption failures during migration.
// NOTE: Always update the RuleAttributesNotPartiallyUpdatable
// type if this const changes!
export const RuleAttributesIncludedInAAD = [
  'enabled',
  'name',
  'tags',
  'alertTypeId',
  'consumer',
  'legacyId',
  'schedule',
  'actions',
  'params',
  'mapped_params',
  'createdBy',
  'createdAt',
  'apiKeyOwner',
  'apiKeyCreatedByUser',
  'throttle',
  'notifyWhen',
  'meta',
  'alertDelay',
];

// useful type for Omit<RuleAttributes, [...RuleAttributesToEncrypt, ...RuleAttributesIncludedInAAD]>
// which will produce a subset of RuleAttributes with just attributes that are safe to partually
// update from AAD
export type RuleAttributesNotPartiallyUpdatable =
  | 'apiKey'
  | 'enabled'
  | 'name'
  | 'tags'
  | 'alertTypeId'
  | 'consumer'
  | 'legacyId'
  | 'schedule'
  | 'actions'
  | 'params'
  | 'mapped_params'
  | 'createdBy'
  | 'createdAt'
  | 'apiKeyOwner'
  | 'apiKeyCreatedByUser'
  | 'throttle'
  | 'notifyWhen'
  | 'meta'
  | 'alertDelay';

export const AdHocRunAttributesToEncrypt = ['apiKeyToUse'];
export const AdHocRunAttributesIncludedInAAD = ['rule', 'spaceId'];
export type AdHocRunAttributesNotPartiallyUpdatable = 'rule' | 'spaceId' | 'apiKeyToUse';

export function setupSavedObjects(
  savedObjects: SavedObjectsServiceSetup,
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup,
  ruleTypeRegistry: RuleTypeRegistry,
  logger: Logger,
  isPreconfigured: (connectorId: string) => boolean,
  getSearchSourceMigrations: () => MigrateFunctionsObject
) {
  savedObjects.registerType({
    name: RULE_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'multiple-isolated',
    convertToMultiNamespaceTypeVersion: '8.0.0',
    migrations: getMigrations(encryptedSavedObjects, getSearchSourceMigrations(), isPreconfigured),
    mappings: alertMappings,
    management: {
      displayName: 'rule',
      importableAndExportable: true,
      getTitle(ruleSavedObject: SavedObject<RawRule>) {
        return `Rule: [${ruleSavedObject.attributes.name}]`;
      },
      getInAppUrl: (savedObject: SavedObject<RawRule>) => {
        return {
          path: `${triggersActionsRoute}${getRuleDetailsRoute(encodeURIComponent(savedObject.id))}`,
          uiCapabilitiesPath: 'management.insightsAndAlerting.triggersActions',
        };
      },
      onImport(ruleSavedObjects) {
        return {
          warnings: getImportWarnings(ruleSavedObjects),
        };
      },
      onExport(context: SavedObjectsExportTransformContext, objects: Array<SavedObject<RawRule>>) {
        return transformRulesForExport(objects);
      },
      isExportable(ruleSavedObject: SavedObject<RawRule>) {
        return isRuleExportable(ruleSavedObject, ruleTypeRegistry, logger);
      },
    },
    modelVersions: ruleModelVersions,
  });

  savedObjects.registerType({
    name: API_KEY_PENDING_INVALIDATION_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'agnostic',
    mappings: {
      properties: {
        apiKeyId: {
          type: 'keyword',
        },
        createdAt: {
          type: 'date',
        },
        uiamApiKey: {
          type: 'binary',
        },
      },
    },
    modelVersions: apiKeyPendingInvalidationModelVersions,
  });

  savedObjects.registerType({
    name: GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'single',
    mappings: {
      dynamic: false,
      properties: {
        name: { type: 'keyword' },
        enabled: { type: 'boolean' },
        // For searching by exact (type, consumer) pair
        ruleTypeConsumerPairs: { type: 'keyword' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    management: {
      importableAndExportable: false,
    },
    modelVersions: gapAutoFillSchedulerModelVersions,
  });

  savedObjects.registerType({
    name: RULES_SETTINGS_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'single',
    mappings: rulesSettingsMappings,
    modelVersions: rulesSettingsModelVersions,
  });

  savedObjects.registerType({
    name: AD_HOC_RUN_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'multiple-isolated',
    mappings: {
      dynamic: false,
      properties: {
        apiKeyId: {
          type: 'keyword',
        },
        createdAt: {
          type: 'date',
        },
        initiator: {
          type: 'keyword',
        },
        initiatorId: {
          type: 'keyword',
        },
        end: {
          type: 'date',
        },
        rule: {
          properties: {
            alertTypeId: {
              type: 'keyword',
            },
            consumer: {
              type: 'keyword',
            },
          },
        },
        start: {
          type: 'date',
        },
        // TODO to allow searching/filtering by status
        // status: {
        //   type: 'keyword'
        // }
      },
    },
    management: {
      importableAndExportable: false,
    },
    modelVersions: adHocRunParamsModelVersions,
  });

  savedObjects.registerType({
    name: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'multiple-isolated',
    management: {
      importableAndExportable: true,
      getTitle(ruleTemplateSavedObject: SavedObject<RawRuleTemplate>) {
        return `${ruleTemplateSavedObject.attributes.name}`;
      },
      getInAppUrl: (savedObject: SavedObject<RawRuleTemplate>) => {
        return {
          path: `${triggersActionsRoute}${createRuleFromTemplateRoute.replace(
            ':templateId',
            encodeURIComponent(savedObject.id)
          )}`,
          uiCapabilitiesPath: '',
        };
      },
    },
    mappings: ruleTemplateMappings,
    modelVersions: ruleTemplateModelVersions,
  });

  // Serverless only saved object used to track the status of UIAM API keys provisioning.
  savedObjects.registerType({
    name: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'agnostic',
    mappings: {
      properties: {
        '@timestamp': {
          type: 'date',
        },
        entityId: {
          type: 'keyword',
        },
        entityType: {
          type: 'keyword',
        },
        status: {
          type: 'keyword',
        },
        message: {
          type: 'text',
        },
        errorCode: {
          type: 'keyword',
        },
      },
    },
    modelVersions: uiamApiKeysProvisioningStatusModelVersions,
  });

  // Encrypted attributes
  encryptedSavedObjects.registerType({
    type: RULE_SAVED_OBJECT_TYPE,
    /**
     * We disable enforcing random SO IDs for the rule SO
     * to allow users creating rules with a predefined ID.
     */
    enforceRandomId: false,
    attributesToEncrypt: new Set(RuleAttributesToEncrypt),
    attributesToIncludeInAAD: new Set(RuleAttributesIncludedInAAD),
  });

  // Encrypted attributes
  encryptedSavedObjects.registerType({
    type: API_KEY_PENDING_INVALIDATION_TYPE,
    attributesToEncrypt: new Set(['apiKeyId', 'uiamApiKey']),
    attributesToIncludeInAAD: new Set(['createdAt']),
  });

  // Encrypted attributes
  encryptedSavedObjects.registerType({
    type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(AdHocRunAttributesToEncrypt),
    attributesToIncludeInAAD: new Set(AdHocRunAttributesIncludedInAAD),
  });
}
