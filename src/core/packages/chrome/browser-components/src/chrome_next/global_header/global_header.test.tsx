/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { BehaviorSubject, Subject } from 'rxjs';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { TestChromeProviders } from '../../test_helpers';
import { ChromeNextGlobalHeader } from './global_header';

describe('ChromeNextGlobalHeader', () => {
  it('renders the project picker beside the context switcher', () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.controls.contextSwitcher.set(<span>Context switcher</span>);
    chrome.controls.projectPicker.set(<span>Project picker</span>);

    renderWithI18n(
      <TestChromeProviders chrome={chrome}>
        <ChromeNextGlobalHeader />
      </TestChromeProviders>
    );

    expect(screen.getByTestId('chromeNextGlobalHeaderSwitcher')).toHaveTextContent(
      'Context switcher'
    );
    expect(screen.getByTestId('chromeNextGlobalHeaderProjectPicker')).toHaveTextContent(
      'Project picker'
    );
  });

  it('renders the help menu button', async () => {
    renderWithI18n(
      <TestChromeProviders>
        <ChromeNextGlobalHeader />
      </TestChromeProviders>
    );

    await userEvent.click(screen.getByTestId('chromeNextGlobalHeaderHelpButton'));

    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByText('Kibana documentation')).toBeInTheDocument();
  });

  it('renders a registered newsfeed handler in the help menu', async () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.getChromeStyle.mockReturnValue('project');
    chrome.getChromeStyle$.mockReturnValue(new BehaviorSubject('project'));
    chrome.help.getNewsfeedHandler$.mockReturnValue(
      new BehaviorSubject({
        open: jest.fn(),
        hasNew$: new BehaviorSubject(false),
      })
    );

    renderWithI18n(
      <TestChromeProviders chrome={chrome}>
        <ChromeNextGlobalHeader />
      </TestChromeProviders>
    );

    await userEvent.click(screen.getByTestId('chromeNextGlobalHeaderHelpButton'));

    expect(screen.getByTestId('helpMenuWhatsNewButton')).toBeInTheDocument();
  });

  it('renders a registered newsfeed handler before unread state emits', async () => {
    const chrome = chromeServiceMock.createStartContract();
    chrome.getChromeStyle.mockReturnValue('project');
    chrome.getChromeStyle$.mockReturnValue(new BehaviorSubject('project'));
    chrome.help.getNewsfeedHandler$.mockReturnValue(
      new BehaviorSubject({
        open: jest.fn(),
        hasNew$: new Subject<boolean>(),
      })
    );

    renderWithI18n(
      <TestChromeProviders chrome={chrome}>
        <ChromeNextGlobalHeader />
      </TestChromeProviders>
    );

    await userEvent.click(screen.getByTestId('chromeNextGlobalHeaderHelpButton'));

    expect(screen.getByTestId('helpMenuWhatsNewButton')).toBeInTheDocument();
  });

  it('shows unread indicators when the newsfeed has new items', async () => {
    const chrome = chromeServiceMock.createStartContract();
    const hasNew$ = new BehaviorSubject(true);
    chrome.getChromeStyle.mockReturnValue('project');
    chrome.getChromeStyle$.mockReturnValue(new BehaviorSubject('project'));
    chrome.help.getNewsfeedHandler$.mockReturnValue(
      new BehaviorSubject({
        open: jest.fn(),
        hasNew$,
      })
    );

    renderWithI18n(
      <TestChromeProviders chrome={chrome}>
        <ChromeNextGlobalHeader />
      </TestChromeProviders>
    );

    expect(screen.getByTestId('headerActionButtonNotification')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('chromeNextGlobalHeaderHelpButton'));

    expect(screen.getByTestId('helpMenuWhatsNewUnreadIndicator')).toBeInTheDocument();

    act(() => {
      hasNew$.next(false);
    });

    expect(screen.queryByTestId('headerActionButtonNotification')).not.toBeInTheDocument();
    expect(screen.queryByTestId('helpMenuWhatsNewUnreadIndicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('helpMenuWhatsNewButton')).toBeInTheDocument();
  });

  it('does not announce project breadcrumbs', async () => {
    const chrome = chromeServiceMock.createStartContract();
    const breadcrumbs$ = new BehaviorSubject([{ text: 'Should not be announced' }]);
    chrome.project.getBreadcrumbs$.mockReturnValue(breadcrumbs$);
    chrome.inlineAppHeader.register('Dashboards');

    renderWithI18n(
      <TestChromeProviders chrome={chrome}>
        <ChromeNextGlobalHeader />
      </TestChromeProviders>
    );

    const announcer = await screen.findByLabelText('Page change announcements');
    expect(announcer).not.toHaveTextContent('Should not be announced');
  });
});
