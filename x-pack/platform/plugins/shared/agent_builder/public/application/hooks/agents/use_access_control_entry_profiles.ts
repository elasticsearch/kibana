/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { AgentAccessControlEntry } from '@kbn/agent-builder-common';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { useUserProfiles } from '../use_user_profiles';

/**
 * Resolves user profiles for the id-backed access-control entries, keyed by profile uid. Legacy
 * name-only entries have no profile to resolve and are skipped.
 */
export const useAccessControlEntryProfiles = (
  entries: AgentAccessControlEntry[]
): Map<string, UserProfileWithAvatar> => {
  const uids = useMemo(
    () => entries.flatMap((entry) => (entry.id !== undefined ? [entry.id] : [])),
    [entries]
  );
  const { data: profiles = [] } = useUserProfiles({ uids, enabled: uids.length > 0 });
  return useMemo(() => new Map(profiles.map((profile) => [profile.uid, profile])), [profiles]);
};
