/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { getLeadsIndexName } from '../../../../common/entity_analytics/lead_generation/constants';
import { _formatPrivileges, hasReadWritePermissions } from '../utils/check_and_format_privileges';

export const getUserLeadPrivileges = async (
  request: KibanaRequest,
  security: SecurityPluginStart,
  spaceId: string
) => {
  const adhocIndex = getLeadsIndexName(spaceId, 'adhoc');
  const scheduledIndex = getLeadsIndexName(spaceId, 'scheduled');

  const checkPrivileges = security.authz.checkPrivilegesDynamicallyWithRequest(request);
  const { privileges, hasAllRequested } = await checkPrivileges({
    elasticsearch: {
      cluster: [],
      index: {
        [adhocIndex]: ['read', 'write'],
        [scheduledIndex]: ['read', 'write'],
      },
    },
  });

  const adhocPerms = hasReadWritePermissions(privileges.elasticsearch, adhocIndex);
  const scheduledPerms = hasReadWritePermissions(privileges.elasticsearch, scheduledIndex);

  return {
    privileges: _formatPrivileges(privileges),
    has_all_required: hasAllRequested,
    adhoc: {
      has_read_permissions: adhocPerms.has_read_permissions,
      has_write_permissions: adhocPerms.has_write_permissions,
    },
    scheduled: {
      has_read_permissions: scheduledPerms.has_read_permissions,
      has_write_permissions: scheduledPerms.has_write_permissions,
    },
  };
};
