/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject } from 'rxjs';
import { mockServices } from '../common/services/__mocks__/services.mock';
import {
  canAccessDashboardsApp,
  canAccessSecurityLanding,
  redirectDashboardOnlyLanding,
  shouldRedirectDashboardOnlyLanding,
  subscribeDashboardOnlyLanding,
} from './redirect_dashboard_only_landing';

const originalLocation = window.location;

const mockLocationPathname = (pathname: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, pathname },
  });
};

const setCapabilities = (overrides: {
  navLinks?: Record<string, boolean>;
  siemV5?: Record<string, boolean>;
  dashboard_v2?: Record<string, boolean>;
}) => {
  mockServices.application.capabilities = {
    ...mockServices.application.capabilities,
    ...overrides,
  };
};

describe('canAccessSecurityLanding', () => {
  it('returns false for a dashboard-only capability set', () => {
    expect(
      canAccessSecurityLanding({
        navLinks: { securitySolutionUI: true, dashboards: true },
        dashboard_v2: { show: true },
      } as never)
    ).toBe(false);
  });

  it('returns true when Security show is granted', () => {
    expect(canAccessSecurityLanding({ siemV5: { show: true } } as never)).toBe(true);
  });
});

describe('canAccessDashboardsApp', () => {
  it('returns true for dashboard_v2.show', () => {
    expect(canAccessDashboardsApp({ dashboard_v2: { show: true } } as never)).toBe(true);
  });

  it('returns false when only navLinks.dashboards is set', () => {
    expect(canAccessDashboardsApp({ navLinks: { dashboards: true } } as never)).toBe(false);
  });
});

describe('shouldRedirectDashboardOnlyLanding', () => {
  it.each(['/', '/app/security/get_started', '/app/security/get_started/'])(
    'returns true for dashboard-only users on %s',
    (pathname) => {
      expect(
        shouldRedirectDashboardOnlyLanding({
          pathname,
          canAccessGetStarted: false,
          canAccessDashboards: true,
        })
      ).toBe(true);
    }
  );

  it('returns false when the user can access Get started', () => {
    expect(
      shouldRedirectDashboardOnlyLanding({
        pathname: '/app/security/get_started',
        canAccessGetStarted: true,
        canAccessDashboards: true,
      })
    ).toBe(false);
  });

  it('returns false when the user cannot access dashboards', () => {
    expect(
      shouldRedirectDashboardOnlyLanding({
        pathname: '/app/security/get_started',
        canAccessGetStarted: false,
        canAccessDashboards: false,
      })
    ).toBe(false);
  });

  it('returns false on a non-landing path', () => {
    expect(
      shouldRedirectDashboardOnlyLanding({
        pathname: '/app/discover',
        canAccessGetStarted: false,
        canAccessDashboards: true,
      })
    ).toBe(false);
  });

  it('returns true for the Security app root', () => {
    expect(
      shouldRedirectDashboardOnlyLanding({
        pathname: '/app/security',
        canAccessGetStarted: false,
        canAccessDashboards: true,
      })
    ).toBe(true);
  });
});

describe('redirectDashboardOnlyLanding', () => {
  const navigateToApp = mockServices.application.navigateToApp as jest.Mock;
  const removeBasePath = jest.spyOn(mockServices.http.basePath, 'remove');

  beforeEach(() => {
    jest.clearAllMocks();
    setCapabilities({
      navLinks: {},
      siemV5: {},
      dashboard_v2: {},
    });
    removeBasePath.mockImplementation((pathname: string) => pathname);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('navigates dashboard-only users from Get started to dashboards', () => {
    mockLocationPathname('/s/default/app/security/get_started');
    removeBasePath.mockReturnValue('/app/security/get_started');
    setCapabilities({
      navLinks: {
        dashboards: true,
        securitySolutionUI: true,
      },
      dashboard_v2: { show: true },
    });

    redirectDashboardOnlyLanding(mockServices);

    expect(removeBasePath).toHaveBeenCalledWith('/s/default/app/security/get_started');
    expect(navigateToApp).toHaveBeenCalledWith('dashboards', { replace: true });
  });

  it('does not treat navLinks.securitySolutionUI as Get started access', () => {
    mockLocationPathname('/app/security/get_started');
    setCapabilities({
      navLinks: { securitySolutionUI: true },
      dashboard_v2: { show: true },
    });

    redirectDashboardOnlyLanding(mockServices);

    expect(navigateToApp).toHaveBeenCalledWith('dashboards', { replace: true });
  });

  it('does not navigate editors away from Get started', () => {
    mockLocationPathname('/app/security/get_started');
    setCapabilities({
      navLinks: {
        dashboards: true,
        securitySolutionUI: true,
      },
      siemV5: { show: true },
      dashboard_v2: { show: true },
    });

    redirectDashboardOnlyLanding(mockServices);

    expect(navigateToApp).not.toHaveBeenCalled();
  });
});

describe('subscribeDashboardOnlyLanding', () => {
  const navigateToApp = mockServices.application.navigateToApp as jest.Mock;
  const removeBasePath = jest.spyOn(mockServices.http.basePath, 'remove');
  const currentLocation$ = new Subject<string>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices.application.currentLocation$ = currentLocation$;
    setCapabilities({
      navLinks: {
        dashboards: true,
        securitySolutionUI: true,
      },
      dashboard_v2: { show: true },
      siemV5: {},
    });
    removeBasePath.mockImplementation((pathname: string) => pathname);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('redirects when location emits Get started for an inaccessible Security app', () => {
    mockLocationPathname('/app/dashboards');
    const subscription = subscribeDashboardOnlyLanding(mockServices);
    expect(navigateToApp).not.toHaveBeenCalled();

    mockLocationPathname('/app/security/get_started');
    currentLocation$.next('/app/security/get_started');

    expect(navigateToApp).toHaveBeenCalledWith('dashboards', { replace: true });
    subscription.unsubscribe();
  });
});
