/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';
import { render, fireEvent, act } from '@testing-library/react';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import type { ChromeBreadcrumb, ChromeProjectNavigationNode } from '@kbn/core-chrome-browser';
import { createMockChromeComponentsDeps, TestChromeProviders } from '../test_helpers';
import { ChromeNextPageAnnouncer, HeaderPageAnnouncer } from './header_page_announcer';
import {
  getDeepestActiveNavigationTitle,
  normalizeAppHeaderTitle,
  resolveChromeNextAnnouncement,
} from './resolve_chrome_next_announcement';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');

  return {
    ...actual,
    EuiLiveAnnouncer: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  };
});

describe('HeaderPageAnnouncer', () => {
  it('renders with default brand when no branding is provided', async () => {
    const { findByLabelText } = render(
      <TestChromeProviders>
        <HeaderPageAnnouncer breadcrumbs={[{ text: 'Home' }]} />
      </TestChromeProviders>
    );
    const announcer = await findByLabelText('Page change announcements');
    expect(announcer.textContent).toBe('Home - Elastic');
  });

  it('renders with custom branding', async () => {
    const deps = createMockChromeComponentsDeps();
    act(() => {
      deps.customBranding.customBranding$.next({ pageTitle: 'Kibana' });
    });

    const { findByLabelText } = render(
      <TestChromeProviders deps={deps}>
        <HeaderPageAnnouncer breadcrumbs={[{ text: 'Dashboard' }]} />
      </TestChromeProviders>
    );
    const announcer = await findByLabelText('Page change announcements');
    expect(announcer.textContent).toBe('Dashboard - Kibana');
  });

  it('updates route title when breadcrumbs change', async () => {
    const deps = createMockChromeComponentsDeps();
    act(() => {
      deps.customBranding.customBranding$.next({ pageTitle: 'Brand' });
    });

    const { findByLabelText, rerender } = render(
      <TestChromeProviders deps={deps}>
        <HeaderPageAnnouncer breadcrumbs={[{ text: 'A' }]} />
      </TestChromeProviders>
    );
    let announcer = await findByLabelText('Page change announcements');
    expect(announcer.textContent).toContain('A');

    rerender(
      <TestChromeProviders deps={deps}>
        <HeaderPageAnnouncer breadcrumbs={[{ text: 'B' }]} />
      </TestChromeProviders>
    );

    announcer = await findByLabelText('Page change announcements');

    expect(announcer.textContent).toBe('B - Brand');
  });

  it('renders skip link', () => {
    const { getByText } = render(
      <TestChromeProviders>
        <HeaderPageAnnouncer breadcrumbs={[{ text: 'Test' }]} />
      </TestChromeProviders>
    );
    expect(getByText('Skip to main content')).toBeInTheDocument();
  });

  it('focuses skip link on TAB when shouldHandlingTab is true', () => {
    const { getByTestId } = render(
      <TestChromeProviders>
        <HeaderPageAnnouncer breadcrumbs={[{ text: 'Test' }]} />
      </TestChromeProviders>
    );
    const skipLink = getByTestId('skipToMainButton');
    skipLink.focus = jest.fn();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(skipLink.focus).toHaveBeenCalledTimes(1);
  });

  it('does not focus skip link when Tab is pressed and focus is already within main content', () => {
    const { getByTestId, getByText } = render(
      <>
        <TestChromeProviders>
          <HeaderPageAnnouncer breadcrumbs={[{ text: 'Test' }]} />
        </TestChromeProviders>
        <main>
          <button>Button in main</button>
        </main>
      </>
    );

    const skipLink = getByTestId('skipToMainButton');
    const mainButton = getByText('Button in main');

    mainButton.focus();

    skipLink.focus = jest.fn();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(skipLink.focus).not.toHaveBeenCalled();
  });

  it('does not focus skip link when Tab is pressed and focus is within role="main"', () => {
    const { getByTestId, getByText } = render(
      <>
        <TestChromeProviders>
          <HeaderPageAnnouncer breadcrumbs={[{ text: 'Test' }]} />
        </TestChromeProviders>
        <div role="main">
          <button>Button in main</button>
        </div>
      </>
    );

    const skipLink = getByTestId('skipToMainButton');
    const mainButton = getByText('Button in main');

    mainButton.focus();

    skipLink.focus = jest.fn();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(skipLink.focus).not.toHaveBeenCalled();
  });

  it('does not focus skip link when Tab is pressed and focus is within a flyout', () => {
    const { getByTestId, getByText } = render(
      <>
        <TestChromeProviders>
          <HeaderPageAnnouncer breadcrumbs={[{ text: 'Test' }]} />
        </TestChromeProviders>
        <div className="euiFlyout" role="dialog" aria-label="Flyout">
          <button>Button in flyout</button>
        </div>
      </>
    );

    const skipLink = getByTestId('skipToMainButton');
    const flyoutButton = getByText('Button in flyout');

    flyoutButton.focus();

    skipLink.focus = jest.fn();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(skipLink.focus).not.toHaveBeenCalled();
  });
});

const createNavNode = (
  id: string,
  title: string,
  extras: Partial<ChromeProjectNavigationNode> = {}
): ChromeProjectNavigationNode => ({
  id,
  path: id,
  title,
  ...extras,
});

describe('resolveChromeNextAnnouncement', () => {
  it('normalizes string and editable titles', () => {
    expect(normalizeAppHeaderTitle('  Dashboards  ')).toBe('Dashboards');
    expect(normalizeAppHeaderTitle({ text: '  Name  ', onSave: jest.fn() })).toBe('Name');
    expect(
      normalizeAppHeaderTitle({ text: '  ', placeholder: '  Untitled  ', onSave: jest.fn() })
    ).toBe('Untitled');
    expect(normalizeAppHeaderTitle('   ')).toBeUndefined();
  });

  it('selects one deepest navigation title and ignores breadcrumbStatus', () => {
    expect(
      getDeepestActiveNavigationTitle([
        [
          createNavNode('root', 'Observability'),
          createNavNode('leaf', 'Workflows', { breadcrumbStatus: 'hidden' }),
        ],
      ])
    ).toBe('Workflows');
  });

  it('does not join the full active navigation path', () => {
    expect(
      resolveChromeNextAnnouncement({
        activeNodes: [[createNavNode('root', 'Observability'), createNavNode('leaf', 'Alerts')]],
      })
    ).toBe('Alerts');
  });

  it('uses only the first document-title segment so breadcrumb-style titles do not re-announce', () => {
    expect(
      resolveChromeNextAnnouncement({
        docTitleParts: ['SLOs', 'Observability', 'Elastic'],
        activeNodes: [[createNavNode('root', 'Observability'), createNavNode('leaf', 'SLOs')]],
      })
    ).toBe('SLOs');
  });

  it('keeps a document-title part that contains the display separator', () => {
    expect(
      resolveChromeNextAnnouncement({
        docTitleParts: ['CPU - Memory', 'Elastic'],
      })
    ).toBe('CPU - Memory');
  });

  it('falls through a brand-only or empty first document-title part to the navigation title', () => {
    expect(
      resolveChromeNextAnnouncement({
        docTitleParts: ['Elastic'],
        activeNodes: [[createNavNode('leaf', 'Workflows')]],
      })
    ).toBe('Workflows');
    expect(
      resolveChromeNextAnnouncement({
        docTitleParts: ['  ', 'Elastic'],
        activeNodes: [[createNavNode('leaf', 'Workflows')]],
      })
    ).toBe('Workflows');
  });
});

describe('ChromeNextPageAnnouncer', () => {
  const flushAnnouncement = () => {
    act(() => {
      jest.runAllTimers();
    });
  };

  const createHarness = () => {
    const chrome = chromeServiceMock.createStartContract();
    const deps = createMockChromeComponentsDeps();
    const currentLocation$ = deps.application.currentLocation$ as BehaviorSubject<string>;
    const docTitleParts$ = chrome.componentDeps.docTitleParts$ as unknown as BehaviorSubject<
      readonly string[]
    >;
    const navigation$ = new BehaviorSubject<{ activeNodes: ChromeProjectNavigationNode[][] }>({
      activeNodes: [],
    });
    const breadcrumbs$ = new BehaviorSubject<ChromeBreadcrumb[]>([]);

    chrome.project.getNavigation$.mockReturnValue(navigation$ as never);
    chrome.project.getBreadcrumbs$.mockReturnValue(breadcrumbs$);
    docTitleParts$.next(['Elastic']);

    const renderAnnouncer = () =>
      render(
        <TestChromeProviders chrome={chrome} deps={deps}>
          <ChromeNextPageAnnouncer />
        </TestChromeProviders>
      );

    return {
      chrome,
      deps,
      currentLocation$,
      docTitleParts$,
      navigation$,
      breadcrumbs$,
      renderAnnouncer,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets an inline title win over registered, document, and navigation titles', () => {
    const { chrome, docTitleParts$, navigation$, renderAnnouncer } = createHarness();
    chrome.appHeader.set({ title: 'Registered' });
    chrome.inlineAppHeader.register('Inline');
    docTitleParts$.next(['Document title', 'Elastic']);
    navigation$.next({
      activeNodes: [[createNavNode('root', 'Observability')]],
    });

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();

    expect(getByLabelText('Page change announcements').textContent).toBe('Inline - Elastic');
  });

  it('appends the default brand, and custom branding when set', () => {
    const { chrome, deps, renderAnnouncer } = createHarness();
    chrome.inlineAppHeader.register('SLOs');

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();
    const announcer = getByLabelText('Page change announcements');
    expect(announcer.textContent).toBe('SLOs - Elastic');

    act(() => {
      deps.customBranding.customBranding$.next({ pageTitle: 'Kibana' });
    });
    flushAnnouncement();

    expect(announcer.textContent).toBe('SLOs - Kibana');
  });

  it('does not announce the brand when no page title is resolved', () => {
    const { renderAnnouncer } = createHarness();
    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();

    expect(getByLabelText('Page change announcements').textContent).toBe('');
  });

  it('does not expose a registered or fallback title while updating an inline title', () => {
    const { chrome, docTitleParts$, renderAnnouncer } = createHarness();
    chrome.appHeader.set({ title: 'Registered' });
    const inline = chrome.inlineAppHeader.register('First');
    docTitleParts$.next(['Document title', 'Elastic']);

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();
    const announcer = getByLabelText('Page change announcements');
    expect(announcer).toHaveTextContent('First');

    act(() => {
      inline.update('Second');
    });
    flushAnnouncement();

    expect(announcer).toHaveTextContent('Second');
    expect(announcer).not.toHaveTextContent('Registered');
    expect(announcer).not.toHaveTextContent('Document title');
  });

  it('uses editable inline title text, then placeholder', () => {
    const { chrome, renderAnnouncer } = createHarness();
    const inline = chrome.inlineAppHeader.register({
      text: 'Named dashboard',
      placeholder: 'Untitled dashboard',
      onSave: jest.fn(),
    });

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();
    const announcer = getByLabelText('Page change announcements');
    expect(announcer).toHaveTextContent('Named dashboard');

    act(() => {
      inline.update({ text: '  ', placeholder: 'Untitled dashboard', onSave: jest.fn() });
    });
    flushAnnouncement();

    expect(announcer).toHaveTextContent('Untitled dashboard');
  });

  it('suppresses a registered title while an inline loading header is mounted', () => {
    const { chrome, docTitleParts$, renderAnnouncer } = createHarness();
    chrome.appHeader.set({ title: 'Registered' });
    chrome.inlineAppHeader.register();
    docTitleParts$.next(['Document page', 'Elastic']);

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();

    expect(getByLabelText('Page change announcements')).toHaveTextContent('Document page');
  });

  it('lets a registered title win when no inline header is mounted', () => {
    const { chrome, docTitleParts$, navigation$, renderAnnouncer } = createHarness();
    chrome.appHeader.set({ title: 'Registered' });
    docTitleParts$.next(['Document title', 'Elastic']);
    navigation$.next({
      activeNodes: [[createNavNode('root', 'Observability')]],
    });

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();

    expect(getByLabelText('Page change announcements')).toHaveTextContent('Registered');
  });

  it('lets a descriptive document title win over the navigation title', () => {
    const { docTitleParts$, navigation$, renderAnnouncer } = createHarness();
    docTitleParts$.next(['Saved object', 'Elastic']);
    navigation$.next({
      activeNodes: [[createNavNode('root', 'Observability')]],
    });

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();

    expect(getByLabelText('Page change announcements')).toHaveTextContent('Saved object');
  });

  it('falls through a brand-only document title to the deepest navigation title', () => {
    const { navigation$, renderAnnouncer } = createHarness();
    navigation$.next({
      activeNodes: [
        [
          createNavNode('root', 'Observability'),
          createNavNode('leaf', 'Workflows', { breadcrumbStatus: 'hidden' }),
        ],
      ],
    });

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();

    expect(getByLabelText('Page change announcements')).toHaveTextContent('Workflows');
  });

  it('does not change the live region when project breadcrumbs are replaced', () => {
    const { chrome, breadcrumbs$, renderAnnouncer } = createHarness();
    chrome.inlineAppHeader.register('Dashboards');

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();
    const announcer = getByLabelText('Page change announcements');
    expect(announcer).toHaveTextContent('Dashboards');

    act(() => {
      breadcrumbs$.next([{ text: 'Hidden trail' }, { text: 'Should not appear' }]);
      chrome.project.setBreadcrumbs([{ text: 'Override' }]);
    });
    flushAnnouncement();

    expect(announcer).toHaveTextContent('Dashboards');
    expect(announcer).not.toHaveTextContent('Hidden trail');
    expect(announcer).not.toHaveTextContent('Should not appear');
  });

  it('re-announces the same title when the location changes', () => {
    const { chrome, currentLocation$, renderAnnouncer } = createHarness();
    chrome.inlineAppHeader.register('Dashboards');

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();
    const announcer = getByLabelText('Page change announcements');
    expect(announcer).toHaveTextContent('Dashboards');

    act(() => {
      currentLocation$.next('/b');
    });
    expect(announcer).toHaveTextContent('');

    flushAnnouncement();
    expect(announcer).toHaveTextContent('Dashboards');
  });

  it('cancels a scheduled fallback when a destination title arrives first', () => {
    const { chrome, currentLocation$, navigation$, renderAnnouncer } = createHarness();
    navigation$.next({
      activeNodes: [[createNavNode('root', 'Workflows')]],
    });

    const { getByLabelText } = renderAnnouncer();
    flushAnnouncement();
    const announcer = getByLabelText('Page change announcements');
    expect(announcer).toHaveTextContent('Workflows');

    act(() => {
      currentLocation$.next('/details');
    });
    expect(announcer).toHaveTextContent('');

    act(() => {
      chrome.inlineAppHeader.register('Details');
    });
    flushAnnouncement();

    expect(announcer).toHaveTextContent('Details');
    expect(announcer).not.toHaveTextContent('Workflows');
  });

  it('arms the skip link on a location change', () => {
    const { currentLocation$, renderAnnouncer } = createHarness();
    const { getByTestId } = renderAnnouncer();
    const skipLink = getByTestId('skipToMainButton');
    skipLink.focus = jest.fn();

    act(() => {
      currentLocation$.next('/b');
    });
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(skipLink.focus).toHaveBeenCalledTimes(1);
  });

  it('does not arm the skip link on a title-only change', () => {
    const { chrome, renderAnnouncer } = createHarness();
    const inline = chrome.inlineAppHeader.register('First');
    const { getByTestId } = renderAnnouncer();
    const skipLink = getByTestId('skipToMainButton');
    skipLink.focus = jest.fn();

    fireEvent.mouseDown(window);
    skipLink.focus = jest.fn();

    act(() => {
      inline.update('Second');
    });
    flushAnnouncement();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(skipLink.focus).not.toHaveBeenCalled();
  });
});
