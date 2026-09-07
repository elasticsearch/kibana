/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  READ_FLAPPING_SETTINGS_SUB_FEATURE_ID,
  ALL_FLAPPING_SETTINGS_SUB_FEATURE_ID,
} from '@kbn/alerting-plugin/common';
import { ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import type { Space, User } from '../common/types';

const NoKibanaPrivileges: User = {
  username: 'no_kibana_privileges',
  fullName: 'no_kibana_privileges',
  password: 'no_kibana_privileges-password',
  role: {
    name: 'no_kibana_privileges',
    elasticsearch: {
      indices: [
        {
          names: ['foo'],
          privileges: ['all'],
        },
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const Superuser: User = {
  username: 'superuser',
  fullName: 'superuser',
  password: 'superuser-password',
  role: {
    name: 'superuser',
  },
};

export const GlobalRead: User = {
  username: 'global_read',
  fullName: 'global_read',
  password: 'global_read-password',
  role: {
    name: 'global_read_role',
    kibana: [
      {
        feature: {
          actions: ['read'],
          alertsFixture: ['read'],
          alertsRestrictedFixture: ['read'],
          actionsSimulators: ['read'],
          rulesSettings: ['read', READ_FLAPPING_SETTINGS_SUB_FEATURE_ID],
          maintenanceWindow: ['read'],
          siem: ['read'],
          stackAlerts: ['read'],
        },
        spaces: ['*'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

// Global read plus the security rules "exceptions" sub-feature edit privilege.
// This is the user the read-auth params edit exists for: read access to rules
// combined with the ability to edit a rule's exception lists.
export const RulesReadExceptionsAll: User = {
  username: 'rules_read_exceptions_all',
  fullName: 'rules_read_exceptions_all',
  password: 'rules_read_exceptions_all-password',
  role: {
    name: 'rules_read_exceptions_all_role',
    kibana: [
      {
        feature: {
          actions: ['read'],
          alertsFixture: ['read'],
          alertsRestrictedFixture: ['read'],
          actionsSimulators: ['read'],
          rulesSettings: ['read', READ_FLAPPING_SETTINGS_SUB_FEATURE_ID],
          maintenanceWindow: ['read'],
          siem: ['read'],
          stackAlerts: ['read'],
          securitySolutionRulesV4: ['read', 'security_solution_exceptions_all'],
        },
        spaces: ['*'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

const Space1All: User = {
  username: 'space_1_all',
  fullName: 'space_1_all',
  password: 'space_1_all-password',
  role: {
    name: 'space_1_all_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['all'],
          actionsSimulators: ['all'],
          rulesSettings: ['all', ALL_FLAPPING_SETTINGS_SUB_FEATURE_ID],
          maintenanceWindow: ['all'],
          siem: ['all'],
          stackAlerts: ['all'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

const Space1AllAlertingNoneActions: User = {
  username: 'space_1_all_alerts_none_actions',
  fullName: 'space_1_all_alerts_none_actions',
  password: 'space_1_all_alerts_none_actions-password',
  role: {
    name: 'space_1_all_alerts_none_actions_role',
    kibana: [
      {
        feature: {
          alertsFixture: ['all'],
          actionsSimulators: ['all'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

const Space1AllWithRestrictedFixture: User = {
  username: 'space_1_all_with_restricted_fixture',
  fullName: 'space_1_all_with_restricted_fixture',
  password: 'space_1_all_with_restricted_fixture-password',
  role: {
    name: 'space_1_all_with_restricted_fixture_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['all'],
          alertsRestrictedFixture: ['all'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

/**
 * This user is needed to test system actions.
 * In x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/action_types.ts
 * we registered a system action type which requires access to Cases. This user has
 * access to Cases only in the Stack Management. The tests use this user to
 * execute the system action and verify that the authorization is performed
 * as expected
 */
const CasesAll: User = {
  username: 'cases_all',
  fullName: 'cases_all',
  password: 'cases_all',
  role: {
    name: 'cases_all_role',
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
    kibana: [
      {
        feature: {
          generalCases: ['all'],
          actions: ['all'],
          alertsFixture: ['all'],
          alertsRestrictedFixture: ['all'],
        },
        spaces: ['*'],
      },
    ],
  },
};

export const StackAlertsOnly: User = {
  username: 'stack_alerts_only',
  fullName: 'stack_alerts_only',
  password: 'stack_alerts_only-password',
  role: {
    name: 'stack_alerts_only_role',
    kibana: [
      {
        feature: {
          stackAlerts: ['all'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

/**
 * Alerts-only user: the `stackAlertsOnly` feature grants alert read/write but
 * no rule read/create. Used to verify that alert views still receive a rule type
 * list (via the alert authorization entity), unlike `StackAlertsOnly` above which
 * uses the `stackAlerts` (rule management) feature.
 */
export const StackAlertsOnlyFeatureReadUser: User = {
  username: 'stack_alerts_only_feature_read',
  fullName: 'stack_alerts_only_feature_read',
  password: 'stack_alerts_only_feature_read-password',
  role: {
    name: 'stack_alerts_only_feature_read_role',
    kibana: [
      {
        feature: {
          stackAlertsOnly: ['read'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const ManualRunOnlyUser: User = {
  username: 'manual_run_only',
  fullName: 'manual_run_only',
  password: 'manual_run_only-password',
  role: {
    name: 'manual_run_only_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['read', 'manual_run'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const EnableDisableOnlyUser: User = {
  username: 'enable_disable_only',
  fullName: 'enable_disable_only',
  password: 'enable_disable_only-password',
  role: {
    name: 'enable_disable_only_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['enable_disable', 'read'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const ManageRuleSettingsOnlyUser: User = {
  username: 'manage_rule_settings_only',
  fullName: 'manage_rule_settings_only',
  password: 'manage_rule_settings_only-password',
  role: {
    name: 'manage_rule_settings_only_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['read', 'manage_rule_settings'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const AllWithoutBackfillPrivilegesUser: User = {
  username: 'all_without_backfill_privileges',
  fullName: 'all_without_backfill_privileges',
  password: 'all_without_backfill_privileges-password',
  role: {
    name: 'all_without_backfill_privileges_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['minimal_all', 'enable_disable'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const AllWithoutManageRuleSettingsUser: User = {
  username: 'all_without_manage_rule_settings',
  fullName: 'all_without_manage_rule_settings',
  password: 'all_without_manage_rule_settings-password',
  role: {
    name: 'all_without_manage_rule_settings_role',
    kibana: [
      {
        feature: {
          actions: ['all'],
          alertsFixture: ['minimal_all', 'enable_disable', 'manual_run'],
        },
        spaces: ['space1'],
      },
    ],
    elasticsearch: {
      indices: [
        {
          names: [`${ES_TEST_INDEX_NAME}*`],
          privileges: ['all'],
        },
      ],
    },
  },
};

export const Users: User[] = [
  NoKibanaPrivileges,
  Superuser,
  GlobalRead,
  RulesReadExceptionsAll,
  Space1All,
  Space1AllWithRestrictedFixture,
  Space1AllAlertingNoneActions,
  CasesAll,
  StackAlertsOnly,
  StackAlertsOnlyFeatureReadUser,
  ManualRunOnlyUser,
  EnableDisableOnlyUser,
  ManageRuleSettingsOnlyUser,
  AllWithoutBackfillPrivilegesUser,
  AllWithoutManageRuleSettingsUser,
];

export const Space1: Space = {
  id: 'space1',
  name: 'Space 1',
  disabledFeatures: [],
};

export const Space2: Space = {
  id: 'space2',
  name: 'Space 2',
  disabledFeatures: [],
};

const OtherSpace: Space = {
  id: 'other',
  name: 'Other',
  disabledFeatures: [],
};

export const DefaultSpace: Space = {
  id: 'default',
  name: 'Default Space',
  disabledFeatures: [],
};

export const Spaces: Space[] = [Space1, Space2, OtherSpace];

// For all scenarios, we define both an instance in addition
// to a "type" definition so that we can use the exhaustive switch in
// typescript to ensure all scenarios are handled.

export interface Scenario {
  user: User;
  space: Space;
}

interface NoKibanaPrivilegesAtSpace1 extends Scenario {
  id: 'no_kibana_privileges at space1';
}
export const NoKibanaPrivilegesAtSpace1: NoKibanaPrivilegesAtSpace1 = {
  id: 'no_kibana_privileges at space1',
  user: NoKibanaPrivileges,
  space: Space1,
};

interface SuperuserAtSpace1 extends Scenario {
  id: 'superuser at space1';
}
export const SuperuserAtSpace1: SuperuserAtSpace1 = {
  id: 'superuser at space1',
  user: Superuser,
  space: Space1,
};

interface GlobalReadAtSpace1 extends Scenario {
  id: 'global_read at space1';
}

export const GlobalReadAtSpace1: GlobalReadAtSpace1 = {
  id: 'global_read at space1',
  user: GlobalRead,
  space: Space1,
};

interface Space1AllAtSpace1 extends Scenario {
  id: 'space_1_all at space1';
}

interface Space1AllWithRestrictedFixtureAtSpace1 extends Scenario {
  id: 'space_1_all_with_restricted_fixture at space1';
}
const Space1AllWithRestrictedFixtureAtSpace1: Space1AllWithRestrictedFixtureAtSpace1 = {
  id: 'space_1_all_with_restricted_fixture at space1',
  user: Space1AllWithRestrictedFixture,
  space: Space1,
};

interface Space1AllAlertingNoneActionsAtSpace1 extends Scenario {
  id: 'space_1_all_alerts_none_actions at space1';
}
export const Space1AllAlertingNoneActionsAtSpace1: Space1AllAlertingNoneActionsAtSpace1 = {
  id: 'space_1_all_alerts_none_actions at space1',
  user: Space1AllAlertingNoneActions,
  space: Space1,
};

interface Space1AllAtSpace2 extends Scenario {
  id: 'space_1_all at space2';
}
const Space1AllAtSpace2: Space1AllAtSpace2 = {
  id: 'space_1_all at space2',
  user: Space1All,
  space: Space2,
};

interface SystemActionSpace1 extends Scenario {
  id: 'system_actions at space1';
}

export const systemActionScenario: SystemActionSpace1 = {
  id: 'system_actions at space1',
  user: CasesAll,
  space: Space1,
};

interface Space1AllAtSpace1 extends Scenario {
  id: 'space_1_all at space1';
}

export const Space1AllAtSpace1: Space1AllAtSpace1 = {
  id: 'space_1_all at space1',
  user: Space1All,
  space: Space1,
};

interface EnableDisableOnlyUserAtSpace1 extends Scenario {
  id: 'enable_disable_only at space1';
}

export const EnableDisableOnlyUserAtSpace1: EnableDisableOnlyUserAtSpace1 = {
  id: 'enable_disable_only at space1',
  user: EnableDisableOnlyUser,
  space: Space1,
};

interface ManualRunOnlyUserAtSpace1 extends Scenario {
  id: 'manual_run_only at space1';
}

export const ManualRunOnlyUserAtSpace1: ManualRunOnlyUserAtSpace1 = {
  id: 'manual_run_only at space1',
  user: ManualRunOnlyUser,
  space: Space1,
};

interface ManageRuleSettingsOnlyUserAtSpace1 extends Scenario {
  id: 'manage_rule_settings_only at space1';
}

export const ManageRuleSettingsOnlyUserAtSpace1: ManageRuleSettingsOnlyUserAtSpace1 = {
  id: 'manage_rule_settings_only at space1',
  user: ManageRuleSettingsOnlyUser,
  space: Space1,
};

interface AllWithoutBackfillPrivilegesUserAtSpace1 extends Scenario {
  id: 'all_without_backfill_privileges at space1';
}

export const AllWithoutBackfillPrivilegesUserAtSpace1: AllWithoutBackfillPrivilegesUserAtSpace1 = {
  id: 'all_without_backfill_privileges at space1',
  user: AllWithoutBackfillPrivilegesUser,
  space: Space1,
};

interface AllWithoutManageRuleSettingsUserAtSpace1 extends Scenario {
  id: 'all_without_manage_rule_settings at space1';
}

export const AllWithoutManageRuleSettingsUserAtSpace1: AllWithoutManageRuleSettingsUserAtSpace1 = {
  id: 'all_without_manage_rule_settings at space1',
  user: AllWithoutManageRuleSettingsUser,
  space: Space1,
};

export const UserAtSpaceScenarios: [
  NoKibanaPrivilegesAtSpace1,
  SuperuserAtSpace1,
  GlobalReadAtSpace1,
  Space1AllAtSpace1,
  Space1AllAtSpace2,
  Space1AllWithRestrictedFixtureAtSpace1,
  Space1AllAlertingNoneActionsAtSpace1
] = [
  NoKibanaPrivilegesAtSpace1,
  SuperuserAtSpace1,
  GlobalReadAtSpace1,
  Space1AllAtSpace1,
  Space1AllAtSpace2,
  Space1AllWithRestrictedFixtureAtSpace1,
  Space1AllAlertingNoneActionsAtSpace1,
];
