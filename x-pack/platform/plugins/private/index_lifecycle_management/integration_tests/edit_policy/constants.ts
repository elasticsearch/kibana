/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment-timezone';

import type { PolicyFromES } from '../../common/types';

import { defaultRolloverAction } from '../../public/application/constants';

export const POLICY_NAME = 'my_policy';
export const SNAPSHOT_POLICY_NAME = 'my_snapshot_policy';
export const NEW_SNAPSHOT_POLICY_NAME = 'my_new_snapshot_policy';

export const POLICY_WITH_MIGRATE_OFF: PolicyFromES = {
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    name: 'my_policy',
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: defaultRolloverAction,
        },
      },
      warm: {
        min_age: '1d',
        actions: {
          migrate: { enabled: false },
        },
      },
    },
  },
  name: 'my_policy',
};

export const POLICY_WITH_INCLUDE_EXCLUDE: PolicyFromES = {
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    name: 'my_policy',
    phases: {
      hot: {
        min_age: '123ms',
        actions: {
          rollover: {
            max_age: '30d',
            max_size: '50gb',
          },
        },
      },
      warm: {
        min_age: '10d',
        actions: {
          allocate: {
            include: {
              abc: '123',
            },
            exclude: {
              def: '456',
            },
          },
        },
      },
    },
  },
  name: 'my_policy',
};

export const DELETE_PHASE_POLICY: PolicyFromES = {
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_age: '30d',
            max_size: '50gb',
          },
          set_priority: {
            priority: 100,
          },
        },
      },
      delete: {
        min_age: '0ms',
        actions: {
          wait_for_snapshot: {
            policy: SNAPSHOT_POLICY_NAME,
          },
          delete: {
            delete_searchable_snapshot: true,
          },
        },
      },
    },
    name: POLICY_NAME,
  },
  name: POLICY_NAME,
};

export const getDefaultHotPhasePolicy = (policyName?: string): PolicyFromES => ({
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    name: policyName ?? POLICY_NAME,
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_age: '30d',
            max_primary_shard_size: '50gb',
          },
        },
      },
    },
  },
  name: policyName ?? POLICY_NAME,
});

export const POLICY_WITH_NODE_ATTR_AND_OFF_ALLOCATION: PolicyFromES = {
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_size: '50gb',
          },
        },
      },
      warm: {
        actions: {
          allocate: {
            require: {},
            include: { test: '123' },
            exclude: {},
          },
        },
      },
      cold: {
        actions: {
          migrate: { enabled: false },
        },
      },
    },
    name: POLICY_NAME,
  },
  name: POLICY_NAME,
};

export const POLICY_WITH_NODE_ROLE_ALLOCATION: PolicyFromES = {
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_size: '50gb',
          },
        },
      },
      warm: {
        min_age: '0ms',
        actions: {},
      },
    },
    name: POLICY_NAME,
  },
  name: POLICY_NAME,
};

export const POLICY_WITH_KNOWN_AND_UNKNOWN_FIELDS = {
  version: 1,
  modified_date: Date.now().toString(),
  policy: {
    foo: 'bar',
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            unknown_setting: 123,
            max_size: '50gb',
          },
        },
      },
      warm: {
        min_age: '10d',
        actions: {
          my_unfollow_action: {},
          set_priority: {
            priority: 22,
            unknown_setting: true,
          },
        },
      },
      delete: {
        min_age: '15d',
        actions: {
          wait_for_snapshot: {
            policy: SNAPSHOT_POLICY_NAME,
          },
          delete: {
            delete_searchable_snapshot: true,
          },
        },
      },
    },
    name: POLICY_NAME,
  },
  name: POLICY_NAME,
} as any as PolicyFromES;

export const POLICY_MANAGED_BY_ES: PolicyFromES = {
  version: 1,
  modifiedDate: Date.now().toString(),
  policy: {
    name: POLICY_NAME,
    deprecated: true,
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          rollover: {
            max_age: '30d',
            max_primary_shard_size: '50gb',
          },
        },
      },
    },
    _meta: {
      managed: true,
    },
  },
  name: POLICY_NAME,
};

export const getGeneratedPolicies = (): PolicyFromES[] => {
  const policy = {
    phases: {
      hot: {
        min_age: '0s',
        actions: {
          rollover: {
            max_size: '1gb',
          },
        },
      },
    },
  };
  const policies: PolicyFromES[] = [];
  for (let i = 0; i < 105; i++) {
    policies.push({
      version: i,
      modifiedDate: moment().subtract(i, 'days').toISOString(),
      indices: i % 2 === 0 ? [`index${i}`] : [],
      name: `testy${i}`,
      policy: {
        ...policy,
        name: `testy${i}`,
      },
    });
  }
  return policies;
};
