/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18nServiceMock } from '@kbn/core-i18n-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { handleSystemColorModeChange } from './handle_system_colormode_change';
import { ReplaySubject } from 'rxjs';
import type { GetUserProfileResponse } from '@kbn/core-user-profile-browser';
import type { UserProfileData } from '@kbn/core-user-profile-common';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';

const mockbrowsersSupportsSystemTheme = jest.fn();

jest.mock('@kbn/core-theme-browser-internal', () => {
  const original = jest.requireActual('@kbn/core-theme-browser-internal');

  return {
    ...original,
    browsersSupportsSystemTheme: () => mockbrowsersSupportsSystemTheme(),
  };
});

describe('handleSystemColorModeChange', () => {
  const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
  const originalMatchMedia = window.matchMedia;

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  const getDeps = () => {
    const coreStart = {
      i18n: i18nServiceMock.createStartContract(),
      theme: themeServiceMock.createStartContract(),
      userProfile: userProfileServiceMock.createStart(),
    };
    const notifications = notificationServiceMock.createStartContract();
    const http = httpServiceMock.createStartContract();
    const uiSettings = uiSettingsServiceMock.createStartContract();
    const stop$ = new ReplaySubject<void>(1);
    const logger = loggerMock.create();

    return {
      coreStart,
      getNotifications: () => Promise.resolve(notifications),
      http,
      uiSettings,
      stop$,
      logger,
    };
  };

  const mockMatchMedia = (matches: boolean = false, addEventListenerMock = jest.fn()) => {
    const removeEventListenerMock = jest.fn();
    window.matchMedia = jest.fn().mockImplementation(() => {
      return {
        matches,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      };
    });

    return { addEventListenerMock, removeEventListenerMock };
  };

  const mockUserProfileResponse = (
    darkMode: 'dark' | 'light' | 'system' | 'space_default'
  ): GetUserProfileResponse<UserProfileData> =>
    ({
      data: {
        userSettings: {
          darkMode,
        },
      },
    } as any);

  const mockUiSettingsDarkMode = (
    uiSettings: jest.Mocked<IUiSettingsClient>,
    darkMode: 'dark' | 'light' | 'system'
  ) => {
    uiSettings.get.mockImplementation((key) => {
      if (key === 'theme:darkMode') {
        return darkMode;
      }

      return 'foo';
    });
  };

  describe('doHandle guard', () => {
    it('does not handle if the system color mode is not supported', () => {
      const { logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia();
      expect(addEventListenerMock).not.toHaveBeenCalled();
      mockbrowsersSupportsSystemTheme.mockReturnValue(false);

      handleSystemColorModeChange({ logger } as any);

      expect(addEventListenerMock).not.toHaveBeenCalled();
    });

    it('does not handle on unauthenticated routes', () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia();
      expect(addEventListenerMock).not.toHaveBeenCalled();

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(true);

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });

      expect(addEventListenerMock).not.toHaveBeenCalled();
    });

    it('does not handle if user profile darkmode is not "system"', () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia();
      expect(addEventListenerMock).not.toHaveBeenCalled();

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue({
        data: {
          userSettings: {
            darkMode: 'light',
          },
        },
      } as any);

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });

      expect(addEventListenerMock).not.toHaveBeenCalled();
    });

    it('does not handle if user profile darkmode is "space_default" but the uiSettings darkmode is not "system"', () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia();
      expect(addEventListenerMock).not.toHaveBeenCalled();

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue({
        data: {
          userSettings: {
            darkMode: 'space_default',
          },
        },
      } as any);

      uiSettings.get.mockImplementation((key) => {
        if (key === 'theme:darkMode') {
          return 'light';
        }

        return 'foo';
      });

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });

      expect(addEventListenerMock).not.toHaveBeenCalled();
    });

    it('does handle if user profile darkmode is "system"', async () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia(false);
      expect(addEventListenerMock).not.toHaveBeenCalled();

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue(mockUserProfileResponse('system'));

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });
      await flushPromises();

      expect(addEventListenerMock).toHaveBeenCalled();
    });

    it('does handle if user profile darkmode is "space_default" and uiSetting darkmode is "system"', async () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia(false);
      expect(addEventListenerMock).not.toHaveBeenCalled();

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue(mockUserProfileResponse('space_default'));
      mockUiSettingsDarkMode(uiSettings, 'system');

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });
      await flushPromises();

      expect(addEventListenerMock).toHaveBeenCalled();
    });

    it('handles async errors internally', async () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const { addEventListenerMock } = mockMatchMedia();
      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockRejectedValue(new Error('boom'));

      expect(() =>
        handleSystemColorModeChange({
          coreStart,
          getNotifications,
          http,
          uiSettings,
          stop$,
          logger,
        })
      ).not.toThrow();

      await flushPromises();
      expect(addEventListenerMock).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(new Error('boom'));
    });
  });

  describe('onDarkModeChange()', () => {
    it('does show a toast when the system color mode changes', async () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const currentDarkMode = false; // The system is currently in light mode
      const addEventListenerMock = jest
        .fn()
        .mockImplementation(async (type: string, cb: (evt: MediaQueryListEvent) => any) => {
          expect((await getNotifications()).toasts.addSuccess).not.toHaveBeenCalled();
          expect(type).toBe('change');
          cb({ matches: true } as any); // The system changed to dark mode
          expect((await getNotifications()).toasts.addInfo).toHaveBeenCalledWith(
            expect.objectContaining({
              text: expect.any(String),
              title: 'System color mode updated',
              actionProps: expect.objectContaining({
                primary: expect.objectContaining({
                  'data-test-subj': 'windowReloadButton',
                }),
              }),
            }),
            { toastLifeTimeMs: Infinity }
          );
        });
      mockMatchMedia(currentDarkMode, addEventListenerMock);

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue(mockUserProfileResponse('system'));

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });
      await flushPromises();
      expect(addEventListenerMock).toHaveBeenCalled();
    });

    it('does **not** show a toast when the system color mode changes to the current darkmode value', async () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const currentDarkMode = true; // The system is currently in dark mode
      const addEventListenerMock = jest
        .fn()
        .mockImplementation(async (type: string, cb: (evt: MediaQueryListEvent) => any) => {
          expect((await getNotifications()).toasts.addSuccess).not.toHaveBeenCalled();
          expect(type).toBe('change');
          cb({ matches: true } as any); // The system changed to dark mode
          expect((await getNotifications()).toasts.addSuccess).not.toHaveBeenCalled();
        });
      mockMatchMedia(currentDarkMode, addEventListenerMock);

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue(mockUserProfileResponse('system'));

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });
      await flushPromises();
      expect(addEventListenerMock).toHaveBeenCalled();
    });

    it('stops listening to changes on stop$ change', async () => {
      const { coreStart, getNotifications, http, uiSettings, stop$, logger } = getDeps();
      const currentDarkMode = false; // The system is currently in light mode
      const { addEventListenerMock, removeEventListenerMock } = mockMatchMedia(currentDarkMode);

      mockbrowsersSupportsSystemTheme.mockReturnValue(true);
      http.anonymousPaths.isAnonymous.mockReturnValue(false);
      coreStart.userProfile.getCurrent.mockResolvedValue(mockUserProfileResponse('system'));

      handleSystemColorModeChange({ coreStart, getNotifications, http, uiSettings, stop$, logger });
      await flushPromises();
      expect(addEventListenerMock).toHaveBeenCalled();
      expect(removeEventListenerMock).not.toHaveBeenCalled();

      stop$.next();

      expect(removeEventListenerMock).toHaveBeenCalled();
    });
  });
});
