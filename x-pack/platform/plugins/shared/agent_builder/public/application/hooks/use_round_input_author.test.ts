/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { ConversationOriginType } from '@kbn/agent-builder-common';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { useCurrentUser } from './use_current_user';
import { useUserProfiles } from './use_user_profiles';
import { useRoundInputAuthor } from './use_round_input_author';

jest.mock('./use_current_user', () => ({
  useCurrentUser: jest.fn(),
}));

jest.mock('./use_user_profiles', () => ({
  useUserProfiles: jest.fn(),
}));

const mockUseCurrentUser = jest.mocked(useCurrentUser);
const mockUseUserProfiles = jest.mocked(useUserProfiles);

const currentUser = {
  uid: 'current-user',
  enabled: true,
  user: {
    username: 'alice',
    full_name: 'Alice Maria',
  },
  data: {
    avatar: {
      initials: 'AM',
    },
  },
} as UserProfileWithAvatar;

const authorProfile = {
  uid: 'user-1',
  enabled: true,
  user: {
    username: 'jdoe',
    full_name: 'Jane Doe',
  },
  data: {
    avatar: {
      initials: 'JD',
    },
  },
} as UserProfileWithAvatar;

const mockUserProfiles = (profiles: UserProfileWithAvatar[]) => {
  mockUseUserProfiles.mockReturnValue({ data: profiles } as unknown as ReturnType<
    typeof useUserProfiles
  >);
};

describe('useRoundInputAuthor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentUser.mockReturnValue({ currentUser, isLoading: false } as ReturnType<
      typeof useCurrentUser
    >);
    mockUserProfiles([]);
  });

  it('resolves the Kibana profile of a persisted author', () => {
    mockUserProfiles([authorProfile]);

    const { result } = renderHook(() =>
      useRoundInputAuthor({
        author: { id: 'user-1', username: 'jdoe' },
        isPendingCurrentRound: false,
      })
    );

    expect(mockUseUserProfiles).toHaveBeenCalledWith({ uids: ['user-1'] });
    expect(result.current.profile).toBe(authorProfile);
    expect(result.current.name).toBe('Jane Doe');
    expect(result.current.isCurrentUser).toBe(false);
  });

  it('does not resolve a profile for authors coming from an external system', () => {
    const { result } = renderHook(() =>
      useRoundInputAuthor({
        author: { id: 'slack-user-1', full_name: 'Jane Doe', username: 'jdoe' },
        origin: { type: ConversationOriginType.Slack },
        isPendingCurrentRound: false,
      })
    );

    expect(mockUseUserProfiles).toHaveBeenCalledWith({ uids: [] });
    expect(result.current.profile).toBeUndefined();
    expect(result.current.name).toBe('Jane Doe');
    expect(result.current.avatarName).toBe('Jane Doe');
  });

  it('has no avatar for a Kibana author whose profile cannot be resolved', () => {
    const { result } = renderHook(() =>
      useRoundInputAuthor({
        author: { id: 'api_key_owner', username: 'api_key_owner' },
        isPendingCurrentRound: false,
      })
    );

    expect(result.current.profile).toBeUndefined();
    expect(result.current.name).toBe('api_key_owner');
    expect(result.current.avatarName).toBeUndefined();
  });

  it('attributes a pending round without a persisted author to the current user', () => {
    const { result } = renderHook(() =>
      useRoundInputAuthor({ author: undefined, isPendingCurrentRound: true })
    );

    expect(mockUseUserProfiles).toHaveBeenCalledWith({ uids: [] });
    expect(result.current.profile).toBe(currentUser);
    expect(result.current.name).toBe('Alice Maria');
    expect(result.current.isCurrentUser).toBe(true);
  });

  it('keeps persisted author attribution on a pending round', () => {
    mockUserProfiles([authorProfile]);

    const { result } = renderHook(() =>
      useRoundInputAuthor({
        author: { id: 'user-1', username: 'jdoe' },
        isPendingCurrentRound: true,
      })
    );

    expect(result.current.profile).toBe(authorProfile);
    expect(result.current.isCurrentUser).toBe(false);
  });

  it('has no author for a non-pending round without persisted author attribution', () => {
    const { result } = renderHook(() =>
      useRoundInputAuthor({ author: undefined, isPendingCurrentRound: false })
    );

    expect(result.current.profile).toBeUndefined();
    expect(result.current.name).toBeUndefined();
    expect(result.current.isCurrentUser).toBe(false);
  });

  it('flags a persisted author matching the current user before their profile resolves', () => {
    const { result } = renderHook(() =>
      useRoundInputAuthor({
        author: { id: 'current-user', username: 'alice' },
        isPendingCurrentRound: false,
      })
    );

    expect(result.current.profile).toBeUndefined();
    expect(result.current.isCurrentUser).toBe(true);
  });
});
