/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { AuthenticatedUser } from '@kbn/core-security-common';
export type { GetUserProfileResponse } from '../service';

export interface UserProfileAvatarData {
  /** Optional initials (two letters) of the user to use as avatar if avatar picture isn't specified. */
  initials?: string | null;
  /** Background color of the avatar when initials are used. */
  color?: string | null;
  /** Base64 data URL for the user avatar image. */
  imageUrl?: string | null;
}

export interface UserSettingsData {
  darkMode?: 'system' | 'dark' | 'light' | 'space_default';
  contrastMode?: 'system' | 'standard' | 'high';
  locale?: string;
  solutionNavOptOut?: boolean;
  rememberSelectedSpace?: boolean;
  lastSelectedSpaceId?: string | null;
  agentBuilderAnnouncementModalSeen?: boolean;
  agentBuilderAnnouncementModalSeenBySpaceJson?: string;
}

export interface CurrentUser {
  /** Username of the user (from `AuthenticatedUser.username`). */
  username: string;
  /** Optional email of the user (from `AuthenticatedUser.email`). */
  email?: string;
  /** Full name of the user (from `AuthenticatedUser.full_name`). */
  fullName?: string;
  /**
   * Human-readable display name. Mirrors the security plugin's `getUserDisplayName`:
   * `full_name || email || username`.
   */
  displayName: string;
  /** Roles assigned to the user (from `AuthenticatedUser.roles`). */
  roles: readonly string[];

  /** Whether the user is an Elastic Cloud user (from `AuthenticatedUser.elastic_cloud_user`). */
  isCloudUser: boolean;
  /** Whether the user is an operator (from `AuthenticatedUser.operator`, defaults to `false`). */
  isOperator: boolean;
  /**
   * Whether the user is anonymous
   * (from `AuthenticatedUser.authentication_provider.type === 'anonymous'`).
   */
  isAnonymous: boolean;

  /** Profile identifier (from `AuthenticatedUser.profile_uid`, falling back to `profile.uid`). */
  profileUid?: string;
  /** Avatar stored in the user profile (from `profile.data.avatar`). */
  avatar?: UserProfileAvatarData;
  /** User settings stored in the user profile (from `profile.data.userSettings`). */
  userSettings?: UserSettingsData;
}

/**
 * Per-source, react-query-style state. Exposed only when {@link useCurrentUser} is called with
 * `includeRawQuerySource: true`.
 */
export interface RawQuerySource<T> {
  /** Whether the underlying request is still in flight. */
  isLoading: boolean;
  /** The raw source data. `undefined` while loading. */
  state: T | undefined;
  /** The error, if the request failed. A missing profile (HTTP 404) is NOT an error. */
  error?: Error;
}
