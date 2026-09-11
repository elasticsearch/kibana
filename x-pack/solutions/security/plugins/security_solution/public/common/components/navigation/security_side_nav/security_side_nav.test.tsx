/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { AGENT_BUILDER_NAV_AT_TOP_FLAG } from '@kbn/navigation-plugin/public';
import { render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { SecurityPageName } from '../../../../app/types';
import type { createMockStore } from '../../../mock/create_store';
import { TestProviders } from '../../../mock';
import { BOTTOM_BAR_HEIGHT, EUI_HEADER_HEIGHT, SecuritySideNav } from './security_side_nav';
import type { SolutionSideNavProps } from '@kbn/security-solution-side-nav';
import type { NavigationLink } from '../../../links/types';
import { track } from '../../../lib/telemetry';
import { useKibana } from '../../../lib/kibana';
import { getNavCategories } from './categories';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { SecurityGroupName } from '@kbn/security-solution-navigation';

const settingsNavLink: NavigationLink = {
  id: SecurityPageName.administration,
  title: 'Settings',
  description: 'Settings description',
  categories: [{ label: 'test category', linkIds: [SecurityPageName.endpoints] }],
  links: [
    {
      id: SecurityPageName.endpoints,
      title: 'title 2',
      description: 'description 2',
      isBeta: true,
    },
  ],
};

const launchpadNavLink: NavigationLink = {
  id: SecurityPageName.launchpad,
  title: 'Launchpad',
  description: 'Launchpad',
  categories: [{ label: 'Launchpad category', linkIds: [] }],
  links: [
    {
      id: SecurityPageName.landing,
      title: 'Get started',
    },
    {
      id: SecurityPageName.siemReadiness,
      title: 'SIEM Readiness',
    },
  ],
};

const alertsNavLink: NavigationLink = {
  id: SecurityPageName.alerts,
  title: 'alerts',
  description: 'alerts description',
};

const mockSolutionSideNav = jest.fn((_: SolutionSideNavProps) => <></>);
jest.mock('@kbn/security-solution-side-nav', () => ({
  ...jest.requireActual('@kbn/security-solution-side-nav'),
  SolutionSideNav: (props: SolutionSideNavProps) => mockSolutionSideNav(props),
}));
jest.mock('../../../lib/kibana');

const mockUseRouteSpy = jest.fn(() => [{ pageName: SecurityPageName.alerts }]);
jest.mock('../../../utils/route/use_route_spy', () => ({
  useRouteSpy: () => mockUseRouteSpy(),
}));

jest.mock('../../../links/links_hooks', () => ({
  ...jest.requireActual('../../../links/links_hooks'),
  useParentLinks: (id: string) => [{ id }],
}));

const mockUseNavLinks = jest.fn();
jest.mock('../../../links/nav_links', () => ({
  ...jest.requireActual('../../../links/nav_links'),
  useNavLinks: () => mockUseNavLinks(),
}));
jest.mock('../../links', () => ({
  useGetSecuritySolutionLinkProps:
    () =>
    ({ deepLinkId }: { deepLinkId: SecurityPageName }) => ({
      href: `/${deepLinkId}`,
    }),
}));

const mockUseShowTimeline = jest.fn((): [boolean] => [false]);
jest.mock('../../../utils/timeline/use_show_timeline', () => ({
  useShowTimeline: () => mockUseShowTimeline(),
}));
const mockUseIsPolicySettingsBarVisible = jest.fn((): boolean => false);
jest.mock('../../../../management/pages/policy/view/policy_hooks', () => ({
  useIsPolicySettingsBarVisible: () => mockUseIsPolicySettingsBarVisible(),
}));

const mockUseIsExperimentalFeatureEnabled = jest.fn().mockReturnValue(false);
jest.mock('../../../hooks/use_experimental_features', () => ({
  ...jest.requireActual('../../../hooks/use_experimental_features'),
  useIsExperimentalFeatureEnabled: (feature: string) =>
    mockUseIsExperimentalFeatureEnabled(feature),
}));

const renderNav = (options?: { store?: ReturnType<typeof createMockStore> }) =>
  render(<SecuritySideNav />, {
    wrapper: ({ children }) => <TestProviders store={options?.store}>{children}</TestProviders>,
  });

describe('SecuritySideNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavLinks.mockReturnValue([alertsNavLink, settingsNavLink]);
    useKibana().services.chrome.hasHeaderBanner$ = jest.fn(() =>
      new BehaviorSubject(false).asObservable()
    );
    useKibana().services.serverless = undefined;
  });

  it('should render main items with external links', () => {
    mockUseNavLinks.mockReturnValue([alertsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedId: SecurityPageName.alerts,
        items: [
          expect.objectContaining({
            id: SecurityPageName.externalLinkDiscover,
          }),
          expect.objectContaining({
            id: SecurityPageName.externalLinkWorkflows,
            label: 'Workflows',
            position: 'top',
          }),
          expect.objectContaining({
            href: '/alerts',
            id: SecurityPageName.alerts,
            label: 'alerts',
            position: 'top',
          }),
        ],
        categories: getNavCategories(AIChatExperience.Classic, false, true, false),
        tracker: track,
      })
    );
  });

  it('should render the loader if items are still empty', () => {
    mockUseNavLinks.mockReturnValue([]);
    const result = renderNav();
    expect(result.getByTestId('sideNavLoader')).toBeInTheDocument();
    expect(mockSolutionSideNav).not.toHaveBeenCalled();
  });

  it('should render with selected id', () => {
    mockUseRouteSpy.mockReturnValueOnce([{ pageName: SecurityPageName.administration }]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedId: SecurityPageName.administration,
      })
    );
  });

  it('should render footer items', () => {
    mockUseNavLinks.mockReturnValue([settingsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: SecurityPageName.administration,
            label: 'Settings',
            href: '/administration',
            categories: settingsNavLink.categories,
            position: 'bottom',
            items: [
              {
                id: SecurityPageName.endpoints,
                label: 'title 2',
                href: '/endpoints',
                isBeta: true,
              },
            ],
          }),
        ]),
      })
    );
  });

  it('should not render disabled items', () => {
    mockUseNavLinks.mockReturnValue([{ ...alertsNavLink, disabled: true }, settingsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: SecurityPageName.administration,
          }),
        ]),
      })
    );
  });

  it('should render launchpad item in footer', () => {
    mockUseNavLinks.mockReturnValue([alertsNavLink, launchpadNavLink, settingsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: SecurityGroupName.launchpad,
            position: 'bottom',
          }),
        ]),
      })
    );
  });

  it('should place administration item in footer', () => {
    mockUseNavLinks.mockReturnValue([alertsNavLink, launchpadNavLink, settingsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: SecurityPageName.administration,
            position: 'bottom',
          }),
        ]),
      })
    );
  });

  it('should not include administration item in body', () => {
    mockUseNavLinks.mockReturnValue([settingsNavLink, alertsNavLink]);
    renderNav();
    const calls = mockSolutionSideNav.mock.calls;
    const lastCall = calls[calls.length - 1];
    const items = lastCall[0].items;
    const administrationItemsInBody = items.filter(
      (item) => item.id === SecurityPageName.administration && item.position !== 'bottom'
    );
    expect(administrationItemsInBody).toHaveLength(0);
  });

  it('should select launchpad when landing page is selected', () => {
    mockUseRouteSpy.mockReturnValueOnce([{ pageName: SecurityPageName.landing }]);
    const landingNavLink: NavigationLink = {
      id: SecurityPageName.landing,
      title: 'Get started',
      description: 'Get started description',
    };
    mockUseNavLinks.mockReturnValue([alertsNavLink, landingNavLink, settingsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedId: 'securityGroup:launchpad',
      })
    );
  });

  it('should maintain top position for most items', () => {
    mockUseNavLinks.mockReturnValue([alertsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: SecurityPageName.alerts,
            position: 'top',
          }),
        ]),
      })
    );
  });

  describe('panelTopOffset', () => {
    it('should render with top offset when chrome header banner is present', () => {
      useKibana().services.chrome.hasHeaderBanner$ = jest.fn(() =>
        new BehaviorSubject(true).asObservable()
      );
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          panelTopOffset: `calc(${EUI_HEADER_HEIGHT} + 32px)`,
        })
      );
    });

    it('should render without top offset when chrome header banner is not present', () => {
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          panelTopOffset: undefined,
        })
      );
    });
  });

  describe('panelBottomOffset', () => {
    it('should render with bottom offset when timeline bar visible', () => {
      mockUseIsPolicySettingsBarVisible.mockReturnValue(false);
      mockUseShowTimeline.mockReturnValue([true]);
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          panelBottomOffset: BOTTOM_BAR_HEIGHT,
        })
      );
    });

    it('should render with bottom offset when policy settings bar visible', () => {
      mockUseShowTimeline.mockReturnValue([false]);
      mockUseIsPolicySettingsBarVisible.mockReturnValue(true);
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          panelBottomOffset: BOTTOM_BAR_HEIGHT,
        })
      );
    });

    it('should not render with bottom offset when not needed', () => {
      mockUseShowTimeline.mockReturnValue([false]);
      mockUseIsPolicySettingsBarVisible.mockReturnValue(false);
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          panelBottomOffset: undefined,
        })
      );
    });
  });

  describe('enableAlertsAndAttacksAlignment setting', () => {
    beforeEach(() => {
      mockUseIsExperimentalFeatureEnabled.mockImplementation(
        (feature: string) => feature === 'enableAlertsAndAttacksAlignment'
      );
    });
    it('should call getNavCategories with true when setting is enabled', () => {
      useKibana().services.uiSettings.get = jest.fn().mockReturnValue(true);
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          categories: getNavCategories(AIChatExperience.Classic, true, true, false),
        })
      );
    });

    it('should call getNavCategories with false when setting is disabled', () => {
      useKibana().services.uiSettings.get = jest.fn().mockReturnValue(false);
      renderNav();
      expect(mockSolutionSideNav).toHaveBeenCalledWith(
        expect.objectContaining({
          categories: getNavCategories(AIChatExperience.Classic, false, true, false),
        })
      );
    });
  });

  it('should render agentBuilder external link when chat experience is Agent', () => {
    (useKibana().services.settings.client.get$ as jest.Mock).mockImplementation(() =>
      new BehaviorSubject(AIChatExperience.Agent).asObservable()
    );
    mockUseNavLinks.mockReturnValue([alertsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: SecurityPageName.externalLinkDiscover,
          }),
          expect.objectContaining({
            id: SecurityPageName.externalLinkWorkflows,
            label: 'Workflows',
            position: 'top',
          }),
          expect.objectContaining({
            href: '/alerts',
            id: SecurityPageName.alerts,
            label: 'alerts',
            position: 'top',
          }),
        ],
        categories: getNavCategories(AIChatExperience.Classic, false, true, false),
      })
    );
  });

  it('should render agentBuilder external link at top when chat experience is Agent and isAgentBuilderNavAtTop is true', () => {
    (useKibana().services.settings.client.get$ as jest.Mock).mockImplementation(() =>
      new BehaviorSubject(AIChatExperience.Agent).asObservable()
    );
    (useKibana().services.featureFlags.getBooleanValue as jest.Mock).mockImplementation(
      (flag: string) => flag === AGENT_BUILDER_NAV_AT_TOP_FLAG
    );
    mockUseNavLinks.mockReturnValue([alertsNavLink]);
    renderNav();
    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedId: SecurityPageName.alerts,
        items: [
          expect.objectContaining({
            id: SecurityPageName.externalLinkAgentBuilder,
            label: 'Agents',
            position: 'top',
          }),
          expect.objectContaining({
            id: SecurityPageName.externalLinkDiscover,
            label: 'Discover',
            position: 'top',
          }),
          expect.objectContaining({
            id: SecurityPageName.externalLinkWorkflows,
            label: 'Workflows',
            position: 'top',
          }),
          expect.objectContaining({
            href: '/alerts',
            id: SecurityPageName.alerts,
            label: 'alerts',
            position: 'top',
          }),
        ],
        categories: getNavCategories(AIChatExperience.Agent, false, true, true),
      })
    );
  });

  it('should build external links using `getUrlForApp` so basePath and space are applied', () => {
    (useKibana().services.application.getUrlForApp as jest.Mock).mockImplementation(
      (appId: string, options?: { path?: string }) =>
        `/test-basepath/s/my-space/app/${appId}${options?.path ?? ''}`
    );
    (useKibana().services.settings.client.get$ as jest.Mock).mockImplementation(() =>
      new BehaviorSubject(AIChatExperience.Agent).asObservable()
    );
    mockUseNavLinks.mockReturnValue([alertsNavLink]);
    renderNav();

    expect(useKibana().services.application.getUrlForApp as jest.Mock).toHaveBeenCalledWith(
      'agent_builder',
      {
        path: '/agents',
      }
    );
    expect(useKibana().services.application.getUrlForApp as jest.Mock).toHaveBeenCalledWith(
      'discover'
    );
    expect(useKibana().services.application.getUrlForApp as jest.Mock).toHaveBeenCalledWith(
      'workflows'
    );

    expect(mockSolutionSideNav).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: SecurityPageName.externalLinkAgentBuilder,
            href: '/test-basepath/s/my-space/app/agent_builder/agents',
          }),
          expect.objectContaining({
            id: SecurityPageName.externalLinkDiscover,
            href: '/test-basepath/s/my-space/app/discover',
          }),
          expect.objectContaining({
            id: SecurityPageName.externalLinkWorkflows,
            href: '/test-basepath/s/my-space/app/workflows',
          }),
        ]),
      })
    );
  });
});
