/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, Subject, type Observable } from 'rxjs';

import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { IUserStorageClient, UserStorageUpdate } from '@kbn/core-user-storage-browser';

import {
  DATE_RANGE_PICKER_PRESETS_KEY,
  DEFAULT_STORED_PRESETS,
  MAX_PRESETS,
  type StoredPresets,
} from '@kbn/date-range-picker-presets-common';
import { useDateRangePickerPresets } from './use_date_range_picker_presets';

const quickRanges = [
  { from: 'now/d', to: 'now/d', display: 'Today' },
  { from: 'now-15m', to: 'now', display: 'Last 15 minutes' },
];

const quickRangePresets = [
  { start: 'now/d', end: 'now/d', label: 'Today' },
  { start: 'now-15m', end: 'now', label: 'Last 15 minutes' },
];

class TestUserStorage implements IUserStorageClient {
  private readonly storedPresets$ = new BehaviorSubject<StoredPresets>(DEFAULT_STORED_PRESETS);

  public readonly setMock = jest.fn(async <T = unknown>(_key: string, value: T): Promise<T> => {
    this.storedPresets$.next(value as StoredPresets);
    return value;
  });

  public peek<T = unknown>(_key: string, defaultValue?: T): T | undefined {
    return (this.storedPresets$.getValue() ?? defaultValue) as T | undefined;
  }

  public get<T = unknown>(_key: string, defaultValue?: T): T | undefined {
    return (this.storedPresets$.getValue() ?? defaultValue) as T | undefined;
  }

  public get$<T = unknown>(): Observable<T> {
    return this.storedPresets$.asObservable() as Observable<T>;
  }

  public set<T = unknown>(key: string, value: T): Promise<T> {
    return this.setMock(key, value);
  }

  public async remove(_key: string): Promise<void> {}

  public getUpdate$(): Observable<UserStorageUpdate> {
    return new Subject<UserStorageUpdate>();
  }

  public getHttpError$() {
    return new Subject<Error>();
  }

  public setStoredPresets(storedPresets: StoredPresets): void {
    this.storedPresets$.next(storedPresets);
  }
}

const createUiSettings = (): IUiSettingsClient =>
  ({
    get: jest.fn(() => quickRanges),
  } as unknown as IUiSettingsClient);

const createUserProfile = (profile: {} | null = {}): UserProfileService =>
  ({
    getUserProfile$: jest.fn(() => new BehaviorSubject(profile).asObservable()),
  } as unknown as UserProfileService);

const createNotifications = (): NotificationsStart =>
  ({
    toasts: {
      addDanger: jest.fn(),
      addWarning: jest.fn(),
    },
  } as unknown as NotificationsStart);

const renderPresetsHook = ({
  userStorage = new TestUserStorage(),
  userProfile = createUserProfile(),
  notifications = createNotifications(),
}: {
  userStorage?: IUserStorageClient | null;
  userProfile?: UserProfileService;
  notifications?: NotificationsStart;
} = {}) => {
  const uiSettings = createUiSettings();

  const hook = renderHook(() =>
    useDateRangePickerPresets({
      userStorage,
      uiSettings,
      userProfile,
      notifications,
    })
  );

  return {
    ...hook,
    notifications,
    uiSettings,
    userStorage,
  };
};

describe('useDateRangePickerPresets', () => {
  it('uses quick ranges while stored presets are unseeded', () => {
    const { result } = renderPresetsHook();

    expect(result.current.presets).toEqual(quickRangePresets);
  });

  it('uses stored presets once the user owns the list', async () => {
    const userStorage = new TestUserStorage();
    const storedPreset = { start: 'now-7d', end: 'now', label: 'Last 7 days' };

    userStorage.setStoredPresets({ version: 1, presets: [storedPreset] });

    const { result } = renderPresetsHook({ userStorage });

    await waitFor(() => expect(result.current.presets).toEqual([storedPreset]));
  });

  it('materializes quick ranges and appends on save', async () => {
    const userStorage = new TestUserStorage();
    const option = { start: 'now-30d', end: 'now', label: 'Last 30 days' };
    const { result } = renderPresetsHook({ userStorage });

    act(() => {
      result.current.onPresetSave?.(option);
    });

    await waitFor(() =>
      expect(userStorage.setMock).toHaveBeenCalledWith(DATE_RANGE_PICKER_PRESETS_KEY, {
        version: 1,
        presets: [...quickRangePresets, option],
      })
    );
    expect(result.current.presets).toEqual([...quickRangePresets, option]);
  });

  it('persists display labels on save', async () => {
    const userStorage = new TestUserStorage();
    const option = {
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-05-02T23:59:00.000Z',
      label: 'May 1, 00:00 → May 2, 23:59',
    };
    const { result } = renderPresetsHook({ userStorage });

    act(() => {
      result.current.onPresetSave?.(option);
    });

    await waitFor(() =>
      expect(userStorage.setMock).toHaveBeenCalledWith(DATE_RANGE_PICKER_PRESETS_KEY, {
        version: 1,
        presets: [...quickRangePresets, option],
      })
    );
  });

  it('deduplicates saves by start and end', () => {
    const userStorage = new TestUserStorage();
    const { result } = renderPresetsHook({ userStorage });

    act(() => {
      result.current.onPresetSave?.({ start: 'now/d', end: 'now/d', label: 'Today again' });
    });

    expect(userStorage.setMock).not.toHaveBeenCalled();
  });

  it('persists a deleted preset', async () => {
    const userStorage = new TestUserStorage();
    const { result } = renderPresetsHook({ userStorage });

    act(() => {
      result.current.onPresetDelete?.(quickRangePresets[0]);
    });

    await waitFor(() =>
      expect(userStorage.setMock).toHaveBeenCalledWith(DATE_RANGE_PICKER_PRESETS_KEY, {
        version: 1,
        presets: [quickRangePresets[1]],
      })
    );
  });

  it('shows a warning instead of writing past the cap', () => {
    const userStorage = new TestUserStorage();
    const notifications = createNotifications();
    const cappedPresets = Array.from({ length: MAX_PRESETS }, (_, i) => ({
      start: `now-${i}d`,
      end: 'now',
      label: `Preset ${i}`,
    }));
    userStorage.setStoredPresets({ version: 1, presets: cappedPresets });
    const { result } = renderPresetsHook({ userStorage, notifications });

    act(() => {
      result.current.onPresetSave?.({ start: 'now-100d', end: 'now', label: 'Too many' });
    });

    expect(userStorage.setMock).not.toHaveBeenCalled();
    expect(notifications.toasts.addWarning).toHaveBeenCalledWith(
      'Maximum of 40 date range presets reached.'
    );
  });

  it('returns read-only quick ranges when userStorage is disabled', () => {
    const { result } = renderPresetsHook({ userStorage: null });

    expect(result.current.presets).toEqual(quickRangePresets);
    expect(result.current.onPresetSave).toBeUndefined();
    expect(result.current.onPresetDelete).toBeUndefined();
  });

  it('returns read-only quick ranges when there is no user profile', () => {
    const { result } = renderPresetsHook({ userProfile: createUserProfile(null) });

    expect(result.current.presets).toEqual(quickRangePresets);
    expect(result.current.onPresetSave).toBeUndefined();
    expect(result.current.onPresetDelete).toBeUndefined();
  });

  it('shows a danger toast when persistence fails', async () => {
    const userStorage = new TestUserStorage();
    const notifications = createNotifications();
    userStorage.setMock.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderPresetsHook({ userStorage, notifications });

    act(() => {
      result.current.onPresetSave?.({ start: 'now-30d', end: 'now', label: 'Last 30 days' });
    });

    await waitFor(() =>
      expect(notifications.toasts.addDanger).toHaveBeenCalledWith(
        'Unable to update date range presets.'
      )
    );
  });
});
