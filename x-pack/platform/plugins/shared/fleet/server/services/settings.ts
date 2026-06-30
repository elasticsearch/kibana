/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type {
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectsUpdateOptions,
} from '@kbn/core/server';
import { omit } from 'lodash';

import { GLOBAL_SETTINGS_SAVED_OBJECT_TYPE, GLOBAL_SETTINGS_ID } from '../../common/constants';
import type { Settings, BaseSettings } from '../../common/types';
import type { SettingsSOAttributes } from '../types';

import { DeleteUnenrolledAgentsPreconfiguredError } from '../errors';

import { appContextService } from './app_context';
import { auditLoggingService } from './audit_logging';

function mapSettingsSO(settingsSo: SavedObject<SettingsSOAttributes>): Settings {
  return {
    id: settingsSo.id,
    version: settingsSo.version,
    secret_storage_requirements_met: settingsSo.attributes.secret_storage_requirements_met,
    output_secret_storage_requirements_met:
      settingsSo.attributes.output_secret_storage_requirements_met,
    action_secret_storage_requirements_met:
      settingsSo.attributes.action_secret_storage_requirements_met,
    ssl_secret_storage_requirements_met: settingsSo.attributes.ssl_secret_storage_requirements_met,
    download_source_auth_secret_storage_requirements_met:
      settingsSo.attributes.download_source_auth_secret_storage_requirements_met,
    has_seen_add_data_notice: settingsSo.attributes.has_seen_add_data_notice,
    prerelease_integrations_enabled: settingsSo.attributes.prerelease_integrations_enabled,
    use_space_awareness_migration_status:
      settingsSo.attributes.use_space_awareness_migration_status ?? undefined,
    use_space_awareness_migration_started_at:
      settingsSo.attributes.use_space_awareness_migration_started_at ?? undefined,
    preconfigured_fields: getConfigFleetServerHosts() ? ['fleet_server_hosts'] : [],
    delete_unenrolled_agents: settingsSo.attributes.delete_unenrolled_agents,
    ilm_migration_status: settingsSo.attributes.ilm_migration_status,
    integration_knowledge_enabled: settingsSo.attributes.integration_knowledge_enabled,
  };
}

export async function getSettings(soClient: SavedObjectsClientContract): Promise<Settings> {
  const res = await soClient.find<SettingsSOAttributes>({
    type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
  });
  auditLoggingService.writeCustomSoAuditLog({
    action: 'get',
    id: GLOBAL_SETTINGS_ID,
    savedObjectType: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
  });

  if (res.total === 0) {
    throw Boom.notFound('Global settings not found');
  }
  return mapSettingsSO(res.saved_objects[0]);
}

export async function getSettingsOrUndefined(
  soClient: SavedObjectsClientContract
): Promise<Settings | undefined> {
  try {
    return await getSettings(soClient);
  } catch (e) {
    if (e.isBoom && e.output.statusCode === 404) {
      return undefined;
    }

    throw e;
  }
}

export async function settingsSetup(soClient: SavedObjectsClientContract) {
  try {
    const config = appContextService.getConfig();
    const settings = await getSettings(soClient);

    const updatedSettings = {} as Partial<Settings>;
    if (config?.prereleaseEnabledByDefault && !settings.prerelease_integrations_enabled) {
      updatedSettings.prerelease_integrations_enabled = config?.prereleaseEnabledByDefault;
    }
    if (
      (config?.installIntegrationsKnowledge ??
        config?.experimentalFeatures?.integrationKnowledge ??
        appContextService.getExperimentalFeatures().installIntegrationsKnowledge) &&
      settings.integration_knowledge_enabled === undefined
    ) {
      updatedSettings.integration_knowledge_enabled = true;
    }
    if (Object.keys(updatedSettings).length > 0) {
      await saveSettings(soClient, updatedSettings);
    }
  } catch (e) {
    if (e.isBoom && e.output.statusCode === 404) {
      const defaultSettings = createDefaultSettings();
      return saveSettings(soClient, defaultSettings);
    }

    throw e;
  }
}

export async function saveSettings(
  soClient: SavedObjectsClientContract,
  newData: Partial<Omit<Settings, 'id'>>,
  options?: SavedObjectsUpdateOptions<SettingsSOAttributes> & {
    createWithOverwrite?: boolean;
    fromSetup?: boolean;
  }
): Promise<Partial<Settings> & Pick<Settings, 'id'>> {
  const data = omit({ ...newData }, 'fleet_server_hosts');

  const { createWithOverwrite, ...updateOptions } = options ?? {};

  try {
    const settings = await getSettings(soClient);

    if (
      !options?.fromSetup &&
      settings.delete_unenrolled_agents?.is_preconfigured &&
      data.delete_unenrolled_agents
    ) {
      throw new DeleteUnenrolledAgentsPreconfiguredError(
        `Setting delete_unenrolled_agents is preconfigured as 'enableDeleteUnenrolledAgents' and cannot be updated outside of kibana config file.`
      );
    }

    auditLoggingService.writeCustomSoAuditLog({
      action: 'update',
      id: settings.id,
      savedObjectType: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
    });

    const res = await soClient.update<SettingsSOAttributes>(
      GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
      settings.id,
      data,
      updateOptions
    );

    return {
      id: settings.id,
      ...res.attributes,
    };
  } catch (e) {
    if (e.isBoom && e.output.statusCode === 404) {
      const defaultSettings = createDefaultSettings();

      auditLoggingService.writeCustomSoAuditLog({
        action: 'create',
        id: GLOBAL_SETTINGS_ID,
        savedObjectType: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
      });

      const res = await soClient.create<SettingsSOAttributes>(
        GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
        {
          ...defaultSettings,
          ...data,
        },
        {
          id: GLOBAL_SETTINGS_ID,
          // Do not overwrite if version is passed
          overwrite: typeof createWithOverwrite === 'undefined' ? true : createWithOverwrite,
        }
      );

      return {
        id: res.id,
        ...res.attributes,
      };
    }

    throw e;
  }
}

function getConfigFleetServerHosts() {
  const config = appContextService.getConfig();
  return config?.agents?.fleet_server?.hosts && config.agents.fleet_server.hosts.length > 0
    ? config?.agents?.fleet_server?.hosts
    : undefined;
}

export function createDefaultSettings(): BaseSettings {
  const config = appContextService.getConfig();
  const settings: BaseSettings = {
    prerelease_integrations_enabled: !!config?.prereleaseEnabledByDefault,
  };

  if (appContextService.getExperimentalFeatures().useSpaceAwareness) {
    settings.use_space_awareness_migration_status = 'success';
  }

  if (
    config?.experimentalFeatures?.integrationKnowledge ??
    appContextService.getExperimentalFeatures().installIntegrationsKnowledge
  ) {
    settings.integration_knowledge_enabled = true;
  }

  return settings;
}
