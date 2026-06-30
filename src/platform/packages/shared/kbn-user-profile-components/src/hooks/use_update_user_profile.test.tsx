/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { BehaviorSubject, first, lastValueFrom, of } from 'rxjs';

import { coreMock } from '@kbn/core/public/mocks';

import { useUpdateUserProfile } from './use_update_user_profile';
import { UserProfilesKibanaProvider } from '../services';

const core = coreMock.createStart();
const security = {
  authc: {},
  navControlService: {},
  userProfiles: {
    getCurrent: jest.fn(),
    bulkGet: jest.fn(),
    suggest: jest.fn(),
    update: jest.fn(),
    partialUpdate: jest.fn(),
    userProfile$: of({}),
    userProfileLoaded$: of(true),
    enabled$: of(true),
  },
  uiApi: {},
};

const { http, notifications } = core;

const wrapper = ({ children }: React.PropsWithChildren<unknown>) => (
  <UserProfilesKibanaProvider
    core={core}
    security={security}
    toMountPoint={() => () => () => undefined}
  >
    {children}
  </UserProfilesKibanaProvider>
);

describe('useUpdateUserProfile() hook', () => {
  const partialUpdateUserProfiles = jest.fn();

  beforeEach(() => {
    security.userProfiles = {
      ...security.userProfiles,
      partialUpdate: partialUpdateUserProfiles,
      userProfile$: of({}),
    };

    partialUpdateUserProfiles.mockReset().mockResolvedValue({});
    http.get.mockReset();
    http.post.mockReset().mockResolvedValue(undefined);
    notifications.toasts.addSuccess.mockReset();
  });

  test('should call the apiClient with the updated user profile data', async () => {
    const { result } = renderHook(() => useUpdateUserProfile(), { wrapper });
    const { update } = result.current;

    await act(async () => {
      update({ userSettings: { darkMode: 'dark' } });
    });

    expect(partialUpdateUserProfiles).toHaveBeenCalledWith({ userSettings: { darkMode: 'dark' } });
  });

  test('should update the isLoading state while updating', async () => {
    const updateDone = new BehaviorSubject(false);
    partialUpdateUserProfiles.mockImplementationOnce(async () => {
      await lastValueFrom(updateDone.pipe(first((v) => v === true)));
    });

    const { result } = renderHook(() => useUpdateUserProfile(), { wrapper });
    const { update } = result.current;

    expect(result.current.isLoading).toBeFalsy();

    await act(async () => {
      update({ userSettings: { darkMode: 'dark' } });
    });

    expect(result.current.isLoading).toBeTruthy();

    updateDone.next(true); // Resolve the http.post promise
    await waitFor(() => expect(result.current.isLoading).toBeFalsy());
  });

  test('should show a success notification by default', async () => {
    const { result } = renderHook(() => useUpdateUserProfile(), { wrapper });
    const { update } = result.current;

    expect(notifications.toasts.addSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await update({ userSettings: { darkMode: 'dark' } });
    });

    expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
      {
        title: 'Profile updated',
      },
      {} // toast options
    );
  });

  test('should show a notification with reload page button when refresh is required', async () => {
    const pageReloadChecker = () => {
      return true;
    };

    const { result } = renderHook(() => useUpdateUserProfile({ pageReloadChecker }), {
      wrapper,
    });
    const { update } = result.current;

    await act(async () => {
      await update({ userSettings: { darkMode: 'dark' } });
    });

    expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
      {
        title: 'Profile updated',
        text: expect.any(String),
        actionProps: {
          primary: expect.objectContaining({
            'data-test-subj': 'windowReloadButton',
            autoFocus: true,
            children: 'Reload page',
          }),
        },
      },
      {
        toastLifeTimeMs: 300000, // toast options
      }
    );
  });

  test('should pass the previous and next user profile data to the pageReloadChecker', async () => {
    const pageReloadChecker = jest.fn();

    const initialValue = { foo: 'bar' };

    security.userProfiles = {
      ...security.userProfiles,
      userProfile$: of(initialValue),
    };

    const { result } = renderHook(() => useUpdateUserProfile({ pageReloadChecker }), {
      wrapper,
    });
    const { update } = result.current;

    const nextValue = { userSettings: { darkMode: 'light' as const } };

    await act(async () => {
      await update(nextValue);
    });

    expect(pageReloadChecker).toHaveBeenCalledWith(initialValue, nextValue);
  });
});
