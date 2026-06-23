/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Logger, SavedObjectsType } from '@kbn/core/server';

import { promptType } from '@kbn/security-ai-prompts';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import { exceptionListType } from '@kbn/lists-plugin/server/saved_objects';
import { scriptsLibrarySavedObjectType } from './endpoint/lib/scripts_library';
import type { ExperimentalFeatures } from '../common';
import { trialCompanionNBASavedObjectType } from './lib/trial_companion/saved_objects';
import { referenceDataSavedObjectType } from './endpoint/lib/reference_data';
import { protectionUpdatesNoteType } from './endpoint/lib/protection_updates_note/saved_object_mappings';
import { noteType, pinnedEventType, timelineType } from './lib/timeline/saved_object_mappings';
// eslint-disable-next-line no-restricted-imports
import { legacyType as legacyRuleActionsType } from './lib/detection_engine/rule_actions_legacy';
import { prebuiltRuleAssetType } from './lib/detection_engine/prebuilt_rules';
import { type as signalsMigrationType } from './lib/detection_engine/migrations/saved_objects';
import { manifestType, unifiedManifestType } from './endpoint/lib/artifacts/saved_object_mappings';
import { riskEngineConfigurationType } from './lib/entity_analytics/risk_engine/saved_object';
import { entityEngineDescriptorType } from './lib/entity_analytics/entity_store/saved_object';
import {
  privilegeMonitoringType,
  monitoringEntitySourceType,
} from './lib/entity_analytics/privilege_monitoring/saved_objects';
import { watchlistConfigType } from './lib/entity_analytics/watchlists/management/saved_object/watchlist_config_type';
import {
  watchlistEntitySourceType,
  WatchlistEntitySourceApiKeyEncryptionParams,
} from './lib/entity_analytics/watchlists/entity_sources/infra';
import { leadGenerationConfigType } from './lib/entity_analytics/lead_generation/saved_object';
import {
  PrivilegeMonitoringApiKeyEncryptionParams,
  PrivilegeMonitoringApiKeyType,
} from './lib/entity_analytics/privilege_monitoring/auth/saved_object';

// Conditional Saved Object Types
// Saved object types that will only be registered if the associated feature flag is enabled
const typesTiedToFeatureFlags: Array<{
  feature: keyof ExperimentalFeatures;
  soType: SavedObjectsType;
}> = [{ feature: 'responseActionsScriptLibraryManagement', soType: scriptsLibrarySavedObjectType }];

const types = [
  noteType,
  pinnedEventType,
  legacyRuleActionsType,
  prebuiltRuleAssetType,
  timelineType,
  manifestType,
  unifiedManifestType,
  signalsMigrationType,
  riskEngineConfigurationType,
  entityEngineDescriptorType,
  privilegeMonitoringType,
  watchlistConfigType,
  PrivilegeMonitoringApiKeyType,
  monitoringEntitySourceType,
  watchlistEntitySourceType,
  leadGenerationConfigType,
  protectionUpdatesNoteType,
  promptType,
  referenceDataSavedObjectType,
  trialCompanionNBASavedObjectType,
];

export const savedObjectTypes = types.map((type) => type.name);

export const timelineSavedObjectTypes = [timelineType.name, pinnedEventType.name];

export const notesSavedObjectTypes = [noteType.name];
export const exceptionsSavedObjectTypes = [exceptionListType.name];

export const initSavedObjects = (
  savedObjects: CoreSetup['savedObjects'],
  experimentalFeatures: ExperimentalFeatures,
  logger: Logger
) => {
  types.forEach((type) => {
    logger.debug(`Registering SavedObject type [${type.name}]`);
    savedObjects.registerType(type);
  });

  typesTiedToFeatureFlags.forEach(({ feature, soType }) => {
    if (!experimentalFeatures[feature]) {
      logger.debug(
        `Skipping the registration of SavedObject type [${soType.name}] - feature flag not enabled`
      );
      return;
    }

    logger.debug(`Registering SavedObject type [${soType.name}]`);
    savedObjects.registerType(soType);
  });
};

export const initEncryptedSavedObjects = ({
  encryptedSavedObjects,
  logger,
}: {
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup | undefined;
  logger: Logger;
}) => {
  if (!encryptedSavedObjects) {
    logger.warn('EncryptedSavedObjects plugin not available; skipping registration.');
    return;
  }
  encryptedSavedObjects.registerType(PrivilegeMonitoringApiKeyEncryptionParams);
  encryptedSavedObjects.registerType(WatchlistEntitySourceApiKeyEncryptionParams);
};
