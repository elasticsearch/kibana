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
  type CurrentUser,
  type UserIdAndName,
} from '@kbn/agent-builder-common';
import {
  canChangeAgentAccessControl,
  canDeleteAgent,
  getEffectiveAgentRole,
  hasAgentReadAccess,
  hasAgentUseAccess,
  hasAgentWriteAccess,
  isAgentOwner,
} from '.';

const owner: UserIdAndName = { id: 'owner-id', username: 'alice' };
const ownerUser: CurrentUser = { id: 'owner-id', username: 'alice' };
const bob: CurrentUser = { id: 'bob-id', username: 'bob' };

describe('agent access-control authorization', () => {
  describe('isAgentOwner', () => {
    it('matches by id before username', () => {
      expect(isAgentOwner({ owner, currentUser: ownerUser })).toBe(true);
      expect(
        isAgentOwner({
          owner,
          currentUser: { id: 'different-id', username: 'alice' },
        })
      ).toBe(false);
    });

    it('falls back to username when ids are unavailable', () => {
      expect(
        isAgentOwner({
          owner: { username: 'alice' },
          currentUser: { username: 'alice' },
        })
      ).toBe(true);
    });
  });

  describe('getEffectiveAgentRole', () => {
    it('returns admin and owner roles before ACL grants', () => {
      expect(
        getEffectiveAgentRole({
          accessControl: { access_mode: AgentAccessControlMode.Private, entries: [] },
          owner,
          currentUser: bob,
          isAdmin: true,
        })
      ).toBe('admin');

      expect(
        getEffectiveAgentRole({
          accessControl: { access_mode: AgentAccessControlMode.Private, entries: [] },
          owner,
          currentUser: ownerUser,
          isAdmin: false,
        })
      ).toBe('owner');
    });

    it('uses ACL grants and access-mode baselines for non-owners', () => {
      expect(
        getEffectiveAgentRole({
          accessControl: {
            access_mode: AgentAccessControlMode.Private,
            entries: [{ type: 'user', name: 'bob', role: AgentAccessControlRole.Manager }],
          },
          owner,
          currentUser: bob,
          isAdmin: false,
        })
      ).toBe(AgentAccessControlRole.Manager);

      expect(
        getEffectiveAgentRole({
          accessControl: { access_mode: AgentAccessControlMode.Public, entries: [] },
          owner,
          currentUser: bob,
          isAdmin: false,
        })
      ).toBe(AgentAccessControlRole.Editor);
    });
  });

  describe('hierarchy checks', () => {
    it('lets Editor write but not delete or manage access control', () => {
      const args = {
        accessControl: {
          access_mode: AgentAccessControlMode.Private,
          entries: [{ type: 'user' as const, name: 'bob', role: AgentAccessControlRole.Editor }],
        },
        owner,
        currentUser: bob,
        isAdmin: false,
      };

      expect(hasAgentReadAccess(args)).toBe(true);
      expect(hasAgentUseAccess(args)).toBe(true);
      expect(hasAgentWriteAccess(args)).toBe(true);
      expect(canDeleteAgent(args)).toBe(false);
      expect(canChangeAgentAccessControl(args)).toBe(false);
    });

    it('lets Manager delete and manage access control', () => {
      const args = {
        accessControl: {
          access_mode: AgentAccessControlMode.Private,
          entries: [{ type: 'user' as const, name: 'bob', role: AgentAccessControlRole.Manager }],
        },
        owner,
        currentUser: bob,
        isAdmin: false,
      };

      expect(canDeleteAgent(args)).toBe(true);
      expect(canChangeAgentAccessControl(args)).toBe(true);
    });

    it('blocks access-control changes for the default agent', () => {
      expect(
        canChangeAgentAccessControl({
          agentId: agentBuilderDefaultAgentId,
          accessControl: {
            access_mode: AgentAccessControlMode.Private,
            entries: [{ type: 'user', name: 'bob', role: AgentAccessControlRole.Manager }],
          },
          owner,
          currentUser: bob,
          isAdmin: false,
        })
      ).toBe(false);
    });
  });
});
