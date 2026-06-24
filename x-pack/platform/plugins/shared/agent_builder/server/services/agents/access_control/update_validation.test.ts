/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_ACCESS_CONTROL_MAX_ENTRIES,
  AgentAccessControlRole,
  type AgentAccessControlEntry,
} from '@kbn/agent-builder-common';
import { validateAccessControlUpdate } from './update_validation';

const entry = (over: Partial<AgentAccessControlEntry> = {}): AgentAccessControlEntry => ({
  type: 'user',
  name: 'alice',
  role: AgentAccessControlRole.User,
  ...over,
});

describe('validateAccessControlUpdate', () => {
  test('accepts an empty list', () => {
    expect(validateAccessControlUpdate([])).toBeUndefined();
  });

  test('accepts a list of valid user entries', () => {
    expect(
      validateAccessControlUpdate([
        entry({ name: 'alice', role: AgentAccessControlRole.Editor }),
        entry({ name: 'bob', role: AgentAccessControlRole.User }),
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
      (_, i) => entry({ name: `user${i}` })
    );
    expect(validateAccessControlUpdate(tooMany)).toMatch(/maximum/);
  });

  test('rejects role-type entries (V1 supports user-only; V2 will add roles)', () => {
    expect(
      validateAccessControlUpdate([{ ...entry(), type: 'role' as 'user', name: 'analyst' }])
    ).toMatch(/type of "user"/);
  });

  test('rejects unknown principal type', () => {
    expect(validateAccessControlUpdate([{ ...entry(), type: 'group' as 'user' }])).toMatch(
      /type of "user"/
    );
  });

  test('rejects empty principal name', () => {
    expect(validateAccessControlUpdate([entry({ name: '' })])).toMatch(/non-empty/);
  });

  test('rejects unknown role', () => {
    expect(
      validateAccessControlUpdate([{ ...entry(), role: 'super-admin' as AgentAccessControlRole }])
    ).toMatch(/Unknown ACL role/);
  });

  test('rejects duplicate (type, name) pairs', () => {
    expect(
      validateAccessControlUpdate([
        entry({ name: 'alice' }),
        entry({ name: 'alice', role: AgentAccessControlRole.Manager }),
      ])
    ).toMatch(/Duplicate/);
  });
});
