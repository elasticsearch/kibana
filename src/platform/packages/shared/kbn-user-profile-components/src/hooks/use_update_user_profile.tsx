/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { merge } from 'lodash';
import { useCallback, useEffect, useRef, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';

import type { UserProfileData } from '@kbn/core-user-profile-common';
import { i18n } from '@kbn/i18n';

import { useUserProfiles } from '../services';

interface Props {
  notificationSuccess?: {
    /** Flag to indicate if a notification is shown after update. Default: `true` */
    enabled?: boolean;
    /** Customize the title of the notification */
    title?: string;
    /** Customize the "page reload needed" text of the notification */
    pageReloadText?: string;
  };
  /** Predicate to indicate if the update requires a page reload */
  pageReloadChecker?: (
    previous: UserProfileData | null | undefined,
    next: UserProfileData
  ) => boolean;
}

const i18nTexts = {
  notificationSuccess: {
    title: i18n.translate(
      'userProfileComponents.updateUserProfile.notification.submitSuccessTitle',
      {
        defaultMessage: 'Profile updated',
      }
    ),
    pageReloadText: i18n.translate(
      'userProfileComponents.updateUserProfile.notification.requiresPageReloadDescription',
      {
        defaultMessage: 'One or more settings require you to reload the page to take effect.',
      }
    ),
  },
};

export const useUpdateUserProfile = ({
  notificationSuccess = {},
  pageReloadChecker,
}: Props = {}) => {
  const { userProfileApiClient, notifySuccess } = useUserProfiles();
  const { userProfile$, enabled$, userProfileLoaded$ } = userProfileApiClient;
  const {
    enabled: notificationSuccessEnabled = true,
    title: notificationTitle = i18nTexts.notificationSuccess.title,
    pageReloadText = i18nTexts.notificationSuccess.pageReloadText,
  } = notificationSuccess;
  const [isLoading, setIsLoading] = useState(false);
  const userProfileData = useObservable(userProfile$);
  const userProfileEnabled = useObservable(enabled$);
  const userProfileLoaded = useObservable(userProfileLoaded$, false);
  // Keep a snapshot before updating the user profile so we can compare previous and updated values
  const userProfileSnapshot = useRef<UserProfileData | null>();
  const isMounted = useRef(false);

  const showSuccessNotification = useCallback(
    ({ isRefreshRequired = false }: { isRefreshRequired?: boolean } = {}) => {
      if (isRefreshRequired) {
        notifySuccess(
          {
            title: notificationTitle,
            text: pageReloadText,
            actionProps: {
              primary: {
                onClick: () => window.location.reload(),
                'data-test-subj': 'windowReloadButton',
                autoFocus: true,
                children: i18n.translate(
                  'userProfileComponents.updateUserProfile.notification.requiresPageReloadButtonLabel',
                  { defaultMessage: 'Reload page' }
                ),
              },
            },
          },
          {
            durationMs: 1000 * 60 * 5,
          }
        );
      } else {
        notifySuccess({ title: notificationTitle });
      }
    },
    [notificationTitle, notifySuccess, pageReloadText]
  );

  const onUserProfileUpdate = useCallback(
    (updatedData: NonNullable<UserProfileData>) => {
      if (isMounted.current) {
        setIsLoading(false);
      }

      if (notificationSuccessEnabled) {
        const isRefreshRequired = pageReloadChecker?.(userProfileSnapshot.current, updatedData);
        showSuccessNotification({ isRefreshRequired });
      }
    },
    [notificationSuccessEnabled, showSuccessNotification, pageReloadChecker]
  );

  const update = useCallback(
    <D extends Partial<NonNullable<UserProfileData>>>(updatedData: D) => {
      userProfileSnapshot.current = merge({}, userProfileData);
      setIsLoading(true);
      return userProfileApiClient.partialUpdate(updatedData).then(() => {
        onUserProfileUpdate(updatedData);
        return updatedData;
      });
    },
    [userProfileApiClient, onUserProfileUpdate, userProfileData]
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    /** Update the user profile */
    update,
    /** Handler to show a notification after the user profile has been updated */
    showSuccessNotification,
    /** The current user profile data */
    userProfileData,
    /** Flag to indicate if currently updating */
    isLoading,
    /** Flag to indicate if user profile is enabled */
    userProfileEnabled,
    /** Flag to indicate if the user profile has been loaded */
    userProfileLoaded,
  };
};

export type UpdateUserProfileHook = typeof useUpdateUserProfile;
