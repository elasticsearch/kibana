/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getConversationRoundAuthorDisplayName,
  type ConversationRoundAuthor,
  type ConversationRoundOrigin,
} from '@kbn/agent-builder-common';
import { getUserDisplayName, type UserProfileWithAvatar } from '@kbn/user-profile-components';
import { useCurrentUser } from './use_current_user';
import { useUserProfiles } from './use_user_profiles';

interface UseRoundInputAuthorArgs {
  author?: ConversationRoundAuthor;
  origin?: ConversationRoundOrigin;
  isPendingCurrentRound: boolean;
}

export interface RoundInputAuthor {
  profile?: UserProfileWithAvatar;
  name?: string;
  /**
   * Name to seed an initials avatar with, for authors that have a name but can never have a Kibana
   * profile picture (external systems). Kibana users whose profile did not resolve get no avatar
   * rather than initials for an identity we only partially know.
   */
  avatarName?: string;
  isCurrentUser: boolean;
}

/**
 * Resolves how to display the author of a round input, whether they are a Kibana user, a user from
 * an external system such as Slack, or the current user on a round that is not persisted yet.
 */
export const useRoundInputAuthor = ({
  author,
  origin,
  isPendingCurrentRound,
}: UseRoundInputAuthorArgs): RoundInputAuthor => {
  const { currentUser } = useCurrentUser();

  // Authors from an external system are identified by that system, not by a Kibana profile uid.
  const kibanaAuthorId = origin ? undefined : author?.id;
  const { data: authorProfiles = [] } = useUserProfiles({
    uids: kibanaAuthorId ? [kibanaAuthorId] : [],
  });

  let profile: UserProfileWithAvatar | undefined;

  if (author) {
    profile = authorProfiles[0];
  } else if (isPendingCurrentRound) {
    // A round that is not persisted yet has no author attribution, so it belongs to the current user.
    profile = currentUser ?? undefined;
  }

  const authorId = author?.id ?? profile?.uid;
  const name = profile
    ? getUserDisplayName(profile.user)
    : getConversationRoundAuthorDisplayName(author);

  return {
    profile,
    name,
    ...(origin && name ? { avatarName: name } : {}),
    isCurrentUser: Boolean(authorId) && authorId === currentUser?.uid,
  };
};
