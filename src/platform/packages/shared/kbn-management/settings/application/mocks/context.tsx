/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactChild } from 'react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';

import { KibanaRootContextProvider } from '@kbn/react-kibana-context-root';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import type { I18nStart } from '@kbn/core-i18n-browser';

import { createFormServicesMock } from '@kbn/management-settings-components-form/mocks';
import { Subscription } from 'rxjs';
import {
  getGlobalSettingsMock,
  getSettingsMock,
} from '@kbn/management-settings-utilities/mocks/settings.mock';
import type { UiSettingsScope } from '@kbn/core-ui-settings-common';
import { getSettingsCapabilitiesMock } from '@kbn/management-settings-utilities/mocks/capabilities.mock';
import type { UiSettingsSolutions } from '@kbn/core-ui-settings-common';
import type { SolutionView } from '@kbn/spaces-plugin/common';
import type { SettingsApplicationServices } from '../services';
import { SettingsApplicationProvider } from '../services';

const createRootMock = () => {
  const analytics = analyticsServiceMock.createAnalyticsServiceStart();
  const i18n: I18nStart = {
    Context: ({ children }) => <I18nProvider>{children}</I18nProvider>,
  };
  const theme = themeServiceMock.createStartContract();
  const userProfile = userProfileServiceMock.createStart();
  return {
    analytics,
    i18n,
    theme,
    userProfile,
  };
};

export const createSettingsApplicationServicesMock = (
  hasGlobalSettings?: boolean,
  settingsSolution?: UiSettingsSolutions,
  spaceSolution: SolutionView = 'classic'
): SettingsApplicationServices => ({
  ...createFormServicesMock(),
  getAllowlistedSettings: (scope: UiSettingsScope) =>
    Promise.resolve(
      scope === 'namespace'
        ? getSettingsMock(undefined, undefined, settingsSolution)
        : hasGlobalSettings
        ? getGlobalSettingsMock(undefined, undefined, settingsSolution)
        : {}
    ),
  getSections: () => [],
  getCapabilities: getSettingsCapabilitiesMock,
  setBadge: jest.fn(),
  isCustomSetting: () => false,
  isOverriddenSetting: () => false,
  subscribeToUpdates: () => new Subscription(),
  addUrlToHistory: jest.fn(),
  getToastsService: jest.fn(),
  getActiveSpace: () =>
    Promise.resolve({
      solution: spaceSolution,
    }),
  subscribeToActiveSpace: () => new Subscription(),
});

export const TestWrapper = ({
  children,
  services = createSettingsApplicationServicesMock(),
}: {
  children: ReactChild;
  services?: SettingsApplicationServices;
}) => {
  return (
    <KibanaRootContextProvider {...createRootMock()}>
      <SettingsApplicationProvider {...services}>{children}</SettingsApplicationProvider>
    </KibanaRootContextProvider>
  );
};

export const wrap = (
  component: JSX.Element,
  services: SettingsApplicationServices = createSettingsApplicationServicesMock()
) => <TestWrapper services={services} children={component} />;
