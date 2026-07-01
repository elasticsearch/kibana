/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ConversationAccessControlMode, type UserIdAndName } from '@kbn/agent-builder-common';
import type { ConversationProperties } from '../client/storage';
import { hasConversationConverseAccess, hasConversationOwnerAccess, isConversationOwner } from '.';

const user: UserIdAndName = {
  id: 'user-profile-id',
  username: 'alice',
};

const conversation = (overrides: Partial<ConversationProperties> = {}): ConversationProperties => ({
  agent_id: 'agent-1',
  user_id: 'owner-profile-id',
  user_name: 'owner',
  space: 'default',
  title: 'Conversation',
  created_at: '2026-06-29T00:00:00.000Z',
  updated_at: '2026-06-29T00:00:00.000Z',
  conversation_rounds: [],
  ...overrides,
});

describe('conversation access control', () => {
  describe('isConversationOwner', () => {
    it('matches owners by profile id when both sides have one', () => {
      expect(
        isConversationOwner({
          conversation: conversation({ user_id: user.id, user_name: 'old-alice' }),
          user,
        })
      ).toBe(true);
    });

    it('falls back to username for legacy conversations without profile ids', () => {
      expect(
        isConversationOwner({
          conversation: conversation({ user_id: undefined, user_name: user.username }),
          user,
        })
      ).toBe(true);
    });
  });

  describe('operation-specific access checks', () => {
    it('allows non-owners to read public conversations', () => {
      const publicConversation = conversation({
        access_control: { access_mode: ConversationAccessControlMode.Public },
      });

      expect(hasConversationConverseAccess({ conversation: publicConversation, user })).toBe(true);
    });

    it('does not grant owner access to non-owners of public conversations', () => {
      expect(
        hasConversationOwnerAccess({
          conversation: conversation({
            access_control: { access_mode: ConversationAccessControlMode.Public },
          }),
          user,
        })
      ).toBe(false);
    });

    it('treats missing access_control as private for non-owners', () => {
      expect(hasConversationConverseAccess({ conversation: conversation(), user })).toBe(false);
    });
  });
});
