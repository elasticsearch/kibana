/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useContext } from 'react';

import type { I18nStart } from '@kbn/core-i18n-browser';
import type {
  NotificationsStart,
  ToastInputFields,
  ToastOptions,
} from '@kbn/core-notifications-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { toMountPoint } from '@kbn/react-kibana-mount';

import type { UserProfileAPIClient } from './types';

type NotifyFn = (
  data: { title: string; text?: string; actionProps?: ToastInputFields['actionProps'] },
  options?: { durationMs?: number }
) => void;

export interface Services {
  userProfileApiClient: UserProfileAPIClient;
  notifySuccess: NotifyFn;
}

const UserProfilesContext = React.createContext<Services | null>(null);

/**
 * Abstract external service Provider.
 */
export const UserProfilesProvider: FC<PropsWithChildren<Services>> = ({
  children,
  ...services
}) => {
  return <UserProfilesContext.Provider value={services}>{children}</UserProfilesContext.Provider>;
};

/**
 * Kibana-specific service types.
 */
export interface UserProfilesKibanaDependencies {
  /** CoreStart contract */
  core: {
    notifications: NotificationsStart;
    theme: ThemeServiceStart;
    userProfile: UserProfileService;
    i18n: I18nStart;
  };
  security: {
    userProfiles: UserProfileAPIClient;
  };
  /**
   * Handler from the '@kbn/react-kibana-mount' Package
   *
   * ```
   * import { toMountPoint } from '@kbn/react-kibana-mount';
   * ```
   */
  toMountPoint: typeof toMountPoint;
}

/**
 * Kibana-specific Provider that maps to known dependency types.
 */
export const UserProfilesKibanaProvider: FC<PropsWithChildren<UserProfilesKibanaDependencies>> = ({
  children,
  ...services
}) => {
  const {
    core: { notifications },
    security: { userProfiles: userProfileApiClient },
  } = services;

  return (
    <UserProfilesProvider
      userProfileApiClient={userProfileApiClient}
      notifySuccess={({ title, text, actionProps }, options) => {
        const toastOptions: ToastOptions = {};
        if (options?.durationMs) {
          toastOptions.toastLifeTimeMs = options.durationMs;
        }
        notifications.toasts.addSuccess(
          {
            title,
            text,
            actionProps,
          },
          toastOptions
        );
      }}
    >
      {children}
    </UserProfilesProvider>
  );
};

/**
 * React hook for accessing pre-wired services.
 */
export function useUserProfiles() {
  const context = useContext(UserProfilesContext);

  if (!context) {
    throw new Error(
      'UserProfilesContext is missing. Ensure your component or React root is wrapped with <UserProfilesProvider /> or <UserProfilesKibanaProvider />.'
    );
  }

  return context;
}
