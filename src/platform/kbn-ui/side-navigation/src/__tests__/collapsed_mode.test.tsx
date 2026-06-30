/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { TestComponent } from './test_component';
import { flushPopoverTimers } from './flush_popover_timers';
import { basicMock } from '../mocks/basic_navigation';
import { observabilityMock } from '../mocks/observability';
import { securityMock } from '../mocks/security';
import { mockClientHeight } from './mock_client_height';

const mockCollapsedMenuGap = 4;
const mockMenuItemHeight = 32;

// Security mock reusable IDs - Machine Learning > Anomaly explorer (item that's in "More" menu)
const mlAnomalyExplorerItemId =
  securityMock.navItems.primaryItems[11].sections?.[1]?.items?.[0]?.id;

// Test ID helpers
const logoId = `kbnChromeNav-logo`;
const primaryItemId = (id: string) => `kbnChromeNav-primaryItem-${id}`;
const secondaryItemId = (id: string) => `kbnChromeNav-secondaryItem-${id}`;
const moreMenuId = 'kbnChromeNav-moreMenuTrigger';
const popoverId = (label: string) => `side-nav-popover-${label}`;
const popoverItemId = (id: string) => `kbnChromeNav-popoverItem-${id}`;
const nestedMenuItemId = (id: string) => `kbnChromeNav-nestedMenuItem-${id}`;
const sidePanelId = 'kbnChromeNav-sidePanel';

describe('Collapsed mode', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
      pointerEventsCheck: 0,
    });
    mockClientHeight(mockMenuItemHeight);
  });

  beforeAll(() => {
    // Mock the client height for the primary menu item
    mockClientHeight(mockMenuItemHeight);
    // Mock the gap between the primary menu items
    jest.mock('../utils/get_style_property', () => ({
      getStyleProperty: jest.fn(() => mockCollapsedMenuGap),
    }));
  });

  it('should render the side navigation', () => {
    const { container } = render(
      <TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />
    );

    expect(container).toMatchSnapshot();
  });

  describe('Solution logo', () => {
    /**
     * GIVEN the side navigation is in collapsed mode
     * WHEN the navigation renders the solution logo
     * THEN I should not see the solution label
     */
    it('should NOT display the solution label next to the logo', () => {
      render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

      const solutionLogo = screen.getByTestId(logoId);

      // The label is wrapped with `<EuiScreenReaderOnly />` in collapsed mode
      // See: https://eui.elastic.co/docs/utilities/accessibility/#screen-reader-only
      expect(solutionLogo.children[1].className).toContain('euiScreenReaderOnly');
    });
  });

  describe('Primary menu', () => {
    describe('Primary menu item', () => {
      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item has a submenu (has children)
       * WHEN I hover over it
       * THEN I should see a popover with the submenu
       */
      it('(with submenu) should show a popover with the submenu on hover', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));

        await user.hover(appsLink);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('Apps'));

        expect(popover).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item with a submenu receives keyboard focus
       * THEN I should see a popover with the submenu
       */
      it('(with submenu) should show a popover when item with submenu receives keyboard focus', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));

        act(() => {
          appsLink.focus();
        });

        const popover = await screen.findByTestId(popoverId('Apps'));

        expect(popover).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item has a submenu (has children)
       * WHEN I click on it
       * - THEN I should be redirected to its href
       * AND I should not see a side panel
       */
      it('(with submenu) should redirect and NOT open side panel when clicking item', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

        const appsLink = screen.getByTestId(primaryItemId('apps_overview'));
        const expectedHref = basicMock.navItems.primaryItems[2].href; // Apps

        await user.click(appsLink);

        expect(appsLink).toHaveAttribute('href', expectedHref);

        const sidePanel = screen.queryByTestId(sidePanelId);

        expect(sidePanel).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item with a submenu has focus
       * WHEN I press the Enter key
       * THEN focus moves to the first item inside the displayed popover
       */
      it('(with submenu) should move focus to first popover item on Enter', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

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
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item doesn’t have a submenu
       * WHEN I hover over it
       * THEN I should not see a popover
       */
      it('(without submenu) should NOT show a popover on hover', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));

        await user.hover(dashboardsLink);
        flushPopoverTimers();

        const popover = screen.queryByTestId(popoverId('Apps'));

        expect(popover).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item doesn’t have a submenu
       * WHEN I click on it
       * - THEN I should be redirected to its href
       * AND I should not see a side panel
       */
      it('(without submenu) should redirect without side panel when clicking item without submenu', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));

        const expectedHref = basicMock.navItems.primaryItems[0].href;

        await user.click(dashboardsLink);

        expect(dashboardsLink).toHaveAttribute('href', expectedHref);

        const sidePanel = screen.queryByTestId(sidePanelId);

        expect(sidePanel).not.toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item without a submenu has focus
       * WHEN I press the Enter key
       * - THEN I should be redirected to its href
       */
      it('(without submenu) should redirect on Enter when focused item has no submenu', async () => {
        render(<TestComponent isCollapsed items={basicMock.navItems} logo={basicMock.logo} />);

        const dashboardsLink = screen.getByTestId(primaryItemId('dashboards'));
        const expectedHref = basicMock.navItems.primaryItems[0].href;

        act(() => {
          dashboardsLink.focus();
        });

        await user.keyboard('{enter}');

        expect(dashboardsLink).toHaveAttribute('href', expectedHref);
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item is in beta
       * WHEN I hover over that item
       * THEN a tooltip shows up with the item label
       * AND a beta badge with beta icon
       */
      it('should show tooltip with label and beta badge on hover', async () => {
        render(
          <TestComponent
            isCollapsed
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
        expect(tooltip).toHaveTextContent('Dashboards');
        expect(betaIcon).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item is in tech preview
       * WHEN I hover over that item
       * THEN a tooltip shows up with the item label
       * AND a beta badge with flask icon
       */
      it('should show tooltip with label and flask badge on hover', async () => {
        render(
          <TestComponent
            isCollapsed
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
        expect(tooltip).toHaveTextContent('Cases');
        expect(flaskIcon).toBeInTheDocument();
      });

      /**
       * GIVEN the side navigation is in collapsed mode
       * AND a primary menu item is new
       * WHEN I hover over that item
       * THEN a tooltip shows up with the item label
       * AND a badge reading "New"
       */
      it('should show tooltip with label and new badge on hover', async () => {
        render(
          <TestComponent
            isCollapsed
            items={observabilityMock.navItems}
            logo={observabilityMock.logo}
          />
        );

        const alertsLink = screen.getByTestId(primaryItemId('alerts'));

        await user.hover(alertsLink);
        flushPopoverTimers();

        const tooltip = await screen.findByRole('tooltip');

        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent('Alerts');

        const badge = tooltip.querySelector('.euiBadge');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('New');
      });
    });

    describe('More menu', () => {
      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in collapsed mode
       * WHEN the navigation renders
       * THEN I should see a "More" primary menu item
       */
      it('should render the "More" primary menu item when items overflow', async () => {
        // Renders 10 primary menu items + "More" item
        render(
          <TestComponent isCollapsed items={securityMock.navItems} logo={securityMock.logo} />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        expect(moreButton).toBeInTheDocument();
      });

      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in collapsed mode
       * WHEN I hover over the "More" primary menu item
       * THEN I should see a popover with secondary menu
       */
      it('should show secondary menu popover on hover over "More"', async () => {
        render(
          <TestComponent isCollapsed items={securityMock.navItems} logo={securityMock.logo} />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        await user.hover(moreButton);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('More'));

        expect(popover).toBeInTheDocument();
      });

      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in collapsed mode
       * WHEN I hover over the "More" primary menu item
       * AND I click on an item that has a submenu
       * THEN the nested panel shows with the submenu
       * AND when I click on a submenu item
       * THEN the popover should close
       * - AND I should be redirected to that item’s href
       * AND I shouldn’t see a side panel
       */
      it('should navigate through nested panel and redirect on clicking a submenu item', async () => {
        render(
          <TestComponent isCollapsed items={securityMock.navItems} logo={securityMock.logo} />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        await user.click(moreButton);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('More'));

        const mlButton = within(popover).getByTestId(secondaryItemId('ml-overview'));

        await user.click(mlButton);
        flushPopoverTimers();

        const anomalyExplorerLink = await within(popover).findByTestId(
          nestedMenuItemId('anomaly-explorer')
        );

        await user.click(anomalyExplorerLink);

        await waitFor(() => {
          expect(popover).not.toBeInTheDocument();
        });

        const sidePanel = screen.queryByTestId(sidePanelId);

        await waitFor(() => {
          expect(sidePanel).not.toBeInTheDocument();
        });
      });

      /**
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in collapsed mode
       * WHEN I hover over the "More" primary menu item
       * AND I click on the menu item that doesn’t have a submenu
       * THEN the popover should close
       * - AND I should be redirected to that item’s href
       * AND I shouldn’t see a side panel
       */
      it('should close popover, redirect, and NOT open side panel after clicking on an item without submenu from "More"', async () => {
        render(
          <TestComponent isCollapsed items={securityMock.navItems} logo={securityMock.logo} />
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
       * GIVEN not all primary menu items fit the menu height
       * AND the navigation renders in collapsed mode
       * AND the initial active item is a submenu item of an item in the "More" menu
       * WHEN the navigation renders in collapsed mode
       * THEN the "More" primary menu item itself is in an active state
       * AND its parent primary menu item is active within the "More" menu popover
       * AND there is no side panel
       * AND the submenu item is active in its nested panel within the popover
       */
      it('should have active state and NOT open side panel when initial active submenu item is under "More"', async () => {
        render(
          <TestComponent
            logo={securityMock.logo}
            items={securityMock.navItems}
            isCollapsed
            initialActiveItemId={mlAnomalyExplorerItemId}
          />
        );

        const moreButton = await screen.findByTestId(moreMenuId);

        expect(moreButton).toHaveAttribute('data-highlighted', 'true');

        await user.hover(moreButton);
        flushPopoverTimers();

        const popover = await screen.findByTestId(popoverId('More'));

        const mlButton = within(popover).getByTestId(secondaryItemId('ml-overview'));

        expect(mlButton).toHaveAttribute('data-highlighted', 'true');

        await user.click(mlButton);

        const mlAnomalyExplorerLink = within(popover).getByTestId(
          nestedMenuItemId('anomaly-explorer')
        );

        expect(mlAnomalyExplorerLink).toHaveAttribute('aria-current', 'page');
        expect(mlAnomalyExplorerLink).toHaveAttribute('data-highlighted', 'true');

        const sidePanel = screen.queryByTestId(sidePanelId);

        expect(sidePanel).not.toBeInTheDocument();
      });
    });
  });
});
