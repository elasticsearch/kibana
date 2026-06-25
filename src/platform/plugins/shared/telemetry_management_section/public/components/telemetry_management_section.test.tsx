/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { mountWithIntl, renderWithI18n, shallowWithIntl } from '@kbn/test-jest-helpers';
import TelemetryManagementSection from './telemetry_management_section';
import { mockTelemetryService } from '@kbn/telemetry-plugin/public/mocks';
import { coreMock } from '@kbn/core/public/mocks';
import type { DocLinksStart } from '@kbn/core/public';

describe('TelemetryManagementSectionComponent', () => {
  const coreStart = coreMock.createStart();
  const docLinks = {
    legal: { privacyStatement: 'https://some-host/some-url' },
  } as unknown as DocLinksStart['links'];

  it('renders as expected', () => {
    const telemetryService = mockTelemetryService({
      config: {
        appendServerlessChannelsSuffix: false,
        sendUsageTo: 'staging',
        banner: true,
        allowChangingOptInStatus: true,
        optIn: true,
        sendUsageFrom: 'browser',
        labels: {},
      },
      isScreenshotMode: false,
      reportOptInStatusChange: false,
      currentKibanaVersion: 'mock_kibana_version',
    });

    expect(
      shallowWithIntl(
        <TelemetryManagementSection
          telemetryService={telemetryService}
          showAppliesSettingMessage={true}
          enableSaving={true}
          toasts={coreStart.notifications.toasts}
          docLinks={docLinks}
        />
      )
    ).toMatchSnapshot();
  });

  it('renders because query matches the SEARCH_TERMS', () => {
    const telemetryService = mockTelemetryService({
      config: {
        appendServerlessChannelsSuffix: false,
        banner: true,
        allowChangingOptInStatus: true,
        optIn: false,
        sendUsageTo: 'staging',
        sendUsageFrom: 'browser',
        labels: {},
      },
      isScreenshotMode: false,
      reportOptInStatusChange: false,
      currentKibanaVersion: 'mock_kibana_version',
    });

    const component = mountWithIntl(
      <TelemetryManagementSection
        telemetryService={telemetryService}
        showAppliesSettingMessage={false}
        enableSaving={true}
        toasts={coreStart.notifications.toasts}
        docLinks={docLinks}
      />
    );
    try {
      expect(
        component.setProps({ ...component.props(), query: { text: 'TeLEMetry' } }).html()
      ).not.toBe(''); // Renders something.
      // I can't check against snapshot because of https://github.com/facebook/jest/issues/8618
      // expect(component).toMatchSnapshot();

      // It should also render if there is no query at all.
      expect(component.setProps({ ...component.props(), query: {} }).html()).not.toBe('');
    } finally {
      component.unmount();
    }
  });

  it('renders null because allowChangingOptInStatus is false', () => {
    const telemetryService = mockTelemetryService({
      config: {
        appendServerlessChannelsSuffix: false,
        banner: true,
        allowChangingOptInStatus: false,
        optIn: true,
        sendUsageTo: 'staging',
        sendUsageFrom: 'browser',
        labels: {},
      },
      isScreenshotMode: false,
      reportOptInStatusChange: false,
      currentKibanaVersion: 'mock_kibana_version',
    });

    const component = renderWithI18n(
      <TelemetryManagementSection
        telemetryService={telemetryService}
        showAppliesSettingMessage={true}
        enableSaving={true}
        toasts={coreStart.notifications.toasts}
        docLinks={docLinks}
      />
    );
    try {
      expect(component.baseElement.innerHTML).toEqual('<div></div>');
    } finally {
      component.unmount();
    }
  });

  it('shows the OptInExampleFlyout', () => {
    const telemetryService = mockTelemetryService({
      config: {
        appendServerlessChannelsSuffix: false,
        banner: true,
        allowChangingOptInStatus: true,
        optIn: false,
        sendUsageTo: 'staging',
        sendUsageFrom: 'browser',
        labels: {},
      },
      isScreenshotMode: false,
      reportOptInStatusChange: false,
      currentKibanaVersion: 'mock_kibana_version',
    });

    const component = mountWithIntl(
      <TelemetryManagementSection
        telemetryService={telemetryService}
        showAppliesSettingMessage={false}
        enableSaving={true}
        toasts={coreStart.notifications.toasts}
        docLinks={docLinks}
      />
    );
    try {
      const toggleExampleComponent = component
        .find('FormattedMessage > EuiLink')
        .find('button')
        .at(0);
      const updatedView = toggleExampleComponent.simulate('click');
      updatedView.find('OptInExampleFlyout');
      updatedView.simulate('close');
    } finally {
      component.unmount();
    }
  });

  it('toggles the OptIn button', async () => {
    const telemetryService = mockTelemetryService({
      config: {
        appendServerlessChannelsSuffix: false,
        banner: true,
        allowChangingOptInStatus: true,
        optIn: false,
        sendUsageTo: 'staging',
        sendUsageFrom: 'browser',
        labels: {},
      },
      isScreenshotMode: false,
      reportOptInStatusChange: false,
      currentKibanaVersion: 'mock_kibana_version',
    });

    const component = mountWithIntl(
      <TelemetryManagementSection
        telemetryService={telemetryService}
        showAppliesSettingMessage={false}
        enableSaving={true}
        toasts={coreStart.notifications.toasts}
        docLinks={docLinks}
      />
    );
    try {
      const toggleOptInComponent = component.find('FieldRow');
      await expect(
        toggleOptInComponent.prop<TelemetryManagementSection['toggleOptIn']>('onFieldChange')()
      ).resolves.toBe(true);
      // TODO: Fix `mountWithIntl` types in @kbn/test-jest-helpers to make testing easier
      expect((component.state() as { enabled: boolean }).enabled).toBe(true);
      await expect(
        toggleOptInComponent.prop<TelemetryManagementSection['toggleOptIn']>('onFieldChange')()
      ).resolves.toBe(true);
      expect((component.state() as { enabled: boolean }).enabled).toBe(false);
      telemetryService.setOptIn = jest.fn().mockRejectedValue(Error('test-error'));
      await expect(
        toggleOptInComponent.prop<TelemetryManagementSection['toggleOptIn']>('onFieldChange')()
      ).rejects.toStrictEqual(Error('test-error'));
    } finally {
      component.unmount();
    }
  });

  it('test the wrapper (for coverage purposes)', () => {
    const telemetryService = mockTelemetryService({
      config: {
        appendServerlessChannelsSuffix: false,
        banner: true,
        allowChangingOptInStatus: false,
        optIn: false,
        sendUsageTo: 'staging',
        sendUsageFrom: 'browser',
        labels: {},
      },
      isScreenshotMode: false,
      reportOptInStatusChange: false,
      currentKibanaVersion: 'mock_kibana_version',
    });

    const component = renderWithI18n(
      <TelemetryManagementSection
        showAppliesSettingMessage={true}
        telemetryService={telemetryService}
        enableSaving={true}
        toasts={coreStart.notifications.toasts}
        docLinks={docLinks}
      />
    );

    try {
      expect(component.baseElement.innerHTML).toEqual('<div></div>');
    } finally {
      component.unmount();
    }
  });
});
