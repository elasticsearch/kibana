/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  agentBuilderDefaultAgentId,
  AgentAccessControlMode,
  AgentAccessControlRole,
  accessControlRoleMeets,
  maxAccessControlRole,
  type AgentAccessControl,
  type AgentAccessControlEntry,
  type CurrentUser,
  type UserIdAndName,
} from '@kbn/agent-builder-common';

export type EffectiveAgentRole = AgentAccessControlRole | 'owner' | 'admin';

export interface AgentAuthzArgs {
  accessControl?: AgentAccessControl;
  owner?: UserIdAndName;
  currentUser?: CurrentUser | null;
}

/**
 * Checks whether the current user owns the agent.
 *
 * Stable ids are preferred when the agent document stored a `created_by_id` (profile uid or
 * realm-qualified id). Username matching is kept only for legacy documents that never stored an
 * id, so those owners are not orphaned after upgrade. That legacy path cannot distinguish
 * same-username principals across realms.
 */
export const isAgentOwner = ({
  owner,
  currentUser,
}: {
  owner?: UserIdAndName;
  currentUser?: UserIdAndName | null;
}): boolean => {
  if (!owner || !currentUser) {
    return false;
  }
  if (owner.id !== undefined && currentUser.id !== undefined) {
    return owner.id === currentUser.id;
  }
  // Legacy docs without created_by_id: fall back to username so the original owner keeps access.
  if (
    owner.id === undefined &&
    owner.username !== undefined &&
    currentUser.username !== undefined
  ) {
    return owner.username === currentUser.username;
  }
  return false;
};

/**
 * Returns the baseline role granted by the agent's access mode before explicit user grants are
 * considered.
 *
 * Built-in agents carry no access control, so the Public fallback for an absent mode is what keeps
 * them usable — it must not be aligned with the Private default applied to newly created agents.
 */
const accessControlModeRole = (
  accessMode?: AgentAccessControlMode
): AgentAccessControlRole | undefined => {
  const effective = accessMode ?? AgentAccessControlMode.Public;
  switch (effective) {
    case AgentAccessControlMode.Public:
      // Public preserves the previous behavior: anyone can read AND write.
      return AgentAccessControlRole.Editor;
    case AgentAccessControlMode.Shared:
      // Shared: anyone can read and run; only owner+admin can write (matches legacy).
      return AgentAccessControlRole.User;
    case AgentAccessControlMode.Private:
      return undefined;
  }
};

/**
 * Matches an access-control entry against the current user: by stable `id` when the entry has one,
 * otherwise by username for legacy name-only entries.
 */
export const matchesAccessControlEntry = (
  entry: AgentAccessControlEntry,
  user: UserIdAndName | null | undefined
): boolean => {
  if (!user || entry.type !== 'user') {
    return false;
  }
  if (entry.id !== undefined) {
    return user.id !== undefined && entry.id === user.id;
  }
  return entry.name !== undefined && user.username !== undefined && entry.name === user.username;
};

/**
 * Returns the strongest explicit access-control entry that applies to the current user.
 */
const accessControlRoleForUser = (
  accessControl: AgentAccessControl | undefined,
  currentUser?: CurrentUser | null
): AgentAccessControlRole | undefined => {
  if (!accessControl || !currentUser) {
    return undefined;
  }
  // V1: only user-type entries. Role-type grants land in V2.
  let best: AgentAccessControlRole | undefined;
  for (const entry of accessControl.entries) {
    if (matchesAccessControlEntry(entry, currentUser)) {
      best = maxAccessControlRole(best, entry.role);
    }
  }
  return best;
};

/**
 * Resolves the caller's effective role for an agent.
 *
 * Admins and owners are represented as synthetic roles because they outrank access-control entries.
 * Non-owners receive the strongest role from their explicit entry and the access-mode baseline.
 */
export const getEffectiveAgentRole = ({
  accessControl,
  owner,
  currentUser,
}: AgentAuthzArgs): EffectiveAgentRole | undefined => {
  if (currentUser?.isAdmin) {
    return 'admin';
  }
  if (isAgentOwner({ owner, currentUser })) {
    return 'owner';
  }
  const entryRole = accessControlRoleForUser(accessControl, currentUser);
  const baseline = accessControlModeRole(accessControl?.access_mode);
  return maxAccessControlRole(entryRole, baseline);
};

/**
 * Checks whether an effective role satisfies a required access-control role threshold.
 */
const meetsThreshold = (
  effective: EffectiveAgentRole | undefined,
  threshold: AgentAccessControlRole
): boolean => {
  if (effective === undefined) {
    return false;
  }
  if (effective === 'admin' || effective === 'owner') {
    return true;
  }
  return accessControlRoleMeets(effective, threshold);
};

/**
 * Checks whether the caller can modify the complete `access_control` object, including both
 * visibility mode and entries.
 *
 * This requires admin, owner, or Manager access. The default agent is intentionally excluded from
 * access-control changes even for otherwise privileged callers.
 */
export const canChangeAgentAccessControl = (
  args: AgentAuthzArgs & { agentId?: string }
): boolean => {
  if (args.agentId === agentBuilderDefaultAgentId) {
    return false;
  }
  const role = getEffectiveAgentRole(args);
  return role === 'admin' || role === 'owner' || role === AgentAccessControlRole.Manager;
};

/**
 * Checks whether the caller can read and list the agent.
 */
export const hasAgentReadAccess = (args: AgentAuthzArgs): boolean =>
  meetsThreshold(getEffectiveAgentRole(args), AgentAccessControlRole.User);

/**
 * Checks whether the caller can run the agent.
 */
export const hasAgentUseAccess = (args: AgentAuthzArgs): boolean =>
  meetsThreshold(getEffectiveAgentRole(args), AgentAccessControlRole.User);

/**
 * Checks whether the caller can update editable agent fields that are not access control.
 */
export const hasAgentWriteAccess = (args: AgentAuthzArgs): boolean =>
  meetsThreshold(getEffectiveAgentRole(args), AgentAccessControlRole.Editor);

/**
 * Checks whether the caller can delete the agent.
 */
export const canDeleteAgent = (args: AgentAuthzArgs): boolean =>
  meetsThreshold(getEffectiveAgentRole(args), AgentAccessControlRole.Manager);
