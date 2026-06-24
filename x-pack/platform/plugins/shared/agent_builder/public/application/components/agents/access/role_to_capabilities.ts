/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { AgentAccessControlRole, AgentAccessControlMode } from '@kbn/agent-builder-common';

export const ROLE_LABEL: Record<AgentAccessControlRole, string> = {
  [AgentAccessControlRole.User]: i18n.translate('xpack.agentBuilder.acl.role.user.label', {
    defaultMessage: 'User',
  }),
  [AgentAccessControlRole.Editor]: i18n.translate('xpack.agentBuilder.acl.role.editor.label', {
    defaultMessage: 'Editor',
  }),
  [AgentAccessControlRole.Manager]: i18n.translate('xpack.agentBuilder.acl.role.manager.label', {
    defaultMessage: 'Manager',
  }),
};

export const ROLE_DESCRIPTION: Record<AgentAccessControlRole, string> = {
  [AgentAccessControlRole.User]: i18n.translate('xpack.agentBuilder.acl.role.user.description', {
    defaultMessage: 'Can find, view, and run this agent.',
  }),
  [AgentAccessControlRole.Editor]: i18n.translate(
    'xpack.agentBuilder.acl.role.editor.description',
    {
      defaultMessage: 'User + edit configuration.',
    }
  ),
  [AgentAccessControlRole.Manager]: i18n.translate(
    'xpack.agentBuilder.acl.role.manager.description',
    {
      defaultMessage: 'Editor + delete and manage access.',
    }
  ),
};

const ROLE_ORDER: AgentAccessControlRole[] = [
  AgentAccessControlRole.User,
  AgentAccessControlRole.Editor,
  AgentAccessControlRole.Manager,
];

/**
 * Roles that meaningfully grant something on top of a given access control mode.
 *
 * For Public/Shared agents the see/use baseline is already global, so a `User` entry
 * would be a no-op. We hide it in the role dropdown to prevent misleading rows.
 */
export const selectableRolesForAccessControlMode = (
  accessControlMode: AgentAccessControlMode | undefined
): AgentAccessControlRole[] => {
  if (
    accessControlMode === AgentAccessControlMode.Public ||
    accessControlMode === AgentAccessControlMode.Shared
  ) {
    return [AgentAccessControlRole.Editor, AgentAccessControlRole.Manager];
  }
  return ROLE_ORDER;
};
