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

export const useCanUpdateAgent = ({
  agent,
}: {
  agent: AgentWithOptionalPermissions | null;
}): boolean => {
  return useMemo(() => {
    if (!agent) {
      return false;
    }
    return agent.permissions?.update_agent ?? false;
  }, [agent]);
};
