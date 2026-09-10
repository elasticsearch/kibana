/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRole } from '@kbn/scout';

/**
 * Catalog of the custom roles exercised by the spaces API authorization matrix.
 *
 * Each entry is a Scout `KibanaRole` descriptor: an explicit `elasticsearch`
 * cluster/indices block and a `kibana` privileges block with `base`, `feature`
 * and `spaces`.
 *
 * These descriptors are consumed via `samlAuth.asInteractiveUser(descriptor)`, which
 * provisions each role into the SINGLE shared per-worker custom-role slot
 * (`custom_role_worker_N`) and returns a session cookie. Each `asInteractiveUser` call
 * overwrites that slot, and a previously captured cookie then resolves to the NEW
 * descriptor's privileges. Suites must therefore provision one role at a time
 * (cookie captured and used within a single serial `describe`) and must never hold
 * cookies for two custom roles concurrently — do not enable parallel workers or
 * `fullyParallel` for these suites.
 */
export const ROLES = {
  kibana_legacy_user: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['.kibana*'], privileges: ['manage', 'read', 'index', 'delete'] }],
    },
    kibana: [],
  },
  kibana_dual_privileges_user: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['.kibana*'], privileges: ['manage', 'read', 'index', 'delete'] }],
    },
    kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
  },
  kibana_dual_privileges_dashboard_only_user: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['.kibana*'], privileges: ['read', 'view_index_metadata'] }],
    },
    kibana: [{ base: ['read'], feature: {}, spaces: ['*'] }],
  },
  kibana_rbac_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
  },
  kibana_rbac_dashboard_only_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['read'], feature: {}, spaces: ['*'] }],
  },
  kibana_rbac_default_space_all_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['all'], feature: {}, spaces: ['default'] }],
  },
  kibana_rbac_default_space_read_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['read'], feature: {}, spaces: ['default'] }],
  },
  kibana_rbac_space_1_all_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['all'], feature: {}, spaces: ['space_1'] }],
  },
  kibana_rbac_space_1_read_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['read'], feature: {}, spaces: ['space_1'] }],
  },
  kibana_rbac_space_3_all_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['all'], feature: {}, spaces: ['space_3'] }],
  },
  kibana_rbac_space_3_read_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: ['read'], feature: {}, spaces: ['space_3'] }],
  },
  kibana_rbac_default_space_saved_objects_all_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: [], feature: { savedObjectsManagement: ['all'] }, spaces: ['default'] }],
  },
  kibana_rbac_default_space_saved_objects_read_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: [], feature: { savedObjectsManagement: ['read'] }, spaces: ['default'] }],
  },
  kibana_rbac_space_1_saved_objects_all_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: [], feature: { savedObjectsManagement: ['all'] }, spaces: ['space_1'] }],
  },
  kibana_rbac_space_1_saved_objects_read_user: {
    elasticsearch: { cluster: [] },
    kibana: [{ base: [], feature: { savedObjectsManagement: ['read'] }, spaces: ['space_1'] }],
  },
  no_access: {
    elasticsearch: { cluster: [] },
    kibana: [],
  },
  // Full Elasticsearch cluster/index access plus Kibana `all` in every space.
  superuser: {
    elasticsearch: {
      cluster: ['all'],
      indices: [{ names: ['*'], privileges: ['all'] }],
    },
    kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
  },
} satisfies Record<string, KibanaRole>;

export type RoleName = keyof typeof ROLES;

export const getRoleDescriptor = (role: RoleName): KibanaRole => ROLES[role];
