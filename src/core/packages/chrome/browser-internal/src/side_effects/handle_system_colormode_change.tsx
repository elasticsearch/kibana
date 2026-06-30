/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import { take, type Observable } from 'rxjs';
import { browsersSupportsSystemTheme } from '@kbn/core-theme-browser-internal';
import type { InternalHttpStart } from '@kbn/core-http-browser-internal';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { Logger } from '@kbn/logging';

const doSyncWithSystem = (
  userSettings: { darkMode?: string } = { darkMode: 'space_default' },
  uiSettingsDarkModeValue: string = 'disabled'
): boolean => {
  const { darkMode: userProfileDarkModeValue = 'space_default' } = userSettings;

  if (userProfileDarkModeValue.toUpperCase() === 'SYSTEM') {
    return true;
  }

  if (
    userProfileDarkModeValue.toUpperCase() === 'SPACE_DEFAULT' &&
    uiSettingsDarkModeValue.toUpperCase() === 'SYSTEM'
  ) {
    return true;
  }

  return false;
};

const isUnauthenticated = (http: InternalHttpStart) => {
  const { anonymousPaths } = http;
  return anonymousPaths.isAnonymous(window.location.pathname);
};

const doHandle = async ({
  http,
  coreStart,
  uiSettings,
}: {
  http: InternalHttpStart;
  uiSettings: IUiSettingsClient;
  coreStart: {
    i18n: I18nStart;
    theme: ThemeServiceStart;
    userProfile: UserProfileService;
  };
}) => {
  if (!browsersSupportsSystemTheme()) return false;
  if (isUnauthenticated(http)) return false;

  const userProfile = await coreStart.userProfile.getCurrent<{
    userSettings: { darkMode?: string };
  }>({
    dataPath: 'userSettings',
  });
  const { userSettings } = userProfile.data;

  if (!doSyncWithSystem(userSettings, uiSettings.get('theme:darkMode'))) return false;

  return true;
};

export function handleSystemColorModeChange({
  getNotifications,
  uiSettings,
  coreStart,
  stop$,
  http,
  logger,
}: {
  getNotifications: () => Promise<NotificationsStart>;
  http: InternalHttpStart;
  uiSettings: IUiSettingsClient;
  coreStart: {
    i18n: I18nStart;
    theme: ThemeServiceStart;
    userProfile: UserProfileService;
  };
  stop$: Observable<void>;
  logger: Logger;
}): void {
  void doHandle({ http, uiSettings, coreStart })
    .then((shouldHandle) => {
      if (!shouldHandle) {
        return;
      }

      let currentDarkModeValue: boolean | undefined;
      const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');

      const onDarkModeChange = ({ matches: isDarkMode }: { matches: boolean }) => {
        if (currentDarkModeValue === undefined) {
          // The current value can only be set on page reload as that's the moment when
          // we actually apply set the dark/light color mode of the page.
          currentDarkModeValue = isDarkMode;
        } else if (currentDarkModeValue !== isDarkMode) {
          void getNotifications()
            .then((notifications) => {
              notifications.toasts.addInfo(
                {
                  title: i18n.translate(
                    'core.ui.chrome.appearanceChange.successNotificationTitle',
                    {
                      defaultMessage: 'System color mode updated',
                    }
                  ),
                  text: i18n.translate('core.ui.chrome.appearanceChange.successNotificationText', {
                    defaultMessage: 'Reload the page to see the changes',
                  }),
                  actionProps: {
                    primary: {
                      onClick: () => window.location.reload(),
                      'data-test-subj': 'windowReloadButton',
                      autoFocus: true,
                      children: i18n.translate(
                        'core.ui.chrome.appearanceChange.requiresPageReloadButtonLabel',
                        { defaultMessage: 'Reload page' }
                      ),
                    },
                  },
                },
                { toastLifeTimeMs: Infinity } // leave it on until discard or page reload
              );
            })
            .catch((error) => {
              logger.error(error);
            });
        }
      };

      onDarkModeChange(matchMedia);

      matchMedia.addEventListener('change', onDarkModeChange);

      stop$.pipe(take(1)).subscribe(() => {
        matchMedia.removeEventListener('change', onDarkModeChange);
      });
    })
    .catch((error) => {
      logger.error(error);
    });
}
