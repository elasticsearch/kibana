/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { TestComponent } from './test_component';
import { flushPopoverTimers } from './flush_popover_timers';
import { basicMock } from '../mocks/basic_navigation';
import { observabilityMock } from '../mocks/observability';
import { securityMock } from '../mocks/security';
import { mockClientHeight } from './mock_client_height';

const mockExpandedMenuGap = 16;
const mockMenuItemHeight = 51;

// Basic mock reusable IDs
const appsItemId = basicMock.navItems.primaryItems[2].id;

// Security mock reusable IDs
const resultExplorerItemId = securityMock.navItems.primaryItems[11].sections?.[2]?.items?.[0]?.id;

// Test ID helpers
const logoId = `kbnChromeNav-logo`;
const primaryItemId = (id: string) => `kbnChromeNav-primaryItem-${id}`;
const secondaryItemId = (id: string) => `kbnChromeNav-secondaryItem-${id}`;
const moreMenuId = 'kbnChromeNav-moreMenuTrigger';
const popoverId = (label: string) => `side-nav-popover-${label}`;
const popoverItemId = (id: string) => `kbnChromeNav-popoverItem-${id}`;
const nestedMenuItemId = (id: string) => `kbnChromeNav-nestedMenuItem-${id}`;
const sidePanelId = /\bkbnChromeNav-sidePanel\b/;

describe('Expanded mode', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeAll(() => {
    // Mock the client height for the primary menu item
    mockClientHeight(mockMenuItemHeight);
    // Mock the gap between the primary menu items
    jest.mock('../utils/get_style_property', () => ({
      getStyleProperty: jest.fn(() => mockExpandedMenuGap),
    }));
  });

  beforeEach(() => {
    user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
      pointerEventsCheck: 0,
    });
  });

  it('should render the side navigation', () => {
    const { container } = render(
      <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
    );

    expect(container).toMatchSnapshot();
  });

  describe('Solution logo', () => {
    /**
     * GIVEN the side navigation is in expanded mode
     * WHEN the navigation renders the solution logo
     * THEN I should see the solution label
     */
    it('should display the solution label next to the logo', () => {
      render(
        <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
      );

      const solutionLogo = screen.getByTestId(logoId);

      // The label is NOT wrapped with `<EuiScreenReaderOnly />` in expanded mode
      // See: https://eui.elastic.co/docs/utilities/accessibility/#screen-reader-only
      expect(solutionLogo.children[1].className).not.toContain('euiScreenReaderOnly');
    });
  });

  describe('Primary menu', () => {
    describe('Primary menu item', () => {
      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item has a submenu (has children)
       * WHEN I hover over it
       * THEN I should see a popover with the submenu
       */
      it('(with submenu) should show a popover with the submenu on hover (with submenu)', async () => {
        render(
          <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
        );

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));

        await user.hover(appsLink);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('Apps'));

        expect(popover).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item with a submenu is in an active state
       * WHEN I hover over it
       * THEN a popover with the submenu should not be displayed
       */
      it('(with submenu) should NOT show a popover if the item with submenu is already active', async () => {
        render(
          <TestComponent
            logo={basicMock.logo}
            items={basicMock.navItems}
            isCollapsed={false}
            initialActiveItemId={appsItemId}
          />
        );

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));

        expect(appsLink).toHaveAttribute('aria-current', 'page');
        expect(appsLink).toHaveAttribute('data-highlighted', 'true');

        await user.hover(appsLink);
        flushPopoverTimers();

        const popover = screen.queryByRole('dialog', {
          name: 'Apps',
        });

        expect(popover).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item has a submenu (has children)
       * WHEN I click on it
       * THEN I should be redirected to its href
       * AND a side panel with the submenu should show
       */
      it('(with submenu) should redirect and open side panel when clicking item with submenu', async () => {
        render(
          <TestComponent
            initialActiveItemId={appsItemId}
            isCollapsed={false}
            items={basicMock.navItems}
            logo={basicMock.logo}
          />
        );

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));
        const expectedHref = basicMock.navItems.primaryItems[2].href;

        expect(appsLink).toHaveAttribute('href', expectedHref);

        await user.click(appsLink);

        const sidePanel = await screen.findByTestId(sidePanelId);

        expect(sidePanel).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item with a submenu has focus
       * WHEN I press the Enter key
       * THEN focus should move to the popover
       */
      it('(with submenu) should move focus to popover on Enter when focused item has submenu', async () => {
        render(
          <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
        );

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));

        act(() => {
          appsLink.focus();
        });

        const popover = await screen.findByTestId(popoverId('Apps'));

        expect(popover).toBeInTheDocument();

        await user.keyboard('{Enter}');

        const overviewLink = within(popover).getByTestId(popoverItemId('apps_overview'));

        expect(overviewLink).toHaveFocus();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item doesn’t have a submenu
       * WHEN I hover over it
       * THEN I should not see a popover
       */
      it('(without submenu) should NOT show a popover on hover (without submenu)', async () => {
        render(
          <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
        );

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));

        await user.hover(dashboardsLink);
        flushPopoverTimers();

        const popover = screen.queryByTestId(popoverId('Apps'));

        expect(popover).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item doesn’t have a submenu
       * WHEN I click on it
       * THEN I should be redirected to its href
       * AND I should not see a side panel
       */
      it('(without submenu) should redirect and NOT open side panel when clicking item without submenu', async () => {
        render(
          <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
        );

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));
        const expectedHref = basicMock.navItems.primaryItems[0].href;

        expect(dashboardsLink).toHaveAttribute('href', expectedHref);

        await user.click(dashboardsLink);

        const sidePanel = screen.queryByTestId(sidePanelId);

        expect(sidePanel).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item without a submenu has focus
       * WHEN I press the Enter key
       * THEN I should be redirected to its href
       */
      it('(without submenu) should redirect on Enter when focused item has no submenu', async () => {
        render(
          <TestComponent isCollapsed={false} items={basicMock.navItems} logo={basicMock.logo} />
        );

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));
        const expectedHref = basicMock.navItems.primaryItems[0].href;

        expect(dashboardsLink).toHaveAttribute('href', expectedHref);

        act(() => {
          dashboardsLink.focus();
        });

        await user.keyboard('{enter}');

        const sidePanel = screen.queryByTestId(sidePanelId);

        expect(sidePanel).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item is in beta
       * WHEN I hover over that item
       * THEN a tooltip shows up with a beta badge with beta icon
       */
      it('should show tooltip with beta badge on hover', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={observabilityMock.navItems}
            logo={observabilityMock.logo}
          />
        );

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));

        await user.hover(dashboardsLink);
        flushPopoverTimers();

        const tooltip = await screen.findByRole('tooltip');
        const betaIcon = tooltip.querySelector('[data-euiicon-type="beta"]');

        expect(tooltip).toBeInTheDocument();
        expect(betaIcon).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item is in tech preview
       * WHEN I hover over that item
       * THEN a tooltip shows up with a beta badge with flask icon
       */
      it('should show tooltip with flask badge on hover', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={observabilityMock.navItems}
            logo={observabilityMock.logo}
          />
        );

        const casesLink = screen.getByTestId(primaryItemId('cases'));

        await user.hover(casesLink);
        flushPopoverTimers();

        const tooltip = await screen.findByRole('tooltip');
        const flaskIcon = tooltip.querySelector('[data-euiicon-type="flask"]');

        expect(tooltip).toBeInTheDocument();
        expect(flaskIcon).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in expanded mode
       * AND a primary menu item is new
       * WHEN I hover over that item
       * THEN a tooltip shows up with a badge reading "New"
       */
      it('should show tooltip with new badge on hover', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={observabilityMock.navItems}
            logo={observabilityMock.logo}
          />
        );

        const alertsLink = screen.getByTestId(primaryItemId('alerts'));

        await user.hover(alertsLink);
        flushPopoverTimers();

        const tooltip = await screen.findByRole('tooltip');

        expect(tooltip).toBeInTheDocument();

        const badge = tooltip.querySelector('.euiBadge');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('New');
      });
    });

    describe('More menu', () => {
      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in expanded mode
       * WHEN the navigation renders
       * THEN I should see a "More" primary menu item
       */
      it('should render the "More" primary menu item when items overflow', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={securityMock.navItems}
            logo={securityMock.logo}
          />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        expect(moreButton).toBeInTheDocument();
      });

      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in expanded mode
       * WHEN I hover over the "More" primary menu item
       * THEN I should see a popover with secondary menu
       */
      it('should show popover with secondary menu on hover over "More"', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={securityMock.navItems}
            logo={securityMock.logo}
          />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        await user.hover(moreButton);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('More'));

        await within(popover).findAllByRole('link');

        expect(popover).toBeInTheDocument();
      });

      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in expanded mode
       * WHEN I hover over the “More” primary menu item
       * AND I click on the menu item that has a submenu
       * THEN the nested panel shows with the submenu
       * AND when I click on a submenu item
       * THEN the popover should close
       * - AND I should be redirected to that item’s href
       * AND I should see a side panel with that submenu
       */
      it('should open side panel when clicking submenu item inside "More" popover', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={securityMock.navItems}
            logo={securityMock.logo}
          />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        await user.hover(moreButton);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('More'));

        const mlButton = within(popover).getByTestId(secondaryItemId('ml-overview'));

        await user.click(mlButton);

        expect(popover).toBeInTheDocument();

        const mlHeading = await within(popover).findByRole('heading', {
          name: 'Machine learning',
        });

        expect(mlHeading).toBeInTheDocument();

        let anomalyExplorerLink = await within(popover).findByTestId(
          nestedMenuItemId('anomaly-explorer')
        );

        await user.click(anomalyExplorerLink);

        const sidePanel = await screen.findByTestId(sidePanelId);

        expect(sidePanel).toBeInTheDocument();

        await waitFor(() => {
          expect(popover).not.toBeInTheDocument();
        });

        expect(sidePanel).toBeInTheDocument();

        anomalyExplorerLink = await within(sidePanel).findByRole('link', {
          name: 'Anomaly explorer',
        });

        expect(anomalyExplorerLink).toBeInTheDocument();
        expect(anomalyExplorerLink).toHaveAttribute('data-highlighted', 'true');
        expect(anomalyExplorerLink).toHaveAttribute('aria-current', 'page');
      });

      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in expanded mode
       * WHEN I hover over the "More" primary menu item
       * AND I click on the menu item that doesn’t have a submenu
       * THEN I shouldn’t see a side panel
       * AND I should be redirected to that item’s href
       */
      it('should NOT open side panel when clicking item without submenu in "More" popover', async () => {
        render(
          <TestComponent
            isCollapsed={false}
            items={securityMock.navItems}
            logo={securityMock.logo}
          />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        await user.hover(moreButton);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('More'));

        const coverageLink = within(popover).getByTestId(secondaryItemId('coverage'));

        await user.click(coverageLink);

        await waitFor(() => {
          expect(popover).not.toBeInTheDocument();
        });

        const sidePanel = screen.queryByTestId(sidePanelId);

        expect(sidePanel).not.toBeInTheDocument();
      });

      /**
       * GIVEN the navigation renders in expanded mode
       * AND not all primary menu items fit the menu height
       * AND the initial active item is a submenu item of an item in the "More" menu
       * WHEN the navigation renders
       * THEN the "More" primary menu item itself is in an active state
       * AND its parent primary menu item is active within the "More" menu popover
       * AND a side panel with the submenu opens
       * AND the submenu item is in an active state
       */
      it('should have active state and open side panel when initial active submenu item is under "More"', async () => {
        render(
          <TestComponent
            initialActiveItemId={resultExplorerItemId}
            isCollapsed={false}
            items={securityMock.navItems}
            logo={securityMock.logo}
          />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        expect(moreButton).toHaveAttribute('data-highlighted', 'true');

        await user.hover(moreButton);

        const popover = await screen.findByTestId(popoverId('More'));

        expect(popover).toBeInTheDocument();

        const mlButton = await within(popover).findByRole('button', {
          name: 'Machine learning',
        });

        expect(mlButton).toHaveAttribute('data-highlighted', 'true');

        await user.click(mlButton);

        const mlHeader = await within(popover).findByText('Machine learning');

        expect(mlHeader).toBeInTheDocument();

        const resultExplorerLink = await within(popover).findByTestId(
          nestedMenuItemId('result-explorer')
        );

        const expectedSubItemHref =
          securityMock.navItems.primaryItems[11].sections?.[2]?.items?.[0]?.href;

        expect(resultExplorerLink).toHaveAttribute('href', expectedSubItemHref);
        expect(resultExplorerLink).toHaveAttribute('aria-current', 'page');
        expect(resultExplorerLink).toHaveAttribute('data-highlighted', 'true');
      });
    });
  });
});
