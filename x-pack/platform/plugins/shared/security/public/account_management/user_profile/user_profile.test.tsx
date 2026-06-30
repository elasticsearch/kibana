/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, render, renderHook, screen, within } from '@testing-library/react';
import type { FC, PropsWithChildren } from 'react';
import React from 'react';

import { coreMock, scopedHistoryMock } from '@kbn/core/public/mocks';

import { UserProfile, useUserProfileForm } from './user_profile';
import { UserProfileAPIClient } from '..';
import type { UserProfileData } from '../../../common';
import { mockAuthenticatedUser } from '../../../common/model/authenticated_user.mock';
import { UserAPIClient } from '../../management';
import { securityMock } from '../../mocks';
import { Providers } from '../account_management_app';

const user = mockAuthenticatedUser();
const coreStart = coreMock.createStart();
let history = scopedHistoryMock.create();
const authc = securityMock.createSetup().authc;

const wrapper: FC<PropsWithChildren<unknown>> = ({ children }) => (
  <Providers
    services={coreStart}
    history={history}
    authc={authc}
    securityApiClients={{
      userProfiles: new UserProfileAPIClient(coreStart.http),
      users: new UserAPIClient(coreStart.http),
    }}
  >
    {children}
  </Providers>
);
describe('useUserProfileForm', () => {
  beforeEach(() => {
    history = scopedHistoryMock.create();
    authc.getCurrentUser.mockReset();
    // @ts-ignore Capabilities are marked as readonly without a way of overriding.
    coreStart.application.capabilities = {
      management: {
        security: {
          users: true,
        },
      },
    };
    coreStart.http.delete.mockReset();
    coreStart.http.get.mockReset();
    coreStart.http.post.mockReset().mockResolvedValue(undefined);
    coreStart.notifications.toasts.addDanger.mockReset();
    coreStart.notifications.toasts.addSuccess.mockReset();
    coreStart.settings.client.get.mockReset();
    coreStart.settings.client.isOverridden.mockReset();
    coreStart.analytics.reportEvent.mockReset();
  });

  it('should initialise form with values from user profile', () => {
    const data: UserProfileData = {
      avatar: {},
    };
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    expect(result.current.values).toMatchInlineSnapshot(`
      Object {
        "avatarType": "initials",
        "data": Object {
          "avatar": Object {
            "color": "#61A2FF",
            "imageUrl": "",
            "initials": "fn",
          },
          "userSettings": Object {
            "contrastMode": "system",
            "darkMode": "system",
            "locale": "en",
            "rememberSelectedSpace": true,
          },
        },
        "user": Object {
          "email": "email",
          "full_name": "full name",
        },
      }
    `);
  });

  it('should initialise rememberSelectedSpace from user profile data', () => {
    const data: UserProfileData = {
      avatar: {},
      userSettings: {
        rememberSelectedSpace: true,
      },
    };
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    expect(result.current.values.data?.userSettings?.rememberSelectedSpace).toBe(true);
  });

  it('should initialise form with values from user avatar if present', () => {
    const data: UserProfileData = {
      avatar: {
        imageUrl: 'avatar.png',
      },
    };
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    expect(result.current.values).toEqual(
      expect.objectContaining({
        avatarType: 'image',
        data: expect.objectContaining({
          avatar: expect.objectContaining({
            imageUrl: 'avatar.png',
          }),
        }),
      })
    );
  });

  it('should update initials when full name changes', async () => {
    const data: UserProfileData = {};
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    await act(async () => {
      await result.current.setFieldValue('user.full_name', 'Another Name');
    });

    expect(result.current.values.user.full_name).toEqual('Another Name');
    expect(result.current.values.data?.avatar.initials).toEqual('AN');
  });

  it('should save user and user profile when submitting form', async () => {
    const data: UserProfileData = {};
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    await act(async () => {
      await result.current.submitForm();
    });

    expect(coreStart.http.post).toHaveBeenCalledTimes(2);
  });

  it("should save user profile only when user details can't be updated", async () => {
    // @ts-ignore Capabilities are marked as readonly without a way of overriding.
    coreStart.application.capabilities = {
      management: {
        security: {
          users: false,
        },
      },
    };

    const data: UserProfileData = {};
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    await act(async () => {
      await result.current.submitForm();
    });

    expect(coreStart.http.post).toHaveBeenCalledTimes(1);
  });

  it('should add toast after submitting form successfully', async () => {
    const data: UserProfileData = {};
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    await act(async () => {
      await result.current.submitForm();
    });

    expect(coreStart.notifications.toasts.addSuccess).toHaveBeenCalledTimes(1);
  });

  it('should add toast after submitting form failed', async () => {
    const data: UserProfileData = {};
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    coreStart.http.post.mockRejectedValue(new Error('Error'));

    await act(async () => {
      await result.current.submitForm();
    });

    expect(coreStart.notifications.toasts.addError).toHaveBeenCalledTimes(1);
  });

  it('should set initial values to current values after submitting form successfully', async () => {
    const data: UserProfileData = {};
    const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

    await act(async () => {
      await result.current.setFieldValue('user.full_name', 'Another Name');
    });
    await act(async () => {
      await result.current.submitForm();
    });

    expect(result.current.initialValues.user.full_name).toEqual('Another Name');
  });

  describe('User Avatar Form', () => {
    it('should display if the User is not a cloud user', () => {
      const data: UserProfileData = {};

      const nonCloudUser = mockAuthenticatedUser({ elastic_cloud_user: false });

      const { container } = render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={nonCloudUser} data={data} />
          </Providers>
        )
      );

      expect(container.querySelector('.euiAvatar')).toBeInTheDocument();
    });

    it('should not display if the User is a cloud user', () => {
      const data: UserProfileData = {};

      const cloudUser = mockAuthenticatedUser({ elastic_cloud_user: true });

      const { container } = render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={cloudUser} data={data} />
          </Providers>
        )
      );

      expect(container.querySelector('.euiAvatar')).not.toBeInTheDocument();
    });
  });

  describe('Dark Mode Form', () => {
    it('should display if the User is not a cloud user', () => {
      const data: UserProfileData = {};

      const nonCloudUser = mockAuthenticatedUser({ elastic_cloud_user: false });

      render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={nonCloudUser} data={data} />
          </Providers>
        )
      );

      const themeMenu = screen.getByTestId('themeMenu');
      expect(themeMenu).toBeInTheDocument();
      expect(themeMenu.closest('.euiToolTipAnchor')).toBeNull();

      const themeItems = within(themeMenu).getAllByRole('radio');
      expect(themeItems).toHaveLength(4);
      themeItems.forEach((item) => {
        expect(item).not.toBeDisabled();
      });
    });

    it('should not display if the User is a cloud user', () => {
      const data: UserProfileData = {};

      const cloudUser = mockAuthenticatedUser({ elastic_cloud_user: true });

      render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={cloudUser} data={data} />
          </Providers>
        )
      );

      expect(screen.queryByTestId('themeMenu')).not.toBeInTheDocument();
    });

    it('should add special toast after submitting form successfully since darkMode requires a refresh', async () => {
      const data: UserProfileData = {};
      const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

      await act(async () => {
        await result.current.submitForm();
      });

      expect(coreStart.notifications.toasts.addSuccess).toHaveBeenNthCalledWith(
        1,
        { title: 'Profile updated' },
        {}
      );

      await act(async () => {
        await result.current.setFieldValue('data.userSettings.darkMode', 'dark');
      });

      await act(async () => {
        await result.current.submitForm();
      });

      expect(coreStart.notifications.toasts.addSuccess).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ title: 'Profile updated' }),
        expect.objectContaining({ toastLifeTimeMs: 300000 })
      );
    });

    it('should be disabled if the theme has been set to `darkMode: true` in the config', () => {
      const data: UserProfileData = {};

      const nonCloudUser = mockAuthenticatedUser({ elastic_cloud_user: false });
      coreStart.theme.getTheme.mockReturnValue({ darkMode: true, name: 'borealis' });
      coreStart.settings.client.isOverridden.mockReturnValue(true);

      render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={nonCloudUser} data={data} />
          </Providers>
        )
      );

      const themeMenu = screen.getByTestId('themeMenu');
      expect(themeMenu).toBeInTheDocument();
      expect(themeMenu.closest('.euiToolTipAnchor')).not.toBeNull();

      const themeItems = within(themeMenu).getAllByRole('radio');
      expect(themeItems).toHaveLength(4);
      themeItems.forEach((item) => {
        expect(item).toBeDisabled();
      });
    });

    it('should be disabled if the theme has been set to `darkMode: false` in the config', () => {
      const data: UserProfileData = {};

      const nonCloudUser = mockAuthenticatedUser({ elastic_cloud_user: false });
      coreStart.theme.getTheme.mockReturnValue({ darkMode: false, name: 'borealis' });
      coreStart.settings.client.isOverridden.mockReturnValue(true);

      render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={nonCloudUser} data={data} />
          </Providers>
        )
      );

      const themeMenu = screen.getByTestId('themeMenu');
      expect(themeMenu).toBeInTheDocument();
      expect(themeMenu.closest('.euiToolTipAnchor')).not.toBeNull();

      const themeItems = within(themeMenu).getAllByRole('radio');
      expect(themeItems).toHaveLength(4);
      themeItems.forEach((item) => {
        expect(item).toBeDisabled();
      });
    });
  });

  describe('Contrast Mode Form', () => {
    it('should add special toast after submitting form successfully since contrast mode change requires a refresh', async () => {
      const data: UserProfileData = {};
      const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

      await act(async () => {
        await result.current.submitForm();
      });

      expect(coreStart.notifications.toasts.addSuccess).toHaveBeenNthCalledWith(
        1,
        { title: 'Profile updated' },
        {}
      );

      await act(async () => {
        await result.current.setFieldValue('data.userSettings.contrastMode', 'high'); // default value is 'system'
      });

      await act(async () => {
        await result.current.submitForm();
      });

      expect(coreStart.notifications.toasts.addSuccess).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ title: 'Profile updated' }),
        expect.objectContaining({ toastLifeTimeMs: 300000 })
      );
    });
  });

  describe('Display Language Form', () => {
    it('should report display_language_changed event when locale is changed on submit', async () => {
      const data: UserProfileData = {
        userSettings: { darkMode: 'light', contrastMode: 'standard', locale: 'en' },
      };

      const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

      await act(async () => {
        await result.current.setFieldValue('data.userSettings.locale', 'fr-FR');
      });

      await act(async () => {
        await result.current.submitForm();
      });

      expect(coreStart.analytics.reportEvent).toHaveBeenCalledWith('display_language_changed', {
        from: 'en',
        to: 'fr-FR',
      });
    });

    it('should not report event when locale is unchanged on submit', async () => {
      const data: UserProfileData = {
        userSettings: { darkMode: 'light', contrastMode: 'standard', locale: 'en' },
      };

      const { result } = renderHook(() => useUserProfileForm({ user, data }), { wrapper });

      await act(async () => {
        await result.current.submitForm();
      });

      expect(coreStart.analytics.reportEvent).not.toHaveBeenCalled();
    });
  });

  describe('User roles section', () => {
    it('should display the user roles', () => {
      const data: UserProfileData = {};

      const nonCloudUser = mockAuthenticatedUser({ elastic_cloud_user: false });
      coreStart.settings.client.get.mockReturnValue(false);
      coreStart.settings.client.isOverridden.mockReturnValue(true);

      render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={nonCloudUser} data={data} />
          </Providers>
        )
      );
      expect(screen.getByTestId('userRoles')).toBeInTheDocument();

      expect(screen.queryByTestId('userRolesExpand')).not.toBeInTheDocument();
      expect(screen.queryByTestId('remainingRoles')).not.toBeInTheDocument();
    });

    it('should display a popover for users with more than three roles', () => {
      const data: UserProfileData = {};

      const nonCloudUser = mockAuthenticatedUser({ elastic_cloud_user: false });
      coreStart.settings.client.get.mockReturnValue(false);
      coreStart.settings.client.isOverridden.mockReturnValue(true);

      nonCloudUser.roles = [...nonCloudUser.roles, 'user-role-1', 'user-role-2', 'user-role-3'];
      render(
        coreStart.rendering.addContext(
          <Providers
            services={coreStart}
            history={history}
            authc={authc}
            securityApiClients={{
              userProfiles: new UserProfileAPIClient(coreStart.http),
              users: new UserAPIClient(coreStart.http),
            }}
          >
            <UserProfile user={nonCloudUser} data={data} />
          </Providers>
        )
      );

      const extraRoles = nonCloudUser.roles.splice(3);

      const userRolesExpandButton = screen.getByTestId('userRolesExpand');

      expect(userRolesExpandButton).toBeInTheDocument();
      expect(userRolesExpandButton).toHaveTextContent(`+${extraRoles.length}`);
    });
  });
});
