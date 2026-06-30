/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useState } from 'react';
import { useUpdateUserProfile, type UserSettingsData } from '@kbn/user-profile-components';

interface UseUserProfileSettingOptions<T> {
  /** The key in `userSettings` to read/write (e.g., 'locale') */
  settingKey: keyof UserSettingsData;
  /** Default value when the setting is not yet stored */
  defaultValue: T;
  /** Notification strings shown after a successful save */
  notification: {
    title: string;
    pageReloadText: string;
  };
}

export interface UseUserProfileSettingResult<T> {
  value: T;
  initialValue: T;
  isVisible: boolean;
  isLoading: boolean;
  onChange: (newValue: T, persist: boolean) => Promise<unknown> | void;
}

/**
 * Generic hook for managing a single user profile setting.
 * Handles optimistic updates, persistence, and initial value tracking.
 */
export function useUserProfileSetting<T extends string>({
  settingKey,
  defaultValue,
  notification,
}: UseUserProfileSettingOptions<T>): UseUserProfileSettingResult<T> {
  const { userProfileData, isLoading, update, userProfileLoaded } = useUpdateUserProfile({
    notificationSuccess: {
      title: notification.title,
      pageReloadText: notification.pageReloadText,
    },
    pageReloadChecker: (prev, next) => {
      return prev?.userSettings?.[settingKey] !== next.userSettings?.[settingKey];
    },
  });

  const profileValue =
    (userProfileData?.userSettings?.[settingKey] as T | undefined) ?? defaultValue;

  const [value, setValue] = useState<T>(profileValue);
  const [initialValue, setInitialValue] = useState<T>(profileValue);

  const onChange = useCallback(
    (newValue: T, persist: boolean) => {
      if (isLoading) {
        return;
      }

      setValue(newValue);

      if (!persist) {
        return;
      }

      return update({
        userSettings: {
          [settingKey]: newValue,
        },
      });
    },
    [isLoading, settingKey, update]
  );

  useEffect(() => {
    setValue(profileValue);
    if (userProfileLoaded) {
      const stored = userProfileData?.userSettings?.[settingKey] as T | undefined;
      if (stored) {
        setInitialValue(stored);
      }
    }
  }, [profileValue, settingKey, userProfileData, userProfileLoaded]);

  return {
    value,
    initialValue,
    isVisible: Boolean(userProfileData),
    isLoading,
    onChange,
  };
}
