/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import '@testing-library/jest-dom';
import { BehaviorSubject } from 'rxjs';
import { fireEvent, render, screen } from '@testing-library/react';
import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal-types';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import type { ChromeBadge, ChromeHelpExtension } from '@kbn/core-chrome-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import { APP_MENU_TEST_SUBJECTS } from '@kbn/app-menu';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/ui-app-header';
import { AppHeader, AppHeaderView, DiscoverAppHeader } from './app_header';

const createChromeWithIntegrationsAccess = (canAccessIntegrations: boolean) => {
  const chrome = chromeServiceMock.createStartContract();
  chrome.componentDeps.capabilities.navLinks.integrations = canAccessIntegrations;
  return chrome;
};

const renderAppHeader = (
  ui: React.ReactElement,
  chrome: InternalChromeStart = chromeServiceMock.createStartContract()
) => {
  return render(<ChromeServiceProvider value={{ chrome }}>{ui}</ChromeServiceProvider>);
};

describe('AppHeader adapter', () => {
  it('only treats exact base path prefixes as already prepended for back links', () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.componentDeps.basePath.get.mockReturnValue('/base');
    chrome.componentDeps.basePath.prepend.mockImplementation((path: string) => `/base${path}`);

    renderAppHeader(
      <AppHeaderView back={{ href: '/base-other/app', label: 'Other app' }} />,
      chrome
    );

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/base/base-other/app'
    );
  });

  it('does not double-prefix back links that already include the base path', () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.componentDeps.basePath.get.mockReturnValue('/base');
    chrome.componentDeps.basePath.prepend.mockImplementation((path: string) => `/base${path}`);

    renderAppHeader(
      <AppHeaderView back={{ href: '/base/app/dashboards', label: 'Dashboards' }} />,
      chrome
    );

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/base/app/dashboards'
    );
  });

  it('renders legacy badge fallback content', () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.getBadge$.mockReturnValue(
      new BehaviorSubject<ChromeBadge>({ text: 'Technical preview', tooltip: '' })
    );

    renderAppHeader(<AppHeaderView />, chrome);

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toBeInTheDocument();
    expect(screen.getByText('Technical preview')).toBeInTheDocument();
  });

  it('prefers explicit badges over the legacy badge fallback', () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.getBadge$.mockReturnValue(
      new BehaviorSubject<ChromeBadge>({ text: 'Technical preview', tooltip: '' })
    );

    renderAppHeader(<AppHeaderView badges={[{ label: 'Beta' }]} />, chrome);

    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Technical preview')).not.toBeInTheDocument();
  });

  it('shows Add integrations when capabilities.navLinks.integrations is true', async () => {
    renderAppHeader(
      <AppHeaderView title="Workflows" showAddIntegrations />,
      createChromeWithIntegrationsAccess(true)
    );

    fireEvent.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.menuAddIntegrations)).toHaveAttribute(
      'href',
      '/app/integrations/browse'
    );
  });

  it('hides Add integrations when capabilities.navLinks.integrations is false', async () => {
    renderAppHeader(
      <AppHeaderView title="Workflows" showAddIntegrations docLink="https://example.com/docs" />,
      createChromeWithIntegrationsAccess(false)
    );

    fireEvent.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
    expect(
      screen.queryByTestId(APP_HEADER_TEST_SUBJECTS.menuAddIntegrations)
    ).not.toBeInTheDocument();
  });

  it('does not render when Add integrations is the only content and access is denied', () => {
    renderAppHeader(
      <AppHeaderView showAddIntegrations />,
      createChromeWithIntegrationsAccess(false)
    );

    expect(screen.queryByTestId(APP_HEADER_TEST_SUBJECTS.root)).not.toBeInTheDocument();
  });

  it('adds a documentation item from docLink', async () => {
    renderAppHeader(<AppHeaderView title="Workflows" docLink="https://example.com/docs" />);

    fireEvent.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.menuDocumentation)).toHaveAttribute(
      'href',
      'https://example.com/docs'
    );
  });

  it('falls back to help-extension documentation when docLink is omitted', async () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.getHelpExtension$.mockReturnValue(
      new BehaviorSubject<ChromeHelpExtension | undefined>({
        appName: 'Test',
        links: [{ linkType: 'documentation', href: 'https://help.example.com' }],
      })
    );

    renderAppHeader(<AppHeaderView title="Workflows" />, chrome);

    fireEvent.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.menuDocumentation)).toHaveAttribute(
      'href',
      'https://help.example.com'
    );
  });

  it('adds a feedback item from the registered handler', async () => {
    const chrome = chromeServiceMock.createStartContract();
    const feedbackHandler = jest.fn();
    chrome.help.getFeedbackHandler$.mockReturnValue(
      new BehaviorSubject<(() => void) | undefined>(feedbackHandler)
    );

    renderAppHeader(<AppHeaderView title="Workflows" docLink="https://example.com/docs" />, chrome);

    fireEvent.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
    fireEvent.click(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.menuFeedback));
    expect(feedbackHandler).toHaveBeenCalledTimes(1);
  });

  it('mounts the legacy action menu when no structured menu is provided', () => {
    const chrome = chromeServiceMock.createStartContract();
    const mount: MountPoint = jest.fn((el) => {
      el.setAttribute('data-mounted', 'true');
      return () => el.removeAttribute('data-mounted');
    });
    const chromeWithLegacyMenu = {
      ...chrome,
      componentDeps: {
        ...chrome.componentDeps,
        legacyActionMenu$: new BehaviorSubject<MountPoint | undefined>(mount),
      },
    };

    renderAppHeader(<AppHeaderView />, chromeWithLegacyMenu);

    expect(screen.getByTestId('headerAppActionMenu')).toHaveAttribute('data-mounted', 'true');
    expect(mount).toHaveBeenCalled();
  });

  it('prefers a structured menu over the legacy action menu', async () => {
    const chrome = chromeServiceMock.createStartContract();
    const mount: MountPoint = jest.fn((el) => {
      el.setAttribute('data-mounted', 'true');
      return () => undefined;
    });
    const chromeWithLegacyMenu = {
      ...chrome,
      componentDeps: {
        ...chrome.componentDeps,
        legacyActionMenu$: new BehaviorSubject<MountPoint | undefined>(mount),
      },
    };

    renderAppHeader(
      <AppHeaderView
        title="Dashboard"
        menu={{
          items: [
            {
              id: 'settings',
              order: 1,
              label: 'Settings',
              iconType: 'gear',
              testId: 'settingsMenu',
              run: jest.fn(),
            },
          ],
        }}
      />,
      chromeWithLegacyMenu
    );

    fireEvent.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
    expect(await screen.findByTestId('settingsMenu')).toBeInTheDocument();
    expect(screen.queryByTestId('headerAppActionMenu')).not.toBeInTheDocument();
    expect(mount).not.toHaveBeenCalled();
  });

  it('registers its initial title, updates it once, and unregisters', () => {
    const chrome = chromeServiceMock.createStartContract();
    const emissions: Array<{ title?: unknown } | undefined> = [];
    const subscription = chrome.inlineAppHeader.get$().subscribe((value) => emissions.push(value));

    const { rerender, unmount } = renderAppHeader(<AppHeader title="Dashboard" />, chrome);

    expect(chrome.inlineAppHeader.register).toHaveBeenCalledWith('Dashboard');
    expect(chrome.appHeader.set).not.toHaveBeenCalled();

    rerender(
      <ChromeServiceProvider value={{ chrome }}>
        <AppHeader title="Updated dashboard" />
      </ChromeServiceProvider>
    );
    unmount();

    expect(emissions).toEqual([
      undefined,
      { title: 'Dashboard' },
      { title: 'Updated dashboard' },
      undefined,
    ]);
    subscription.unsubscribe();
  });

  it('does not claim the slot when only the view is rendered', () => {
    const chrome = chromeServiceMock.createStartContract();
    renderAppHeader(<AppHeaderView title="Dashboard" />, chrome);

    expect(chrome.inlineAppHeader.register).not.toHaveBeenCalled();
  });

  it('claims the inline slot for DiscoverAppHeader', () => {
    const chrome = chromeServiceMock.createStartContract();
    const { unmount } = renderAppHeader(
      <DiscoverAppHeader title="Discover" tabsBar={<div data-test-subj="tabsBar">Tabs</div>} />,
      chrome
    );

    expect(chrome.inlineAppHeader.register).toHaveBeenCalledWith('Discover');
    expect(screen.getByTestId('tabsBar')).toBeInTheDocument();

    unmount();

    expect(chrome.inlineAppHeader.register).toHaveBeenCalledTimes(1);
  });
});
