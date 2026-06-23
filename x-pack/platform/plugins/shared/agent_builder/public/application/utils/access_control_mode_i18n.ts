/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { AgentAccessControlMode } from '@kbn/agent-builder-common';

/** Shared access control mode labels for list badge and settings form. */
export const ACCESS_CONTROL_MODE_LABELS: Record<AgentAccessControlMode, string> = {
  [AgentAccessControlMode.Private]: i18n.translate(
    'xpack.agentBuilder.agents.accessControlMode.private',
    {
      defaultMessage: 'Private',
    }
  ),
  [AgentAccessControlMode.Shared]: i18n.translate(
    'xpack.agentBuilder.agents.accessControlMode.shared',
    {
      defaultMessage: 'Shared',
    }
  ),
  [AgentAccessControlMode.Public]: i18n.translate(
    'xpack.agentBuilder.agents.accessControlMode.public',
    {
      defaultMessage: 'Public',
    }
  ),
};

/** Shared access control mode tooltips for list badge. */
export const ACCESS_CONTROL_MODE_TOOLTIPS: Record<AgentAccessControlMode, string> = {
  [AgentAccessControlMode.Private]: i18n.translate(
    'xpack.agentBuilder.agents.accessControlMode.privateTooltip',
    {
      defaultMessage: 'Only the owner or an administrator can view and edit.',
    }
  ),
  [AgentAccessControlMode.Shared]: i18n.translate(
    'xpack.agentBuilder.agents.accessControlMode.sharedTooltip',
    {
      defaultMessage: 'Anyone can view. Only the owner or an administrator can edit.',
    }
  ),
  [AgentAccessControlMode.Public]: i18n.translate(
    'xpack.agentBuilder.agents.accessControlMode.publicTooltip',
    {
      defaultMessage: 'Anyone can view and edit.',
    }
  ),
};
