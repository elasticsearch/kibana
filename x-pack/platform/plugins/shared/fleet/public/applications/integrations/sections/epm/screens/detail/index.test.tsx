/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy, memo } from 'react';
import { Route } from '@kbn/shared-ux-router';
import { act } from '@testing-library/react';

import { INTEGRATIONS_ROUTING_PATHS, pagePathGetters } from '../../../../constants';
import type {
  CheckPermissionsResponse,
  GetAgentPoliciesResponse,
  GetFleetStatusResponse,
  GetInfoResponse,
  GetPackagePoliciesResponse,
  GetStatsResponse,
  GetSettingsResponse,
  GetVerificationKeyIdResponse,
} from '../../../../../../../common/types/rest_spec';
import type { KibanaAssetType } from '../../../../../../../common/types/models';
import { KibanaSavedObjectType } from '../../../../../../../common/types/models';
import {
  agentPolicyRouteService,
  appRoutesService,
  epmRouteService,
  fleetSetupRouteService,
  packagePolicyRouteService,
} from '../../../../../../../common/services';
import type { MockedFleetStartServices, TestRenderer } from '../../../../../../mock';
import { createIntegrationsTestRendererMock } from '../../../../../../mock';

import { ExperimentalFeaturesService } from '../../../../services';
import { allowedExperimentalValues } from '../../../../../../../common/experimental_features';

import type { DetailViewPanelName } from '.';
import { Detail } from '.';

// Default timeout for tests is 5s, increasing to 8s due to long running requests leading to frequent flakyness
const TESTS_TIMEOUT = 8000;

// @ts-ignore this saves us having to define all experimental features
ExperimentalFeaturesService.init({});

describe('When on integration detail', () => {
  const pkgkey = 'nginx-0.3.7';
  const detailPageUrlPath = pagePathGetters.integration_details_overview({ pkgkey })[1];
  let testRenderer: TestRenderer;
  let renderResult: ReturnType<typeof testRenderer.render>;
  let mockedApi: MockedApi<EpmPackageDetailsResponseProvidersMock>;

  const render = async () => {
    await act(async () => {
      renderResult = testRenderer.render(
        <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details}>
          <Detail />
        </Route>
      );
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    testRenderer = createIntegrationsTestRendererMock();
    mockedApi = mockApiCalls(testRenderer.startServices.http);
    act(() => testRenderer.mountHistory.push(detailPageUrlPath));
  });

  describe('and the package is installed', () => {
    beforeEach(async () => {
      await render();
      await act(() => mockedApi.waitForApi());
      // All those waitForApi call are needed to avoid flakyness because details conditionnaly refetch multiple time
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    it('should display policy usage count', async () => {
      expect(await renderResult.findByTestId('policyCount')).not.toBeNull();
    });

    it('should show the Policies tab', async () => {
      expect(await renderResult.findByTestId('tab-policies')).not.toBeNull();
    });
  });

  describe('and Alerting tab visibility', () => {
    it('should show Alerting tab when package has alerting type assets', async () => {
      const baseResponse = mockedApi.responseProvider.epmGetInfo('nginx');
      const itemWithAlertingAssets = {
        ...baseResponse.item,
        assets: {
          ...baseResponse.item.assets,
          kibana: {
            ...baseResponse.item.assets?.kibana,
            alerting_rule_template: [
              {
                pkgkey: 'nginx-0.3.7',
                service: 'kibana',
                type: 'alerting_rule_template',
                file: 'nginx-inactivity.json',
              },
            ],
          },
        },
      };
      mockedApi.responseProvider.epmGetInfo.mockReturnValue({
        ...baseResponse,
        item: { ...itemWithAlertingAssets, type: 'input' as const } as typeof baseResponse.item,
      });
      await render();
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());

      expect(await renderResult.findByTestId('tab-alerting')).not.toBeNull();
    });

    it('should not show Alerting tab when package has no alerting type assets and inactivity alerting is off', async () => {
      ExperimentalFeaturesService.init({
        ...allowedExperimentalValues,
        enableIntegrationInactivityAlerting: false,
      });

      const baseResponse = mockedApi.responseProvider.epmGetInfo('nginx');
      const kibanaAssets = baseResponse.item.assets?.kibana as Record<string, unknown> | undefined;
      const itemWithoutAlertingAssets = {
        ...baseResponse.item,
        assets: {
          ...baseResponse.item.assets,
          kibana: {
            dashboard: kibanaAssets?.dashboard ?? [],
            search: kibanaAssets?.search ?? [],
            visualization: kibanaAssets?.visualization ?? [],
          },
        },
      };
      mockedApi.responseProvider.epmGetInfo.mockReturnValue({
        ...baseResponse,
        item: itemWithoutAlertingAssets as typeof baseResponse.item,
      });
      await render();
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());

      expect(renderResult.queryByTestId('tab-alerting')).toBeNull();

      // Reset to default
      ExperimentalFeaturesService.init(allowedExperimentalValues);
    });

    it('should show Alerting tab for installed integration packages when inactivity alerting is enabled', async () => {
      ExperimentalFeaturesService.init({
        ...allowedExperimentalValues,
        enableIntegrationInactivityAlerting: true,
      });

      const baseResponse = mockedApi.responseProvider.epmGetInfo('nginx');
      const kibanaAssets = baseResponse.item.assets?.kibana as Record<string, unknown> | undefined;
      const itemWithoutAlertingAssets = {
        ...baseResponse.item,
        type: 'integration' as const,
        assets: {
          ...baseResponse.item.assets,
          kibana: {
            dashboard: kibanaAssets?.dashboard ?? [],
            search: kibanaAssets?.search ?? [],
            visualization: kibanaAssets?.visualization ?? [],
          },
        },
      };
      mockedApi.responseProvider.epmGetInfo.mockReturnValue({
        ...baseResponse,
        item: itemWithoutAlertingAssets as typeof baseResponse.item,
      });
      await render();
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());

      expect(await renderResult.findByTestId('tab-alerting')).not.toBeNull();

      // Reset to default
      ExperimentalFeaturesService.init(allowedExperimentalValues);
    });

    it('should show Alerting tab for pre-installed packages with alerting assets in installationInfo', async () => {
      const baseResponse = mockedApi.responseProvider.epmGetInfo('nginx');
      const kibanaAssets = baseResponse.item.assets?.kibana as Record<string, unknown> | undefined;
      const itemWithInstalledAlertingAssets = {
        ...baseResponse.item,
        assets: {
          ...baseResponse.item.assets,
          kibana: {
            dashboard: kibanaAssets?.dashboard ?? [],
            search: kibanaAssets?.search ?? [],
            visualization: kibanaAssets?.visualization ?? [],
          },
        },
        installationInfo: {
          install_source: 'bundled' as const,
          installed_kibana: [
            {
              id: 'nginx-inactivity-rule',
              type: KibanaSavedObjectType.alertingRuleTemplate,
            },
          ],
        },
      };
      mockedApi.responseProvider.epmGetInfo.mockReturnValue({
        ...baseResponse,
        item: itemWithInstalledAlertingAssets as typeof baseResponse.item,
      });
      await render();
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());

      expect(await renderResult.findByTestId('tab-alerting')).not.toBeNull();
    });
  });

  function mockGAAndPrereleaseVersions(pkgVersion: string) {
    const unInstalledPackage = mockedApi.responseProvider.epmGetInfo('nginx');
    unInstalledPackage.item.status = 'not_installed';
    unInstalledPackage.item.version = pkgVersion;

    const isViewingPrerelease = pkgVersion.includes('-');

    mockedApi.responseProvider.epmGetInfo.mockImplementation((name, version, query) => {
      if (query?.prerelease === false) {
        const gaPackage = { item: { ...unInstalledPackage.item } };
        gaPackage.item.version = '1.0.0';
        gaPackage.item.latestVersion = '1.0.0';
        return gaPackage;
      }
      if (query?.prerelease === true) {
        // The prerelease query uses a specific version; latestVersion reflects newest prerelease.
        const pkg = { item: { ...unInstalledPackage.item } };
        pkg.item.latestVersion = isViewingPrerelease ? pkgVersion : '1.0.0';
        return pkg;
      }
      return unInstalledPackage;
    });
  }

  describe('and the package is not installed and prerelease enabled', () => {
    beforeEach(async () => {
      mockedApi.responseProvider.getSettings.mockReturnValue({
        item: { prerelease_integrations_enabled: true, id: '' },
      });
      mockGAAndPrereleaseVersions('1.0.0-beta');
      await render();
      await act(() => mockedApi.waitForApi());
      // All those waitForApi call are needed to avoid flakyness because details conditionnaly refetch multiple time
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    it('should display expected version and prerelease elements', async () => {
      expect(renderResult.queryByTestId('policyCount')).toBeNull();
      expect(renderResult.queryByTestId('tab-policies')).toBeNull();

      const versionSelect = renderResult.queryByTestId('versionSelect');
      expect(versionSelect?.textContent).toEqual('1.0.0-beta1.0.0');
      expect((versionSelect as any)?.value).toEqual('1.0.0-beta');

      const calloutTitle = renderResult.getByTestId('prereleaseCallout');
      expect(calloutTitle).toBeInTheDocument();
      const calloutGABtn = renderResult.getAllByTestId('switchToGABtn')[0];
      expect((calloutGABtn as any)?.href).toEqual(
        'http://localhost/mock/app/integrations/detail/nginx-1.0.0/overview'
      );
    });
  });

  describe('and the package is not installed while viewing an old pinned version with prerelease enabled', () => {
    // Reproduces the bug from https://github.com/elastic/ingest-dev/issues/7934:
    // URL is pinned to an old version (0.3.7) after uninstall; GA=1.0.0 and prerelease=1.0.0-beta exist.
    // Before the fix, showVersionSelect was false (version ≠ latestGA or latestPrerelease) → no dropdown.
    // After the fix, notInstalled status also reveals the dropdown.
    beforeEach(async () => {
      mockedApi.responseProvider.getSettings.mockReturnValue({
        item: { prerelease_integrations_enabled: true, id: '' },
      });

      // URL is pinned to 0.3.7 (old). GA=1.0.0, prerelease=1.0.0-beta. Package is not installed.
      const baseResponse = mockedApi.responseProvider.epmGetInfo('nginx');
      const notInstalledOldVersion = {
        ...baseResponse.item,
        status: 'not_installed' as const,
        version: '0.3.7',
        latestVersion: '1.0.0',
      };

      mockedApi.responseProvider.epmGetInfo.mockImplementation((name, version, query) => {
        if (query?.prerelease === false) {
          // GA query (version=0.3.7, prerelease=false): latestVersion = latest GA
          return { item: { ...notInstalledOldVersion, version: '0.3.7', latestVersion: '1.0.0' } };
        }
        if (query?.prerelease === true) {
          // Prerelease query (version=0.3.7, prerelease=true): latestVersion = latest prerelease
          return {
            item: { ...notInstalledOldVersion, version: '0.3.7', latestVersion: '1.0.0-beta' },
          };
        }
        // main query (version=0.3.7, prerelease=true from settings)
        return { item: notInstalledOldVersion };
      });

      await render();
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    it('should display the version selector even when viewing an old pinned version after uninstall', async () => {
      const versionSelect = renderResult.queryByTestId('versionSelect');
      expect(versionSelect).toBeInTheDocument();
      expect(renderResult.queryByTestId('versionText')).not.toBeInTheDocument();
    });
  });

  describe('and the package is not installed and prerelease disabled', () => {
    beforeEach(async () => {
      mockGAAndPrereleaseVersions('1.0.0');
      mockedApi.responseProvider.getSettings.mockReturnValue({
        item: { prerelease_integrations_enabled: false, id: '' },
      });
      await render();
      await act(() => mockedApi.waitForApi());
      // All those waitForApi call are needed to avoid flakyness because details conditionnaly refetch multiple time
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    it('should NOT display policy usage count', async () => {
      expect(renderResult.queryByTestId('policyCount')).toBeNull();
    });

    it('should NOT display the Policies tab', async () => {
      expect(renderResult.queryByTestId('tab-policies')).toBeNull();
    });

    it('should display static version text and no callout if prerelease setting disabled and only one version available', async () => {
      // Only one version available (no newer GA, no prerelease) → selector collapses to static text.
      expect(renderResult.queryByTestId('versionSelect')).toBeNull();
      expect(renderResult.queryByTestId('versionText')).toBeInTheDocument();
      expect(renderResult.queryByTestId('prereleaseCallout')).toBeNull();
    });
  });

  describe('and a custom UI extension is NOT registered', () => {
    beforeEach(async () => {
      mockedApi.responseProvider.getSettings.mockReturnValue({
        item: { prerelease_integrations_enabled: false, id: '' },
      });
      await render();
      await act(() => mockedApi.waitForApi());
      // All those waitForApi call are needed to avoid flakyness because details conditionnaly refetch multiple time
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    it('should show overview and settings tabs', () => {
      const tabs: DetailViewPanelName[] = ['overview', 'settings'];
      for (const tab of tabs) {
        expect(renderResult.getByTestId(`tab-${tab}`));
      }
    });

    it('should not show a custom tab', () => {
      expect(renderResult.queryByTestId('tab-custom')).toBeNull();
    });

    it('should redirect if custom url is accessed', () => {
      act(() => {
        testRenderer.mountHistory.push(
          pagePathGetters.integration_details_custom({ pkgkey: 'nginx-0.3.7' })[1]
        );
      });
      expect(testRenderer.mountHistory.location.pathname).toEqual('/detail/nginx-0.3.7/overview');
    });
  });

  describe('and a custom tab UI extension is registered', () => {
    // Because React Lazy components are loaded async (Promise), we setup this "watcher" Promise
    // that is `resolved` once the lazy components actually renders.
    let lazyComponentWasRendered: Promise<void>;

    beforeEach(async () => {
      let setWasRendered: () => void;
      mockedApi.responseProvider.getSettings.mockReturnValue({
        item: { prerelease_integrations_enabled: false, id: '' },
      });
      lazyComponentWasRendered = new Promise((resolve) => {
        setWasRendered = resolve;
      });

      const CustomComponent = lazy(async () => {
        return {
          default: memo(() => {
            setWasRendered();
            return <div data-test-subj="custom-hello">hello</div>;
          }),
        };
      });

      testRenderer.startInterface.registerExtension({
        package: 'nginx',
        view: 'package-detail-custom',
        Component: CustomComponent,
      });

      await render();
    });

    afterEach(() => {
      // @ts-ignore
      lazyComponentWasRendered = undefined;
    });

    it('should display "custom" tab in navigation', () => {
      expect(renderResult.getByTestId('tab-custom'));
    });

    it('should display custom content when tab is clicked', async () => {
      act(() => {
        testRenderer.mountHistory.push(
          pagePathGetters.integration_details_custom({ pkgkey: 'nginx-0.3.7' })[1]
        );
      });
      await lazyComponentWasRendered;
      expect(renderResult.getByTestId('custom-hello'));
    });
  });

  describe('and a custom assets UI extension is registered', () => {
    let lazyComponentWasRendered: Promise<void>;

    beforeEach(async () => {
      let setWasRendered: () => void;
      lazyComponentWasRendered = new Promise((resolve) => {
        setWasRendered = resolve;
      });

      const CustomComponent = lazy(async () => {
        return {
          default: memo(() => {
            setWasRendered();
            return <div data-test-subj="custom-hello">hello</div>;
          }),
        };
      });

      testRenderer.startInterface.registerExtension({
        package: 'nginx',
        view: 'package-detail-assets',
        Component: CustomComponent,
      });

      await render();

      await act(() => mockedApi.waitForApi());
      // All those waitForApi call are needed to avoid flakyness because details conditionnaly refetch multiple time
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    afterEach(() => {
      // @ts-ignore
      lazyComponentWasRendered = undefined;
    });

    it('should display "assets" tab in navigation', async () => {
      expect(renderResult.getByTestId('tab-assets'));
    });

    it('should display custom assets when tab is clicked', async () => {
      act(() => {
        testRenderer.mountHistory.push(
          pagePathGetters.integration_details_assets({ pkgkey: 'nginx-0.3.7' })[1]
        );
      });
      await lazyComponentWasRendered;
      expect(renderResult.getByTestId('custom-hello'));
    });
  });

  describe('and the Add integration button is clicked', () => {
    beforeEach(async () => {
      await render();
      await act(() => mockedApi.waitForApi());
      // All those waitForApi call are needed to avoid flakyness because details conditionnaly refetch multiple time
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
      await act(() => mockedApi.waitForApi());
    }, TESTS_TIMEOUT);

    it('should link to the create page', () => {
      const addButton = renderResult.getByTestId('addIntegrationPolicyButton') as HTMLAnchorElement;
      expect(addButton.href).toEqual(
        'http://localhost/mock/app/fleet/integrations/nginx-0.3.7/add-integration'
      );
    });
  });

  describe('and on the Policies Tab', () => {
    const policiesTabURLPath = pagePathGetters.integration_details_policies({ pkgkey })[1];
    beforeEach(async () => {
      testRenderer.mountHistory.push(policiesTabURLPath);
      await render();
    });

    it('should display policies list', () => {
      const table = renderResult.getByTestId('integrationPolicyTable');
      expect(table).not.toBeNull();
    });

    it('should link to integration policy detail when an integration policy is clicked', async () => {
      await mockedApi.waitForApi();
      const firstPolicy = renderResult.getAllByTestId(
        'integrationNameLink'
      )[0] as HTMLAnchorElement;
      expect(firstPolicy.href).toEqual(
        'http://localhost/mock/app/integrations/edit-integration/e8a37031-2907-44f6-89d2-98bd493f60dc'
      );
    });
  });
});

interface MockedApi<
  R extends Record<string, jest.MockedFunction<any>> = Record<string, jest.MockedFunction<any>>
> {
  /** Will return a promise that resolves when triggered APIs are complete */
  waitForApi: () => Promise<void>;
  /** A object containing the list of API response provider functions that are used by the mocked API */
  responseProvider: R;
}

interface EpmPackageDetailsResponseProvidersMock {
  epmGetInfo: jest.MockedFunction<
    (pkgName: string, pkgVersion?: string, options?: { prerelease?: boolean }) => GetInfoResponse
  >;
  epmGetFile: jest.MockedFunction<() => string>;
  epmGetStats: jest.MockedFunction<() => GetStatsResponse>;
  fleetSetup: jest.MockedFunction<() => GetFleetStatusResponse>;
  packagePolicyList: jest.MockedFunction<() => GetPackagePoliciesResponse>;
  agentPolicyList: jest.MockedFunction<() => GetAgentPoliciesResponse>;
  appCheckPermissions: jest.MockedFunction<() => CheckPermissionsResponse>;
  getSettings: jest.MockedFunction<() => GetSettingsResponse>;
  getVerificationKeyId: jest.MockedFunction<() => GetVerificationKeyIdResponse>;
}

const mockApiCalls = (
  http: MockedFleetStartServices['http']
): MockedApi<EpmPackageDetailsResponseProvidersMock> => {
  let inflightApiCalls = 0;
  const apiDoneListeners: Array<() => void> = [];
  const markApiCallAsHandled = async () => {
    inflightApiCalls++;
    await new Promise((r) => setTimeout(r, 1));
    inflightApiCalls--;

    // If no more pending API calls, then notify listeners
    if (inflightApiCalls === 0 && apiDoneListeners.length > 0) {
      apiDoneListeners.splice(0).forEach((listener) => listener());
    }
  };

  // @ts-ignore
  const epmPackageResponse: GetInfoResponse = {
    item: {
      name: 'nginx',
      title: 'Nginx',
      version: '0.3.7',
      release: 'experimental',
      description: 'Nginx Integration',
      type: 'integration',
      download: '/epr/nginx/nginx-0.3.7.zip',
      path: '/package/nginx/0.3.7',
      icons: [
        {
          src: '/img/logo_nginx.svg',
          path: '/package/nginx/0.3.7/img/logo_nginx.svg',
          title: 'logo nginx',
          size: '32x32',
          type: 'image/svg+xml',
        },
      ],
      format_version: '1.0.0',
      readme: '/package/nginx/0.3.7/docs/README.md',
      license: 'basic',
      categories: ['web', 'security'],
      conditions: { 'kibana.version': '^7.9.0' },
      screenshots: [
        {
          src: '/img/kibana-nginx.png',
          path: '/package/nginx/0.3.7/img/kibana-nginx.png',
          title: 'kibana nginx',
          size: '1218x1266',
          type: 'image/png',
        },
        {
          src: '/img/metricbeat-nginx.png',
          path: '/package/nginx/0.3.7/img/metricbeat-nginx.png',
          title: 'metricbeat nginx',
          size: '2560x2100',
          type: 'image/png',
        },
      ],
      assets: {
        kibana: {
          dashboard: [
            {
              pkgkey: 'nginx-0.3.7',
              service: 'kibana',
              type: 'dashboard' as KibanaAssetType,
              file: 'nginx-023d2930-f1a5-11e7-a9ef-93c69af7b129.json',
            },
          ],
          search: [
            {
              pkgkey: 'nginx-0.3.7',
              service: 'kibana',
              type: 'search' as KibanaAssetType,
              file: 'nginx-6d9e66d0-a1f0-11e7-928f-5dbe6f6f5519.json',
            },
          ],
          visualization: [
            {
              pkgkey: 'nginx-0.3.7',
              service: 'kibana',
              type: 'visualization' as KibanaAssetType,
              file: 'nginx-0dd6f320-a29f-11e7-928f-5dbe6f6f5519.json',
            },
          ],
        },
      },
      policy_templates: [
        {
          name: 'nginx',
          title: 'Nginx logs and metrics',
          description: 'Collect logs and metrics from Nginx instances',
          inputs: [
            {
              type: 'logfile',
              title: 'Collect logs from Nginx instances',
              description: 'Collecting Nginx access, error and ingress controller logs',
            },
            {
              type: 'nginx/metrics',
              vars: [
                {
                  name: 'hosts',
                  type: 'text',
                  title: 'Hosts',
                  multi: true,
                  required: true,
                  show_user: true,
                  default: ['http://127.0.0.1:80'],
                },
              ],
              title: 'Collect metrics from Nginx instances',
              description: 'Collecting Nginx stub status metrics',
            },
          ],
          multiple: true,
        },
      ],
      data_streams: [
        {
          type: 'logs',
          dataset: 'nginx.access',
          title: 'Nginx access logs',
          release: 'experimental',
          ingest_pipeline: 'default',
          streams: [
            {
              input: 'logfile',
              vars: [
                {
                  name: 'paths',
                  type: 'text',
                  title: 'Paths',
                  multi: true,
                  required: true,
                  show_user: true,
                  default: ['/var/log/nginx/access.log*'],
                },
              ],
              template_path: 'stream.yml.hbs',
              title: 'Nginx access logs',
              description: 'Collect Nginx access logs',
              enabled: true,
            },
          ],
          package: 'nginx',
          path: 'access',
        },
        {
          type: 'logs',
          dataset: 'nginx.error',
          title: 'Nginx error logs',
          release: 'experimental',
          ingest_pipeline: 'default',
          streams: [
            {
              input: 'logfile',
              vars: [
                {
                  name: 'paths',
                  type: 'text',
                  title: 'Paths',
                  multi: true,
                  required: true,
                  show_user: true,
                  default: ['/var/log/nginx/error.log*'],
                },
              ],
              template_path: 'stream.yml.hbs',
              title: 'Nginx error logs',
              description: 'Collect Nginx error logs',
              enabled: true,
            },
          ],
          package: 'nginx',
          path: 'error',
        },
        {
          type: 'logs',
          dataset: 'nginx.ingress_controller',
          title: 'Nginx ingress_controller logs',
          release: 'experimental',
          ingest_pipeline: 'default',
          streams: [
            {
              input: 'logfile',
              vars: [
                {
                  name: 'paths',
                  type: 'text',
                  title: 'Paths',
                  multi: true,
                  required: true,
                  show_user: true,
                  default: ['/var/log/nginx/ingress.log*'],
                },
              ],
              template_path: 'stream.yml.hbs',
              title: 'Nginx ingress controller logs',
              description: 'Collect Nginx ingress controller logs',
              enabled: false,
            },
          ],
          package: 'nginx',
          path: 'ingress_controller',
        },
        {
          type: 'metrics',
          dataset: 'nginx.stubstatus',
          title: 'Nginx stubstatus metrics',
          release: 'experimental',
          streams: [
            {
              input: 'nginx/metrics',
              vars: [
                {
                  name: 'period',
                  type: 'text',
                  title: 'Period',
                  multi: false,
                  required: true,
                  show_user: true,
                  default: '10s',
                },
                {
                  name: 'server_status_path',
                  type: 'text',
                  title: 'Server Status Path',
                  multi: false,
                  required: true,
                  show_user: false,
                  default: '/nginx_status',
                },
              ],
              template_path: 'stream.yml.hbs',
              title: 'Nginx stub status metrics',
              description: 'Collect Nginx stub status metrics',
              enabled: true,
            },
          ],
          package: 'nginx',
          path: 'stubstatus',
        },
      ],
      owner: { github: 'elastic/integrations-services' },
      latestVersion: '0.3.7',
      status: 'installed',
    },
  } as GetInfoResponse;

  const packageReadMe = `
# Nginx Integration

This integration periodically fetches metrics from [Nginx](https://nginx.org/) servers. It can parse access and error
logs created by the HTTP server.

## Compatibility

The Nginx \`stubstatus\` metrics was tested with Nginx 1.9 and are expected to work with all version >= 1.9.
The logs were tested with version 1.10.
On Windows, the module was tested with Nginx installed from the Chocolatey repository.
`;

  const agentsSetupResponse: GetFleetStatusResponse = {
    isReady: true,
    missing_requirements: [],
    missing_optional_features: [],
  };

  const packagePoliciesResponse: GetPackagePoliciesResponse = {
    items: [
      {
        id: 'e8a37031-2907-44f6-89d2-98bd493f60dc',
        version: 'WzgzMiwxXQ==',
        name: 'nginx-1',
        description: '',
        namespace: 'default',
        policy_id: '521c1b70-3976-11eb-ad1c-3baa423084d9',
        policy_ids: ['521c1b70-3976-11eb-ad1c-3baa423084d9'],
        enabled: true,
        inputs: [
          {
            type: 'logfile',
            enabled: true,
            streams: [
              {
                enabled: true,
                data_stream: { type: 'logs', dataset: 'nginx.access' },
                vars: { paths: { value: ['/var/log/nginx/access.log*'], type: 'text' } },
                id: 'logfile-nginx.access-e8a37031-2907-44f6-89d2-98bd493f60dc',
                compiled_stream: {
                  paths: ['/var/log/nginx/access.log*'],
                  exclude_files: ['.gz$'],
                  processors: [{ add_locale: null }],
                },
              },
              {
                enabled: true,
                data_stream: { type: 'logs', dataset: 'nginx.error' },
                vars: { paths: { value: ['/var/log/nginx/error.log*'], type: 'text' } },
                id: 'logfile-nginx.error-e8a37031-2907-44f6-89d2-98bd493f60dc',
                compiled_stream: {
                  paths: ['/var/log/nginx/error.log*'],
                  exclude_files: ['.gz$'],
                  multiline: {
                    pattern: '^\\d{4}\\/\\d{2}\\/\\d{2} ',
                    negate: true,
                    match: 'after',
                  },
                  processors: [{ add_locale: null }],
                },
              },
              {
                enabled: false,
                data_stream: { type: 'logs', dataset: 'nginx.ingress_controller' },
                vars: { paths: { value: ['/var/log/nginx/ingress.log*'], type: 'text' } },
                id: 'logfile-nginx.ingress_controller-e8a37031-2907-44f6-89d2-98bd493f60dc',
              },
            ],
          },
          {
            type: 'nginx/metrics',
            enabled: true,
            streams: [
              {
                enabled: true,
                data_stream: { type: 'metrics', dataset: 'nginx.stubstatus' },
                vars: {
                  period: { value: '10s', type: 'text' },
                  server_status_path: { value: '/nginx_status', type: 'text' },
                },
                id: 'nginx/metrics-nginx.stubstatus-e8a37031-2907-44f6-89d2-98bd493f60dc',
                compiled_stream: {
                  metricsets: ['stubstatus'],
                  hosts: ['http://127.0.0.1:80'],
                  period: '10s',
                  server_status_path: '/nginx_status',
                },
              },
            ],
            vars: { hosts: { value: ['http://127.0.0.1:80'], type: 'text' } },
          },
        ],
        package: { name: 'nginx', title: 'Nginx', version: '0.3.7' },
        revision: 1,
        created_at: '2020-12-09T13:46:31.013Z',
        created_by: 'elastic',
        updated_at: '2020-12-09T13:46:31.013Z',
        updated_by: 'elastic',
      },
      {
        id: 'e3t37031-2907-44f6-89d2-5555555555',
        version: 'WrrrMiwxXQ==',
        name: 'nginx-2',
        description: '',
        namespace: 'default',
        policy_id: '125c1b70-3976-11eb-ad1c-3baa423085y6',
        policy_ids: ['125c1b70-3976-11eb-ad1c-3baa423085y6'],
        enabled: true,
        inputs: [
          {
            type: 'logfile',
            enabled: true,
            streams: [
              {
                enabled: true,
                data_stream: { type: 'logs', dataset: 'nginx.access' },
                vars: { paths: { value: ['/var/log/nginx/access.log*'], type: 'text' } },
                id: 'logfile-nginx.access-e8a37031-2907-44f6-89d2-98bd493f60dc',
                compiled_stream: {
                  paths: ['/var/log/nginx/access.log*'],
                  exclude_files: ['.gz$'],
                  processors: [{ add_locale: null }],
                },
              },
              {
                enabled: true,
                data_stream: { type: 'logs', dataset: 'nginx.error' },
                vars: { paths: { value: ['/var/log/nginx/error.log*'], type: 'text' } },
                id: 'logfile-nginx.error-e8a37031-2907-44f6-89d2-98bd493f60dc',
                compiled_stream: {
                  paths: ['/var/log/nginx/error.log*'],
                  exclude_files: ['.gz$'],
                  multiline: {
                    pattern: '^\\d{4}\\/\\d{2}\\/\\d{2} ',
                    negate: true,
                    match: 'after',
                  },
                  processors: [{ add_locale: null }],
                },
              },
              {
                enabled: false,
                data_stream: { type: 'logs', dataset: 'nginx.ingress_controller' },
                vars: { paths: { value: ['/var/log/nginx/ingress.log*'], type: 'text' } },
                id: 'logfile-nginx.ingress_controller-e8a37031-2907-44f6-89d2-98bd493f60dc',
              },
            ],
          },
          {
            type: 'nginx/metrics',
            enabled: true,
            streams: [
              {
                enabled: true,
                data_stream: { type: 'metrics', dataset: 'nginx.stubstatus' },
                vars: {
                  period: { value: '10s', type: 'text' },
                  server_status_path: { value: '/nginx_status', type: 'text' },
                },
                id: 'nginx/metrics-nginx.stubstatus-e8a37031-2907-44f6-89d2-98bd493f60dc',
                compiled_stream: {
                  metricsets: ['stubstatus'],
                  hosts: ['http://127.0.0.1:80'],
                  period: '10s',
                  server_status_path: '/nginx_status',
                },
              },
            ],
            vars: { hosts: { value: ['http://127.0.0.1:80'], type: 'text' } },
          },
        ],
        package: { name: 'nginx', title: 'Nginx', version: '0.3.7' },
        revision: 3,
        created_at: '2020-12-09T13:46:31.013Z',
        created_by: 'elastic',
        updated_at: '2020-12-09T13:46:31.013Z',
        updated_by: 'elastic',
      },
    ],
    total: 2,
    page: 1,
    perPage: 20,
  };

  const agentPoliciesResponse: GetAgentPoliciesResponse = {
    items: [
      {
        id: '521c1b70-3976-11eb-ad1c-3baa423084d9',
        name: 'Default',
        namespace: 'default',
        description: 'Default agent policy created by Kibana',
        status: 'active',
        package_policies: [],
        is_managed: false,
        monitoring_enabled: ['logs', 'metrics'],
        revision: 6,
        updated_at: '2020-12-09T13:46:31.840Z',
        updated_by: 'elastic',
        agents: 0,
        is_protected: false,
      },
      {
        id: '125c1b70-3976-11eb-ad1c-3baa423085y6',
        name: 'EU Healthy agents',
        namespace: 'default',
        description: 'Protect EU from COVID',
        status: 'active',
        package_policies: [],
        is_managed: false,
        monitoring_enabled: ['logs', 'metrics'],
        revision: 2,
        updated_at: '2020-12-09T13:46:31.840Z',
        updated_by: 'elastic',
        agents: 100,
        is_protected: false,
      },
    ],
    total: 2,
    page: 1,
    perPage: 100,
  };

  const epmGetStatsResponse: GetStatsResponse = {
    response: {
      agent_policy_count: 2,
      package_policy_count: 2,
    },
  };

  const appCheckPermissionsResponse: CheckPermissionsResponse = {
    success: true,
  };

  const getSettingsResponse = { item: { prerelease_integrations_enabled: true } };

  const getVerificationKeyIdResponse = { id: 'test-verification-key' };

  const mockedApiInterface: MockedApi<EpmPackageDetailsResponseProvidersMock> = {
    waitForApi() {
      return new Promise((resolve) => {
        if (inflightApiCalls > 0) {
          apiDoneListeners.push(resolve);
        } else {
          resolve();
        }
      });
    },
    responseProvider: {
      epmGetInfo: jest.fn().mockReturnValue(epmPackageResponse),
      epmGetFile: jest.fn().mockReturnValue(packageReadMe),
      epmGetStats: jest.fn().mockReturnValue(epmGetStatsResponse),
      fleetSetup: jest.fn().mockReturnValue(agentsSetupResponse),
      packagePolicyList: jest.fn().mockReturnValue(packagePoliciesResponse),
      agentPolicyList: jest.fn().mockReturnValue(agentPoliciesResponse),
      appCheckPermissions: jest.fn().mockReturnValue(appCheckPermissionsResponse),
      getSettings: jest.fn().mockReturnValue(getSettingsResponse),
      getVerificationKeyId: jest.fn().mockReturnValue(getVerificationKeyIdResponse),
    },
  };

  http.get.mockImplementation((async (path: any, options: any) => {
    if (typeof path === 'string') {
      if (path === epmRouteService.getInfoPath(`nginx`, `0.3.7`)) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.epmGetInfo('nginx', '0.3.7', options.query);
      }
      if (path === epmRouteService.getInfoPath(`nginx`)) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.epmGetInfo('nginx', undefined, options.query);
      }

      if (path === epmRouteService.getFilePath('/package/nginx/0.3.7/docs/README.md')) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.epmGetFile();
      }

      if (path === fleetSetupRouteService.getFleetSetupPath()) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.fleetSetup();
      }

      if (path === packagePolicyRouteService.getListPath()) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.packagePolicyList();
      }

      if (path === agentPolicyRouteService.getListPath()) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.agentPolicyList();
      }

      if (path === epmRouteService.getStatsPath('nginx')) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.epmGetStats();
      }

      if (path === appRoutesService.getCheckPermissionsPath()) {
        markApiCallAsHandled();
        return mockedApiInterface.responseProvider.appCheckPermissions();
      }

      if (path === '/api/fleet/epm/categories') {
        return Promise.resolve();
      }
      if (path === '/api/fleet/epm/packages') {
        return Promise.resolve();
      }
      if (path === '/api/fleet/agents') {
        return Promise.resolve();
      }
      if (path === '/api/fleet/settings') {
        return mockedApiInterface.responseProvider.getSettings();
      }
      if (path === '/api/fleet/epm/verification_key_id') {
        return mockedApiInterface.responseProvider.getVerificationKeyId();
      }
      if (path === '/api/fleet/space_settings') {
        return Promise.resolve({
          item: {
            allowed_namespace_prefixes: [],
          },
        });
      }
      if (path.endsWith('/changelog.yml')) {
        return Promise.resolve();
      }

      const err = new Error(`API [GET ${path}] is not MOCKED!`);
      // eslint-disable-next-line no-console
      console.error(err);
      throw err;
    }
  }) as any);

  return mockedApiInterface;
};
