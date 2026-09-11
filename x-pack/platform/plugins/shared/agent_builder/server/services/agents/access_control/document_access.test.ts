/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  agentBuilderDefaultAgentId,
  AgentAccessControlRole,
  AgentType,
  AgentAccessControlMode,
} from '@kbn/agent-builder-common';
import type { AgentProperties } from '../persisted/client/storage';
import {
  hasReadAccess,
  hasWriteAccess,
  getAgentPermissions,
  normalizeAccessControl,
  redactAccessControlForCaller,
  validateAccessControlUpdateAccess,
} from './document_access';

const baseSource: AgentProperties = {
  id: 'agent-1',
  name: 'Test Agent',
  type: AgentType.chat,
  space: 'default',
  description: 'Test',
  config: { tools: [] },
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const ownerUser = { id: 'user-1', username: 'owner', isAdmin: false };
const nonOwnerUser = { id: 'user-2', username: 'other', isAdmin: false };
const adminUser = { id: 'admin-id', username: 'admin', isAdmin: true };
const ownerByUsernameOnly = { username: 'owner', isAdmin: false };

describe('normalizeAccessControl', () => {
  it('falls back to public for legacy documents without access control, unlike new agents', () => {
    expect(normalizeAccessControl(baseSource)).toEqual({
      access_mode: AgentAccessControlMode.Public,
      entries: [],
    });
  });

  it('prefers legacy visibility over the public fallback', () => {
    const source = { ...baseSource, visibility: AgentAccessControlMode.Private };
    expect(normalizeAccessControl(source).access_mode).toBe(AgentAccessControlMode.Private);
  });
});

describe('hasReadAccess', () => {
  it('returns true for admins regardless of access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: adminUser })).toBe(true);
  });

  it('returns true for owner regardless of access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_id: ownerUser.id,
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: ownerUser })).toBe(true);
  });

  it('returns true for legacy owners that only stored created_by_name', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: ownerByUsernameOnly })).toBe(true);
    expect(hasReadAccess({ source, user: ownerUser })).toBe(true);
  });

  it('returns false for same username when the document stored a different created_by_id', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_id: 'other-realm-id',
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: ownerUser })).toBe(false);
  });

  it('returns true for non-owner when access-control mode is undefined (legacy agent treated as public)', () => {
    const source = { ...baseSource, created_by_name: 'owner' };
    expect(hasReadAccess({ source, user: nonOwnerUser })).toBe(true);
  });

  it('returns false for non-owner when legacy visibility is private', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Private,
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: nonOwnerUser })).toBe(false);
  });

  it('returns true for a user granted access through legacy acl entries', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Private,
      acl: {
        entries: [
          {
            type: 'user' as const,
            name: nonOwnerUser.username,
            role: AgentAccessControlRole.User,
          },
        ],
      },
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: nonOwnerUser })).toBe(true);
  });

  it('returns true for non-owner when access-control mode is shared', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Shared, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: nonOwnerUser })).toBe(true);
  });

  it('returns false for non-owner when access-control mode is private', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasReadAccess({ source, user: nonOwnerUser })).toBe(false);
  });
});

describe('hasWriteAccess', () => {
  it('returns true for admins regardless of access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasWriteAccess({ source, user: adminUser })).toBe(true);
  });

  it('returns true for owner regardless of access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_id: ownerUser.id,
      created_by_name: 'owner',
    };
    expect(hasWriteAccess({ source, user: ownerUser })).toBe(true);
  });

  it('returns true for non-owner when access-control mode is undefined (legacy agent treated as public)', () => {
    const source = { ...baseSource, created_by_name: 'owner' };
    expect(hasWriteAccess({ source, user: nonOwnerUser })).toBe(true);
  });

  it('returns false for non-owner when legacy visibility is shared', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Shared,
      created_by_name: 'owner',
    };
    expect(hasWriteAccess({ source, user: nonOwnerUser })).toBe(false);
  });

  it('returns true for a user granted edit access through legacy acl entries', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Private,
      acl: {
        entries: [
          {
            type: 'user' as const,
            name: nonOwnerUser.username,
            role: AgentAccessControlRole.Editor,
          },
        ],
      },
      created_by_name: 'owner',
    };
    expect(hasWriteAccess({ source, user: nonOwnerUser })).toBe(true);
  });

  it('returns false for non-owner when access-control mode is shared', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Shared, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasWriteAccess({ source, user: nonOwnerUser })).toBe(false);
  });

  it('returns false for non-owner when access-control mode is private', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'owner',
    };
    expect(hasWriteAccess({ source, user: nonOwnerUser })).toBe(false);
  });
});

describe('getAgentPermissions', () => {
  it('returns edit without access-control management for Editor grants', () => {
    const source = {
      ...baseSource,
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [
          {
            type: 'user' as const,
            id: nonOwnerUser.id!,
            role: AgentAccessControlRole.Editor,
          },
        ],
      },
      created_by_name: 'owner',
    };

    expect(getAgentPermissions({ source, user: nonOwnerUser })).toEqual({
      update_agent: true,
      update_access_control: false,
    });
  });

  it('returns both permissions for owners and Manager grants', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_id: ownerUser.id,
      created_by_name: ownerUser.username,
    };

    expect(getAgentPermissions({ source, user: ownerUser })).toEqual({
      update_agent: true,
      update_access_control: true,
    });
  });

  it('blocks access-control management for the default agent', () => {
    const source = {
      ...baseSource,
      id: agentBuilderDefaultAgentId,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: ownerUser.id,
      created_by_name: ownerUser.username,
    };

    expect(getAgentPermissions({ source, user: ownerUser })).toEqual({
      update_agent: true,
      update_access_control: false,
    });
  });
});

describe('validateAccessControlUpdateAccess', () => {
  it('returns true when update does not change access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { name: 'New Name' },
        user: nonOwnerUser,
      })
    ).toBe(true);
  });

  it('returns true when update access-control mode is undefined', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { description: 'Updated' },
        user: nonOwnerUser,
      })
    ).toBe(true);
  });

  it('returns true when access-control mode change is to same value (no actual change)', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Public } },
        user: nonOwnerUser,
      })
    ).toBe(true);
  });

  it('returns true when access-control mode change is same as legacy visibility', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Private,
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Private } },
        user: nonOwnerUser,
      })
    ).toBe(true);
  });

  it('returns true for owner changing access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: ownerUser.id,
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Private } },
        user: ownerUser,
      })
    ).toBe(true);
  });

  it('returns true for a legacy Manager ACL grantee changing access-control mode', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Private,
      acl: {
        entries: [
          {
            type: 'user' as const,
            name: nonOwnerUser.username,
            role: AgentAccessControlRole.Manager,
          },
        ],
      },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Shared } },
        user: nonOwnerUser,
      })
    ).toBe(true);
  });

  it('returns true for admins changing access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Private } },
        user: adminUser,
      })
    ).toBe(true);
  });

  it('returns false for non-owner without access-control mode permission changing access-control mode', () => {
    const source = {
      ...baseSource,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Private } },
        user: nonOwnerUser,
      })
    ).toBe(false);
  });

  it('returns false for non-owner changing legacy visibility without permission', () => {
    const source = {
      ...baseSource,
      visibility: AgentAccessControlMode.Private,
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Shared } },
        user: nonOwnerUser,
      })
    ).toBe(false);
  });

  it('returns false when changing access-control mode of the default agent even for owner', () => {
    const source = {
      ...baseSource,
      id: agentBuilderDefaultAgentId,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_id: ownerUser.id,
      created_by_name: ownerUser.username,
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Private } },
        user: ownerUser,
      })
    ).toBe(false);
  });

  it('returns false when changing access-control mode of the default agent even with override', () => {
    const source = {
      ...baseSource,
      id: agentBuilderDefaultAgentId,
      access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
      created_by_name: 'owner',
    };
    expect(
      validateAccessControlUpdateAccess({
        source,
        update: { access_control: { access_mode: AgentAccessControlMode.Shared } },
        user: adminUser,
      })
    ).toBe(false);
  });
});

describe('redactAccessControlForCaller', () => {
  const aliceEntry = {
    type: 'user' as const,
    id: ownerUser.id!,
    role: AgentAccessControlRole.Editor,
  };
  const bobEntry = {
    type: 'user' as const,
    id: nonOwnerUser.id!,
    role: AgentAccessControlRole.User,
  };

  const privateAgentWithAcl: AgentProperties = {
    ...baseSource,
    access_control: {
      access_mode: AgentAccessControlMode.Private,
      entries: [aliceEntry, bobEntry],
    },
    created_by_id: ownerUser.id,
    created_by_name: 'owner',
  };

  it('returns the definition unchanged when there is no access_control', () => {
    const definition = { id: 'a', access_control: undefined };
    const result = redactAccessControlForCaller({
      definition,
      source: baseSource,
      user: nonOwnerUser,
    });
    expect(result).toBe(definition);
  });

  it('returns the definition unchanged when access_control entries are empty', () => {
    const definition = {
      id: 'a',
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: {
        ...baseSource,
        access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
      },
      user: nonOwnerUser,
    });
    expect(result).toBe(definition);
  });

  it('returns the full entries list for the agent owner', () => {
    const definition = {
      id: 'a',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceEntry, bobEntry],
      },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: privateAgentWithAcl,
      user: ownerUser,
    });
    expect(result.access_control?.entries).toEqual([aliceEntry, bobEntry]);
  });

  it('returns the full entries list for a cluster admin', () => {
    const definition = {
      id: 'a',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceEntry, bobEntry],
      },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: privateAgentWithAcl,
      user: adminUser,
    });
    expect(result.access_control?.entries).toEqual([aliceEntry, bobEntry]);
  });

  it("keeps only the caller's own id-backed entry for a user without manage rights", () => {
    // Bob has User access via the access_control (User < Manager threshold) so he cannot manage.
    const definition = {
      id: 'a',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceEntry, bobEntry],
      },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: privateAgentWithAcl,
      user: nonOwnerUser,
    });
    expect(result.access_control?.entries).toEqual([bobEntry]);
    // Shallow-copy: the original definition is untouched.
    expect(definition.access_control?.entries).toEqual([aliceEntry, bobEntry]);
  });

  it("drops an id-backed entry with the caller's username but a different id (cross-realm case)", () => {
    const definition = {
      id: 'a',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceEntry, bobEntry],
      },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: privateAgentWithAcl,
      user: {
        id: 'realm:["file","file1","other"]',
        username: nonOwnerUser.username,
        isAdmin: false,
      },
    });
    expect(result.access_control?.entries).toEqual([]);
  });

  it("keeps the caller's own legacy name-only entry (pre-id migration)", () => {
    const legacyBobEntry = {
      type: 'user' as const,
      name: nonOwnerUser.username,
      role: AgentAccessControlRole.User,
    };
    const definition = {
      id: 'a',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceEntry, legacyBobEntry],
      },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: {
        ...baseSource,
        access_control: {
          access_mode: AgentAccessControlMode.Private,
          entries: [aliceEntry, legacyBobEntry],
        },
        created_by_id: ownerUser.id,
        created_by_name: 'owner',
      },
      user: nonOwnerUser,
    });
    expect(result.access_control?.entries).toEqual([legacyBobEntry]);
  });

  it('returns the full entries list for a user with Manager via legacy acl', () => {
    const aliceUser = { username: 'alice', isAdmin: false };
    const aliceManagerEntry = {
      type: 'user' as const,
      name: 'alice',
      role: AgentAccessControlRole.Manager,
    };
    const definition = {
      id: 'a',
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [aliceManagerEntry, bobEntry],
      },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: {
        ...baseSource,
        visibility: AgentAccessControlMode.Private,
        acl: { entries: [aliceManagerEntry] },
        created_by_name: 'owner',
      },
      user: aliceUser,
    });
    expect(result.access_control?.entries).toEqual([aliceManagerEntry, bobEntry]);
  });

  it('redacts entries on the default agent even for the owner', () => {
    // Default agent never accepts access_control management — even the owner is redacted, so
    // Bob's entry is dropped and Alice gets [] back.
    const definition = {
      id: agentBuilderDefaultAgentId,
      access_control: { access_mode: AgentAccessControlMode.Private, entries: [bobEntry] },
    };
    const result = redactAccessControlForCaller({
      definition,
      source: {
        ...baseSource,
        id: agentBuilderDefaultAgentId,
        created_by_id: ownerUser.id,
        created_by_name: 'owner',
        access_control: { access_mode: AgentAccessControlMode.Private, entries: [bobEntry] },
      },
      user: ownerUser,
    });
    expect(result.access_control?.entries).toEqual([]);
  });
});
