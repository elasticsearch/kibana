/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_ACCESS_CONTROL_MAX_ENTRIES,
  AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH,
  AgentAccessControlRole,
  type AgentAccessControlEntry,
} from '@kbn/agent-builder-common';
import { validateAccessControlUpdate } from './update_validation';

const entry = (over: Partial<AgentAccessControlEntry> = {}): AgentAccessControlEntry => ({
  type: 'user',
  id: 'u_alice',
  role: AgentAccessControlRole.User,
  ...over,
});

describe('validateAccessControlUpdate', () => {
  test('accepts an empty list', () => {
    expect(validateAccessControlUpdate([])).toBeUndefined();
  });

  test('accepts a list of valid id-backed user entries', () => {
    expect(
      validateAccessControlUpdate([
        entry({ id: 'u_alice', role: AgentAccessControlRole.Editor }),
        entry({ id: 'u_bob', role: AgentAccessControlRole.User }),
      ])
    ).toBeUndefined();
  });

  test('rejects non-array input', () => {
    // Cast to bypass the type guard; we want to verify the runtime check.
    expect(validateAccessControlUpdate(undefined as unknown as AgentAccessControlEntry[])).toMatch(
      /array/
    );
  });

  test('rejects entries past the maximum', () => {
    const tooMany: AgentAccessControlEntry[] = Array.from(
      { length: AGENT_ACCESS_CONTROL_MAX_ENTRIES + 1 },
      (_, i) => entry({ id: `u_user${i}` })
    );
    expect(validateAccessControlUpdate(tooMany)).toMatch(/maximum/);
  });

  test('rejects role-type entries (V1 supports user-only; V2 will add roles)', () => {
    expect(validateAccessControlUpdate([{ ...entry(), type: 'role' as 'user' }])).toMatch(
      /type of "user"/
    );
  });

  test('rejects unknown principal type', () => {
    expect(validateAccessControlUpdate([{ ...entry(), type: 'group' as 'user' }])).toMatch(
      /type of "user"/
    );
  });

  test('accepts legacy name-only entries so existing grants can be round-tripped', () => {
    expect(
      validateAccessControlUpdate([
        { type: 'user', name: 'alice', role: AgentAccessControlRole.User },
        entry({ id: 'u_bob' }),
      ])
    ).toBeUndefined();
  });

  test('rejects entries with neither id nor name', () => {
    expect(
      validateAccessControlUpdate([{ type: 'user', role: AgentAccessControlRole.User }])
    ).toMatch(/non-empty id or name/);
  });

  test('rejects empty principal id', () => {
    expect(validateAccessControlUpdate([entry({ id: '' })])).toMatch(/non-empty id/);
  });

  test('rejects empty principal name', () => {
    expect(
      validateAccessControlUpdate([{ type: 'user', name: '', role: AgentAccessControlRole.User }])
    ).toMatch(/non-empty name/);
  });

  test('rejects principal id longer than the maximum length', () => {
    expect(
      validateAccessControlUpdate([
        entry({ id: 'u_'.padEnd(AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH + 1, 'a') }),
      ])
    ).toMatch(/id exceeds maximum length/);
  });

  test('rejects principal name longer than the maximum length', () => {
    expect(
      validateAccessControlUpdate([
        {
          type: 'user',
          name: 'a'.repeat(AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH + 1),
          role: AgentAccessControlRole.User,
        },
      ])
    ).toMatch(/name exceeds maximum length/);
  });

  test('rejects unknown role', () => {
    expect(
      validateAccessControlUpdate([{ ...entry(), role: 'super-admin' as AgentAccessControlRole }])
    ).toMatch(/Unknown ACL role/);
  });

  test('rejects duplicate (type, id) pairs', () => {
    expect(
      validateAccessControlUpdate([
        entry({ id: 'u_alice' }),
        entry({ id: 'u_alice', role: AgentAccessControlRole.Manager }),
      ])
    ).toMatch(/Duplicate/);
  });

  test('rejects duplicate (type, name) pairs', () => {
    expect(
      validateAccessControlUpdate([
        { type: 'user', name: 'alice', role: AgentAccessControlRole.User },
        { type: 'user', name: 'alice', role: AgentAccessControlRole.Manager },
      ])
    ).toMatch(/Duplicate/);
  });
});
