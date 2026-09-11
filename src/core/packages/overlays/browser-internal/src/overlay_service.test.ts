/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import './overlay.test.mocks';
import React from 'react';
import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import { OverlayService } from './overlay_service';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    getFlyoutManagerStore: jest.fn(() => ({
      subscribeToEvents: jest.fn(() => () => {}),
      subscribe: jest.fn(() => () => {}),
      getState: jest.fn(() => ({ containerElement: null })),
    })),
  };
});

const mountText = (text: string) => (container: HTMLElement) => {
  const content = document.createElement('span');
  content.textContent = text;
  container.append(content);
  return () => {};
};

const getService = () => {
  const service = new OverlayService();
  const overlays = service.start({
    analytics: analyticsServiceMock.createAnalyticsServiceStart(),
    i18n: i18nServiceMock.createStartContract(),
    theme: themeServiceMock.createStartContract(),
    userProfile: userProfileServiceMock.createStart(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    targetDomElement: document.createElement('div'),
  });
  return { service, overlays };
};

describe('OverlayService', () => {
  describe('closeAllFlyouts()', () => {
    it('closes an open legacy flyout', async () => {
      const { service, overlays } = getService();
      const ref = overlays.openFlyout(mountText('Flyout content'));
      const onCloseComplete = jest.fn();
      ref.onClose.then(onCloseComplete);

      service.closeAllFlyouts();

      await ref.onClose;
      expect(onCloseComplete).toHaveBeenCalledTimes(1);
    });

    it('closes an open system flyout', async () => {
      const { service, overlays } = getService();
      const ref = overlays.openSystemFlyout(React.createElement('div', null, 'System flyout'));
      const onCloseComplete = jest.fn();
      ref.onClose.then(onCloseComplete);

      service.closeAllFlyouts();

      await ref.onClose;
      expect(onCloseComplete).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when no flyouts are open', () => {
      const { service } = getService();
      expect(() => service.closeAllFlyouts()).not.toThrow();
    });
  });
});
