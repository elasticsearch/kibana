/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import type {
  SubFeaturePrivilegeGroupConfig,
  SubFeaturePrivilegeGroupType,
} from '@kbn/features-plugin/common';
import { SYNTHETICS_ALERTING_FEATURES } from '@kbn/rule-data-utils';
import {
  legacyPrivateLocationsSavedObjectName,
  privateLocationSavedObjectName,
} from '../common/saved_objects/private_locations';
import {
  legacySyntheticsMonitorTypeSingle,
  syntheticsMonitorSavedObjectType,
  syntheticsParamType,
} from '../common/types/saved_objects';

import { PLUGIN } from '../common/constants/plugin';
import {
  syntheticsSettingsObjectType,
  uptimeSettingsObjectType,
} from './saved_objects/synthetics_settings';
import { syntheticsApiKeyObjectType } from './saved_objects/service_api_key';

export const PRIVATE_LOCATION_WRITE_API = 'private-location-write';
export const MONITOR_RUN_MANUALLY_API = 'monitor-run-manually';
export const WRITE_SYNTHETICS_DEFAULT_RULES_API = 'write_synthetics_default_rules';

const alertingFeatures = SYNTHETICS_ALERTING_FEATURES;

const canRunTestManuallyPrivilege: SubFeaturePrivilegeGroupConfig = {
  groupType: 'independent' as SubFeaturePrivilegeGroupType,
  privileges: [
    {
      id: 'can_run_test_manually',
      name: i18n.translate('xpack.synthetics.features.canRunTestManually', {
        defaultMessage: 'Can run tests manually',
      }),
      // `includeIn: 'none'` — never granted implicitly. The run-test route accepts
      // EITHER `uptime-write` (which base `all` already has, so existing roles keep
      // working) OR this `monitor-run-manually` privilege, which lets an admin grant manual
      // test runs to an otherwise read-only role without granting write access.
      includeIn: 'none',
      api: [MONITOR_RUN_MANUALLY_API],
      savedObject: {
        all: [],
        read: [],
      },
      ui: ['canRunTestManually'],
    },
  ],
};

const elasticManagedLocationsEnabledPrivilege: SubFeaturePrivilegeGroupConfig = {
  groupType: 'independent' as SubFeaturePrivilegeGroupType,
  privileges: [
    {
      id: 'elastic_managed_locations_enabled',
      name: i18n.translate('xpack.synthetics.features.elasticManagedLocations.label', {
        defaultMessage: 'Enabled',
      }),
      includeIn: 'all',
      savedObject: {
        all: [],
        read: [],
      },
      ui: ['elasticManagedLocationsEnabled'],
    },
  ],
};

const canManagePrivateLocationsPrivilege: SubFeaturePrivilegeGroupConfig = {
  groupType: 'independent' as SubFeaturePrivilegeGroupType,
  privileges: [
    {
      id: 'can_manage_private_locations',
      name: i18n.translate('xpack.synthetics.features.canManagePrivateLocations', {
        defaultMessage: 'Can manage',
      }),
      includeIn: 'all',
      api: [PRIVATE_LOCATION_WRITE_API],
      savedObject: {
        all: [privateLocationSavedObjectName, legacyPrivateLocationsSavedObjectName],
        read: [],
      },
      ui: ['canManagePrivateLocations'],
    },
  ],
};

const canReadParamsPrivilege: SubFeaturePrivilegeGroupConfig = {
  groupType: 'independent',
  privileges: [
    {
      id: 'can_read_param_values',
      name: i18n.translate('xpack.synthetics.features.canReadParams.label', {
        defaultMessage: 'Can read global parameter values',
      }),
      includeIn: 'none', // This ensures it is not granted by default
      savedObject: {
        all: [],
        read: [],
      },
      ui: ['canReadParamValues'],
      /* Field level access is enforced for the VALUE of the param.
       * The api is still accessible for SO operations to users without this privilege */
      api: [],
    },
  ],
};

const canManageRulesPrivilege: SubFeaturePrivilegeGroupConfig = {
  groupType: 'independent',
  privileges: [
    {
      id: 'can_manage_rules',
      name: i18n.translate('xpack.synthetics.features.canManageRules.label', {
        defaultMessage: 'Can manage rules',
      }),
      // `includeIn: 'none'` — never granted implicitly. Default-alerting write
      // routes accept EITHER `uptime-write` (which base `all` already has, so
      // existing roles keep working) OR this `write_synthetics_default_rules`
      // privilege. Alerting grants match base `all` so a read-only role can
      // create, update, delete, enable, run, and backfill Synthetics/Uptime
      // rules without monitor, settings, parameter, or private-location writes.
      includeIn: 'none',
      api: [WRITE_SYNTHETICS_DEFAULT_RULES_API],
      savedObject: {
        all: [],
        read: [],
      },
      alerting: {
        rule: {
          all: alertingFeatures,
          enable: alertingFeatures,
          manual_run: alertingFeatures,
          manage_rule_settings: alertingFeatures,
        },
      },
      ui: ['canManageRules'],
    },
  ],
};

export const syntheticsFeature = {
  id: PLUGIN.ID,
  name: PLUGIN.NAME,
  order: 1000,
  category: DEFAULT_APP_CATEGORIES.observability,
  app: ['uptime', 'kibana', 'synthetics'],
  catalogue: ['uptime'],
  management: {
    insightsAndAlerting: ['triggersActionsRules', 'triggersActionsAlerts'],
  },
  alerting: alertingFeatures,
  privileges: {
    all: {
      app: ['uptime', 'kibana', 'synthetics'],
      catalogue: ['uptime'],
      api: ['uptime-read', 'uptime-write', 'lists-all', 'rac'],
      savedObject: {
        all: [
          syntheticsSettingsObjectType,
          legacySyntheticsMonitorTypeSingle,
          syntheticsMonitorSavedObjectType,
          syntheticsApiKeyObjectType,
          syntheticsParamType,

          // uptime settings object is also registered here since feature is shared between synthetics and uptime
          uptimeSettingsObjectType,
        ],
        read: [privateLocationSavedObjectName, legacyPrivateLocationsSavedObjectName],
      },
      alerting: {
        rule: {
          all: alertingFeatures,
          enable: alertingFeatures,
          manual_run: alertingFeatures,
          manage_rule_settings: alertingFeatures,
        },
        alert: {
          all: alertingFeatures,
        },
      },
      management: {
        insightsAndAlerting: ['triggersActionsRules', 'triggersActionsAlerts'],
      },
      ui: ['save', 'configureSettings', 'show', 'alerting:save'],
    },
    read: {
      app: ['uptime', 'kibana', 'synthetics'],
      catalogue: ['uptime'],
      api: ['uptime-read', 'lists-read', 'rac'],
      savedObject: {
        all: [],
        read: [
          syntheticsParamType,
          syntheticsSettingsObjectType,
          syntheticsMonitorSavedObjectType,
          legacySyntheticsMonitorTypeSingle,
          syntheticsApiKeyObjectType,
          privateLocationSavedObjectName,
          legacyPrivateLocationsSavedObjectName,
          // uptime settings object is also registered here since feature is shared between synthetics and uptime
          uptimeSettingsObjectType,
        ],
      },
      alerting: {
        rule: {
          read: alertingFeatures,
        },
        alert: {
          read: alertingFeatures,
        },
      },
      management: {
        insightsAndAlerting: ['triggersActionsRules', 'triggersActionsAlerts'],
      },
      ui: ['show', 'alerting:save'],
    },
  },
  subFeatures: [
    {
      name: i18n.translate('xpack.synthetics.features.app.runTest', {
        defaultMessage: 'Run tests manually',
      }),
      description: i18n.translate('xpack.synthetics.features.app.runTest.description', {
        defaultMessage:
          'This feature allows a read-only user to trigger manual test runs of existing monitors, without granting the ability to create, edit, or delete monitors.',
      }),
      privilegeGroups: [canRunTestManuallyPrivilege],
    },
    {
      name: i18n.translate('xpack.synthetics.features.app.elastic', {
        defaultMessage: 'Elastic managed locations',
      }),
      description: i18n.translate('xpack.synthetics.features.app.elasticDescription', {
        defaultMessage:
          'This feature enables users to create monitors that execute tests from Elastic managed infrastructure around the globe. There is an additional charge to use Elastic Managed testing locations. See the Elastic Cloud Pricing https://www.elastic.co/pricing page for current prices.',
      }),
      privilegeGroups: [elasticManagedLocationsEnabledPrivilege],
    },
    {
      name: i18n.translate('xpack.synthetics.features.app.private', {
        defaultMessage: 'Private locations',
      }),
      description: i18n.translate('xpack.synthetics.features.app.private,description', {
        defaultMessage:
          'This feature allows you to manage your private locations, for example adding, or deleting them.',
      }),
      privilegeGroups: [canManagePrivateLocationsPrivilege],
    },
    {
      name: i18n.translate('xpack.synthetics.features.app.params', {
        defaultMessage: 'Global Parameters',
      }),
      description: i18n.translate('xpack.synthetics.features.app.params.description', {
        defaultMessage: 'This feature allows you to read global parameters values',
      }),
      privilegeGroups: [canReadParamsPrivilege],
    },
    {
      name: i18n.translate('xpack.synthetics.features.app.rules', {
        defaultMessage: 'Alert rules',
      }),
      description: i18n.translate('xpack.synthetics.features.app.rules.description', {
        defaultMessage:
          'Create, update, delete, enable, disable, run, and backfill Synthetics and Uptime alert rules, including the default status and TLS rules. This does not grant permission to create or edit monitors.',
      }),
      privilegeGroups: [canManageRulesPrivilege],
    },
  ],
};
