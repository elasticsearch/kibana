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
import '@emotion/jest';
import { BehaviorSubject } from 'rxjs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal-types';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import type { ChromeBadge } from '@kbn/core-chrome-browser';
import { APP_MENU_TEST_SUBJECTS } from '@kbn/core-chrome-app-menu-components';
import type { AppHeaderMetadataItems } from '../types';
import { AppHeaderView } from './app_header';
import { APP_HEADER_TEST_SUBJECTS } from './test_subjects';

const renderAppHeader = (
  ui: React.ReactElement,
  chrome: InternalChromeStart = chromeServiceMock.createStartContract()
) => {
  return render(<ChromeServiceProvider value={{ chrome }}>{ui}</ChromeServiceProvider>);
};

describe('AppHeaderView', () => {
  it('renders legacy app menu share as a title action', () => {
    const runShare = jest.fn();

    renderAppHeader(
      <AppHeaderView
        menu={{
          items: [
            {
              id: 'share',
              order: 0,
              label: 'Share',
              iconType: 'share',
              testId: 'shareTopNavButton',
              run: runShare,
            },
          ],
        }}
      />
    );

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(runShare).toHaveBeenCalledTimes(1);
  });

  it('renders when the only content is a favorite action', () => {
    renderAppHeader(
      <AppHeaderView
        favorite={
          <EuiToolTip content="Favorite" disableScreenReaderOutput>
            <EuiButtonIcon aria-label="Favorite" iconType="starEmpty" onClick={jest.fn()} />
          </EuiToolTip>
        }
      />
    );

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeInTheDocument();
  });

  it('renders metadata items as a wrapping row', () => {
    const onInspect = jest.fn();

    renderAppHeader(
      <AppHeaderView
        metadata={[
          { type: 'health', label: 'Warning at llm 24', color: 'warning' },
          { type: 'text', label: 'Created by: analyst', 'data-test-subj': 'createdByMetadata' },
          { type: 'button', label: 'Updated by: analyst', onClick: onInspect },
        ]}
      />
    );

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.metadata)).toBeInTheDocument();
    expect(screen.getByText('Warning at llm 24')).toBeInTheDocument();
    expect(screen.getByTestId('createdByMetadata')).toHaveTextContent('Created by: analyst');

    fireEvent.click(screen.getByRole('button', { name: 'Updated by: analyst' }));

    expect(onInspect).toHaveBeenCalledTimes(1);
  });

  it('limits metadata rendering to three items', () => {
    const metadata = [
      { type: 'text', label: 'First' },
      { type: 'text', label: 'Second' },
      { type: 'text', label: 'Third' },
    ] satisfies AppHeaderMetadataItems;
    metadata.push({ type: 'text', label: 'Fourth' });

    renderAppHeader(<AppHeaderView metadata={metadata} />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    expect(screen.queryByText('Fourth')).not.toBeInTheDocument();
  });

  it('renders when the only content is a static app menu item', async () => {
    renderAppHeader(<AppHeaderView showAddIntegrations />);

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toBeInTheDocument();
    expect(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.root)).toBeInTheDocument();
  });

  it('renders when the only content is a title appendix', () => {
    renderAppHeader(
      <AppHeaderView titleAppend={<div data-test-subj="titleAppend">Title append</div>} />
    );

    expect(screen.getByTestId('titleAppend')).toBeInTheDocument();
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

  it('renders an xs title for a single row and an s title when a second row is present', () => {
    const { unmount: unmountSingle } = renderAppHeader(<AppHeaderView title="Dashboard" />);
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/euiTitle-xs/);
    unmountSingle();

    const { unmount: unmountTabs } = renderAppHeader(
      <AppHeaderView title="Dashboard" tabs={[{ id: 'overview', label: 'Overview' }]} />
    );
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/euiTitle-s/);
    unmountTabs();

    renderAppHeader(
      <AppHeaderView
        title="Dashboard"
        metadata={[{ type: 'text', label: 'Created by: analyst' }]}
      />
    );
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/euiTitle-s/);
  });

  it('renders tab badge and test subject metadata', () => {
    renderAppHeader(
      <AppHeaderView
        tabs={[
          {
            id: 'alerts',
            label: 'Alerts',
            badge: 3,
            'data-test-subj': 'alertsTab',
          },
        ]}
      />
    );

    expect(screen.getByTestId('alertsTab')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('only treats exact base path prefixes as already prepended for back links', () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.componentDeps.basePath.get.mockReturnValue('/base');
    chrome.componentDeps.basePath.prepend.mockImplementation((path: string) => `/base${path}`);

    renderAppHeader(<AppHeaderView back="/base-other/app" />, chrome);

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/base/base-other/app'
    );
  });

  it('renders multiple back targets as a menu and closes it after selection', async () => {
    const backClick = jest.fn((event: React.MouseEvent) => event.preventDefault());

    renderAppHeader(
      <AppHeaderView
        back={[
          { href: '/app/first', label: 'First app' },
          { href: '/app/second', label: 'Second app', onClick: backClick },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open back navigation menu' }));
    fireEvent.click(screen.getByText('Second app'));

    expect(backClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Second app')).not.toBeInTheDocument());
  });

  describe('borderless flag', () => {
    it('renders a bottom border by default', () => {
      renderAppHeader(<AppHeaderView title="Dashboard" />);

      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toHaveStyleRule(
        'border-bottom',
        expect.stringMatching(/solid/)
      );
    });

    it('omits the bottom border when borderless is set', () => {
      renderAppHeader(<AppHeaderView title="Dashboard" borderless />);

      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).not.toHaveStyleRule(
        'border-bottom',
        expect.stringMatching(/solid/)
      );
    });
  });
});
