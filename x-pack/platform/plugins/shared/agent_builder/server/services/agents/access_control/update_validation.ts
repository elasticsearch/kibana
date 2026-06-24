/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_ACCESS_CONTROL_MAX_ENTRIES,
  AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH,
  isAgentAccessControlRole,
  type AgentAccessControlEntry,
} from '@kbn/agent-builder-common';

/**
 * Validates the entries provided in an access control update. Returns a string describing the first
 * error encountered, or `undefined` when the input is valid.
 */
export const validateAccessControlUpdate = (
  entries: AgentAccessControlEntry[]
): string | undefined => {
  if (!Array.isArray(entries)) {
    return 'ACL entries must be an array';
  }
  if (entries.length > AGENT_ACCESS_CONTROL_MAX_ENTRIES) {
    return `ACL entries exceed maximum of ${AGENT_ACCESS_CONTROL_MAX_ENTRIES}`;
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    // V1: only user-type entries are supported. Role-type grants are planned for V2.
    if (!entry || entry.type !== 'user') {
      return 'Each ACL entry requires a type of "user"';
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      return 'Each ACL entry requires a non-empty name';
    }
    if (entry.name.length > AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH) {
      return `ACL principal name exceeds maximum length of ${AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH}`;
    }
    if (!isAgentAccessControlRole(entry.role)) {
      return `Unknown ACL role: ${String(entry.role)}`;
    }
    const key = `${entry.type}:${entry.name}`;
    if (seen.has(key)) {
      return `Duplicate ACL entry for ${entry.type} "${entry.name}"`;
    }
    seen.add(key);
  }
  return undefined;
};
