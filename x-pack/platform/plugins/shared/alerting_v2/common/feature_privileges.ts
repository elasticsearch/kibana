/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  FeatureKibanaPrivileges,
  SubFeatureConfig,
  SubFeaturePrivilegeConfig,
} from '@kbn/features-plugin/common';
import { ACTION_POLICY_SAVED_OBJECT_TYPE, RULE_SAVED_OBJECT_TYPE } from './saved_object_types';

type ValueOf<T> = T[keyof T];
type NestedValueOf<T extends Record<string, Record<string, string>>> = ValueOf<{
  [K in keyof T]: ValueOf<T[K]>;
}>;

/**
 * Single source of truth for alerting_v2 feature ids, API privilege strings,
 * UI capability keys, and future sub-feature definitions.
 *
 * Add all new alerting_v2 privilege strings here and derive from this file.
 */
export const ALERTING_V2_API_PRIVILEGES = {
  rules: {
    read: 'read-alerting-v2-rules',
    write: 'write-alerting-v2-rules',
  },
  alerts: {
    read: 'read-alerting-v2-alerts',
    write: 'write-alerting-v2-alerts',
  },
  actionPolicies: {
    read: 'read-alerting-v2-action-policies',
    write: 'write-alerting-v2-action-policies',
  },
  executionHistory: {
    read: 'read-alerting-v2-execution-history',
  },
} as const;

/**
 * Top-level UI capability keys per feature. Each feature owns its own
 * `all` / `read` capability strings. Granted entries surface at runtime as
 * `capabilities[featureId][capabilityKey]`. Extend per-feature when a feature
 * needs additional top-level UI flags beyond the primary read/write split.
 */
export const ALERTING_V2_UI_CAPABILITIES = {
  rules: {
    all: 'all',
    read: 'read',
  },
  alerts: {
    all: 'all',
    read: 'read',
  },
  actionPolicies: {
    all: 'all',
    read: 'read',
  },
  executionHistory: {
    all: 'all',
    read: 'read',
  },
} as const;

/**
 * Sub-feature-only UI capability keys per feature. Add new sub-feature UI
 * capabilities here (e.g. `alerts: { assignAlert: 'assignAlert' }`) so the
 * sub-feature privilege schema stays type-checked against the catalog.
 */
export const ALERTING_V2_SUB_FEATURE_UI_CAPABILITIES = {
  rules: {},
  alerts: {},
  actionPolicies: {},
  executionHistory: {},
} as const satisfies Record<string, Record<string, string>>;

type AlertingV2ApiPrivilege = NestedValueOf<typeof ALERTING_V2_API_PRIVILEGES>;
type AlertingV2TopLevelUICapability = NestedValueOf<typeof ALERTING_V2_UI_CAPABILITIES>;
type AlertingV2SubFeatureUICapability = NestedValueOf<
  typeof ALERTING_V2_SUB_FEATURE_UI_CAPABILITIES
>;
type AlertingV2UICapability = AlertingV2TopLevelUICapability | AlertingV2SubFeatureUICapability;

type AlertingV2FeaturePrivilege = Pick<
  FeatureKibanaPrivileges,
  'api' | 'ui' | 'savedObject' | 'alerts'
> & {
  readonly api: readonly AlertingV2ApiPrivilege[];
  readonly ui: readonly AlertingV2TopLevelUICapability[];
  readonly savedObject: {
    readonly all: readonly string[];
    readonly read: readonly string[];
  };
};

type AlertingV2SubFeaturePrivilege = Omit<
  SubFeaturePrivilegeConfig,
  'api' | 'ui' | 'savedObject'
> & {
  readonly api: readonly AlertingV2ApiPrivilege[];
  readonly ui: readonly AlertingV2UICapability[];
  readonly savedObject: {
    readonly all: readonly string[];
    readonly read: readonly string[];
  };
};

type AlertingV2SubFeature = Omit<SubFeatureConfig, 'privilegeGroups'> & {
  readonly privilegeGroups: ReadonlyArray<{
    readonly groupType: 'independent' | 'mutually_exclusive';
    readonly privileges: readonly AlertingV2SubFeaturePrivilege[];
  }>;
};

export interface AlertingV2FeatureDefinition {
  readonly id: string;
  readonly name: string;
  readonly privileges: {
    readonly all: AlertingV2FeaturePrivilege;
    readonly read: AlertingV2FeaturePrivilege;
  };
  readonly subFeatures: readonly AlertingV2SubFeature[];
}

export const ALERTING_V2_FEATURES = {
  rules: {
    id: 'alerting_v2_rules',
    name: 'Rules',
    privileges: {
      all: {
        api: [ALERTING_V2_API_PRIVILEGES.rules.read, ALERTING_V2_API_PRIVILEGES.rules.write],
        ui: [ALERTING_V2_UI_CAPABILITIES.rules.all, ALERTING_V2_UI_CAPABILITIES.rules.read],
        savedObject: {
          all: [RULE_SAVED_OBJECT_TYPE],
          read: [],
        },
      },
      read: {
        api: [ALERTING_V2_API_PRIVILEGES.rules.read],
        ui: [ALERTING_V2_UI_CAPABILITIES.rules.read],
        savedObject: {
          all: [],
          read: [RULE_SAVED_OBJECT_TYPE],
        },
      },
    },
    subFeatures: [] as const,
  },
  alerts: {
    id: 'alerting_v2_alerts',
    name: 'Alerts',
    privileges: {
      all: {
        alerts: { read: true },
        api: [ALERTING_V2_API_PRIVILEGES.alerts.read, ALERTING_V2_API_PRIVILEGES.alerts.write],
        ui: [ALERTING_V2_UI_CAPABILITIES.alerts.all, ALERTING_V2_UI_CAPABILITIES.alerts.read],
        savedObject: {
          all: [],
          read: [],
        },
      },
      read: {
        alerts: { read: true },
        api: [ALERTING_V2_API_PRIVILEGES.alerts.read],
        ui: [ALERTING_V2_UI_CAPABILITIES.alerts.read],
        savedObject: {
          all: [],
          read: [],
        },
      },
    },
    subFeatures: [] as const,
  },
  actionPolicies: {
    id: 'alerting_v2_action_policies',
    name: 'Action Policies',
    privileges: {
      all: {
        api: [
          ALERTING_V2_API_PRIVILEGES.actionPolicies.read,
          ALERTING_V2_API_PRIVILEGES.actionPolicies.write,
        ],
        ui: [
          ALERTING_V2_UI_CAPABILITIES.actionPolicies.all,
          ALERTING_V2_UI_CAPABILITIES.actionPolicies.read,
        ],
        savedObject: {
          all: [ACTION_POLICY_SAVED_OBJECT_TYPE],
          read: [],
        },
      },
      read: {
        api: [ALERTING_V2_API_PRIVILEGES.actionPolicies.read],
        ui: [ALERTING_V2_UI_CAPABILITIES.actionPolicies.read],
        savedObject: {
          all: [],
          read: [ACTION_POLICY_SAVED_OBJECT_TYPE],
        },
      },
    },
    subFeatures: [] as const,
  },
  executionHistory: {
    id: 'alerting_v2_execution_history',
    name: 'Execution history',
    privileges: {
      all: {
        api: [ALERTING_V2_API_PRIVILEGES.executionHistory.read],
        ui: [
          ALERTING_V2_UI_CAPABILITIES.executionHistory.all,
          ALERTING_V2_UI_CAPABILITIES.executionHistory.read,
        ],
        savedObject: {
          all: [],
          read: [],
        },
      },
      read: {
        api: [ALERTING_V2_API_PRIVILEGES.executionHistory.read],
        ui: [ALERTING_V2_UI_CAPABILITIES.executionHistory.read],
        savedObject: { all: [], read: [] },
      },
    },
    subFeatures: [] as const,
  },
} as const satisfies Record<string, AlertingV2FeatureDefinition>;

export type AlertingV2Feature = keyof typeof ALERTING_V2_FEATURES;

type TopLevelUiOf<F extends AlertingV2Feature> =
  | (typeof ALERTING_V2_FEATURES)[F]['privileges']['all']['ui'][number]
  | (typeof ALERTING_V2_FEATURES)[F]['privileges']['read']['ui'][number];

type SubFeatureUiOf<F extends AlertingV2Feature> =
  (typeof ALERTING_V2_FEATURES)[F]['subFeatures'][number]['privilegeGroups'][number]['privileges'][number]['ui'][number];

export type AlertingV2UICapabilityFor<F extends AlertingV2Feature> =
  | TopLevelUiOf<F>
  | SubFeatureUiOf<F>;
