/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_ACCESS_CONTROL_MAX_ENTRIES,
  AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH,
  getAccessControlEntryKey,
  isAgentAccessControlRole,
  type AgentAccessControlEntry,
} from '@kbn/agent-builder-common';

/** Checks that the entry names a principal via a well-formed `id` or, failing that, `name`. */
const validatePrincipal = (entry: AgentAccessControlEntry): string | undefined => {
  const hasId = entry.id !== undefined;
  const hasName = entry.name !== undefined;
  if (!hasId && !hasName) {
    return 'Each ACL entry requires a non-empty id or name';
  }
  const field = hasId ? 'id' : 'name';
  const value = hasId ? entry.id : entry.name;
  if (typeof value !== 'string' || value.length === 0) {
    return `Each ACL entry requires a non-empty ${field}`;
  }
  if (value.length > AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH) {
    return `ACL principal ${field} exceeds maximum length of ${AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH}`;
  }
  return undefined;
};

/**
 * Validates the entries provided in an access control update. Returns a string describing the first
 * error encountered, or `undefined` when the input is valid. Entries must carry an `id` or a
 * legacy `name`.
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
    const principalError = validatePrincipal(entry);
    if (principalError) {
      return principalError;
    }
    if (!isAgentAccessControlRole(entry.role)) {
      return `Unknown ACL role: ${String(entry.role)}`;
    }
    const key = getAccessControlEntryKey(entry);
    if (seen.has(key)) {
      return `Duplicate ACL entry for ${entry.type} "${entry.id ?? entry.name}"`;
    }
    seen.add(key);
  }
  return undefined;
};
