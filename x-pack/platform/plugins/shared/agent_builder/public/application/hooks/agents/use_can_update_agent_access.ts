/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { AgentDefinition } from '@kbn/agent-builder-common';
import type { AgentPermissions } from '../../../../common/http_api/agents';

type AgentWithOptionalPermissions = AgentDefinition & { permissions?: AgentPermissions };

/**
 * Returns whether the current user is allowed to view and edit an agent's access control.
 *
 * ACL entry edits can grant higher permissions, so they use the same Manager-level
 * authorization check as access-control mode changes.
 *
 * Returns `false` while the current user is still loading to avoid flashing incorrect actions.
 */
export const useCanUpdateAgentAccess = (
  agent: AgentWithOptionalPermissions | null | undefined
): { canUpdate: boolean; isLoading: boolean } => {
  const canUpdate = useMemo(() => {
    if (!agent) return false;
    return agent.permissions?.update_access_control ?? false;
  }, [agent]);

  return { canUpdate, isLoading: false };
};
