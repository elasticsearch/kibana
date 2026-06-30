/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-browser-mocks';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';

import { setupPublicBaseUrlConfigWarning } from './public_base_url';

describe('publicBaseUrl warning', () => {
  const docLinks = docLinksServiceMock.createStartContract();
  const notifications = notificationServiceMock.createStartContract();
  const i18nStart = i18nServiceMock.createStartContract();
  const analytics = analyticsServiceMock.createAnalyticsServiceStart();
  const theme = themeServiceMock.createStartContract();
  const userProfile = userProfileServiceMock.createStart();
  const startServices = { notifications, analytics, i18n: i18nStart, theme, userProfile };
  const addWarningToastSpy = jest.spyOn(notifications.toasts, 'addWarning');

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('does not show any toast on localhost', () => {
    const http = httpServiceMock.createStartContract();

    setupPublicBaseUrlConfigWarning({
      ...startServices,
      docLinks,
      http,
      location: {
        hostname: 'localhost',
      } as Location,
    });

    expect(addWarningToastSpy).not.toHaveBeenCalled();
  });

  it('does not show any toast on 127.0.0.1', () => {
    const http = httpServiceMock.createStartContract();

    setupPublicBaseUrlConfigWarning({
      ...startServices,
      docLinks,
      http,
      location: {
        hostname: '127.0.0.1',
      } as Location,
    });

    expect(addWarningToastSpy).not.toHaveBeenCalled();
  });

  it('does not show toast if configured correctly', () => {
    const http = httpServiceMock.createStartContract({ publicBaseUrl: 'http://myhost.com' });

    setupPublicBaseUrlConfigWarning({
      ...startServices,
      docLinks,
      http,
      location: {
        hostname: 'myhost.com',
        toString() {
          return 'http://myhost.com/';
        },
      } as Location,
    });

    expect(addWarningToastSpy).not.toHaveBeenCalled();
  });

  describe('config missing toast', () => {
    it('adds toast if publicBaseUrl is missing', () => {
      const http = httpServiceMock.createStartContract({ publicBaseUrl: undefined });

      setupPublicBaseUrlConfigWarning({
        ...startServices,
        docLinks,
        http,
        location: {
          hostname: 'myhost.com',
          toString() {
            return 'http://myhost.com/';
          },
        } as Location,
      });

      expect(addWarningToastSpy).toHaveBeenCalledWith({
        title: 'Configuration recommended',
        text: expect.any(Function),
        actionProps: {
          primary: expect.objectContaining({
            id: 'mute',
            'data-test-subj': 'mutePublicBaseUrlWarningButton',
          }),
        },
      });
    });

    it('does not add toast if storage key set', () => {
      const http = httpServiceMock.createStartContract({ publicBaseUrl: undefined });

      setupPublicBaseUrlConfigWarning({
        ...startServices,
        docLinks,
        http,
        location: {
          hostname: 'myhost.com',
          toString() {
            return 'http://myhost.com/';
          },
        } as Location,
        storage: {
          getItem: (_id: string) => 'true',
        } as Storage,
      });

      expect(addWarningToastSpy).not.toHaveBeenCalled();
    });
  });
});
