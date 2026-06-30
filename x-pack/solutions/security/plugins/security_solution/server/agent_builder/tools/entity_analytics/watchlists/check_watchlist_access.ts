/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type ErrorResult } from '@kbn/agent-builder-common';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import type { KibanaRequest } from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { getUserWatchlistPrivileges } from '../../../../lib/entity_analytics/watchlists/management/get_user_watchlist_privileges';

/**
 * Check that the calling user has the watchlist privilege the tool needs.
 *
 * Per-user RBAC must run inside the handler (see ToolAvailabilityConfig in @kbn/agent-builder-server).
 */
export const checkWatchlistAccess = async ({
  request,
  security,
  spaceId,
  type,
  // Text used in the error message to describe the action that was attempted
  action,
}: {
  request: KibanaRequest;
  security: SecurityPluginStart;
  spaceId: string;
  type: 'read' | 'write';
  action: string;
}): Promise<{ allowed: true } | { allowed: false; result: ErrorResult }> => {
  const privileges = await getUserWatchlistPrivileges(request, security, spaceId);
  const allowed =
    type === 'read' ? privileges.has_read_permissions : privileges.has_write_permissions;

  if (allowed) return { allowed: true };

  return {
    allowed: false,
    result: {
      tool_result_id: getToolResultId(),
      type: ToolResultType.error,
      data: {
        message: `You do not have permission to ${action} in this space.`,
      },
    },
  };
};
