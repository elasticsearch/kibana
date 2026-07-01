/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';

import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { IUserStorageClient } from '@kbn/core-user-storage-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import { i18n } from '@kbn/i18n';
import { useObservable } from '@kbn/use-observable';

import {
  DATE_RANGE_PICKER_PRESETS_KEY,
  DEFAULT_STORED_PRESETS,
  MAX_PRESETS,
  type PresetItem,
  type StoredPresets,
  normalize,
} from '@kbn/date-range-picker-presets-common';
import { mapQuickRanges, TIMEPICKER_QUICK_RANGES_SETTING, type QuickRange } from './quick_ranges';

export interface UseDateRangePickerPresetsArgs {
  userStorage: IUserStorageClient | null;
  uiSettings: IUiSettingsClient;
  userProfile?: UserProfileService;
  notifications: NotificationsStart;
}

export interface UseDateRangePickerPresetsResult {
  presets: PresetItem[];
  onPresetSave?: (option: PresetItem) => void;
  onPresetDelete?: (option: PresetItem) => void;
}

const getPresetKey = ({ start, end }: Pick<PresetItem, 'start' | 'end'>): string =>
  `${start}|${end}`;

const toPresetItem = ({ start, end, label }: PresetItem): PresetItem => ({
  start,
  end,
  ...(label ? { label } : {}),
});

export const useDateRangePickerPresets = ({
  userStorage,
  uiSettings,
  userProfile,
  notifications,
}: UseDateRangePickerPresetsArgs): UseDateRangePickerPresetsResult => {
  const userProfile$ = useMemo(
    () => (userProfile ? userProfile.getUserProfile$() : of(undefined)),
    [userProfile]
  );
  const userProfileData = useObservable(userProfile$);

  const quickRanges = useMemo(
    () => mapQuickRanges(uiSettings.get<QuickRange[]>(TIMEPICKER_QUICK_RANGES_SETTING) ?? []),
    [uiSettings]
  );

  const storedPresets$ = useMemo(
    () =>
      userStorage
        ? userStorage.get$<StoredPresets>(DATE_RANGE_PICKER_PRESETS_KEY, DEFAULT_STORED_PRESETS)
        : of(DEFAULT_STORED_PRESETS),
    [userStorage]
  );

  const storedPresets = normalize(useObservable(storedPresets$, DEFAULT_STORED_PRESETS));
  const presets = storedPresets.presets ?? quickRanges;
  const canWrite = Boolean(userStorage && userProfileData);

  const getMutationBase = useCallback((): PresetItem[] => {
    if (!userStorage) {
      return quickRanges;
    }

    const cachedStoredPresets = normalize(
      userStorage.peek<StoredPresets>(DATE_RANGE_PICKER_PRESETS_KEY, DEFAULT_STORED_PRESETS)
    );

    return cachedStoredPresets.presets ?? quickRanges;
  }, [quickRanges, userStorage]);

  const persistPresets = useCallback(
    async (nextPresets: PresetItem[]): Promise<void> => {
      if (!userStorage) {
        return;
      }

      try {
        await userStorage.set<StoredPresets>(DATE_RANGE_PICKER_PRESETS_KEY, {
          version: 1,
          presets: nextPresets.map(toPresetItem),
        });
      } catch {
        notifications.toasts.addDanger(
          i18n.translate('sharedUXPackages.dateRangePickerPresets.persistFailureErrorMessage', {
            defaultMessage: 'Unable to update date range presets.',
          })
        );
      }
    },
    [notifications.toasts, userStorage]
  );

  const onPresetSave = useMemo(() => {
    if (!canWrite) {
      return undefined;
    }

    return (option: PresetItem) => {
      const base = getMutationBase();
      const nextPresetKey = getPresetKey(option);
      const alreadySaved = base.some((preset) => getPresetKey(preset) === nextPresetKey);

      if (alreadySaved) {
        return;
      }

      if (base.length >= MAX_PRESETS) {
        notifications.toasts.addWarning(
          i18n.translate(
            'sharedUXPackages.dateRangePickerPresets.maximumPresetsReachedErrorMessage',
            {
              defaultMessage: 'Maximum of 40 date range presets reached.',
            }
          )
        );
        return;
      }

      void persistPresets([...base, option]);
    };
  }, [canWrite, getMutationBase, notifications.toasts, persistPresets]);

  const onPresetDelete = useMemo(() => {
    if (!canWrite) {
      return undefined;
    }

    return (option: PresetItem) => {
      const presetKeyToDelete = getPresetKey(option);
      const nextPresets = getMutationBase().filter(
        (preset) => getPresetKey(preset) !== presetKeyToDelete
      );

      void persistPresets(nextPresets);
    };
  }, [canWrite, getMutationBase, persistPresets]);

  return {
    presets,
    onPresetSave,
    onPresetDelete,
  };
};
