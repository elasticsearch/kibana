/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Observable } from 'rxjs';

import type { CoreSetup } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { FeaturesPluginStart } from '@kbn/features-plugin/public';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { managementPluginMock } from '@kbn/management-plugin/public/mocks';
import { stubBroadcastChannel } from '@kbn/test-jest-helpers';

import { UserProfileAPIClient } from './account_management';
import { ManagementService } from './management';
import type { PluginStartDependencies } from './plugin';
import { SecurityPlugin } from './plugin';

stubBroadcastChannel();

const getCoreSetupMock = () => {
  const coreSetup = coreMock.createSetup({
    basePath: '/some-base-path',
  });
  coreSetup.http.get.mockResolvedValue({});
  return coreSetup;
};

describe('Security Plugin', () => {
  describe('#setup', () => {
    it('should be able to setup if optional plugins are not available', () => {
      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());
      expect(
        plugin.setup(getCoreSetupMock(), {
          licensing: licensingMock.createSetup(),
        })
      ).toEqual({
        authc: {
          getCurrentUser: expect.any(Function),
          areAPIKeysEnabled: expect.any(Function),
          isUIAMEnabled: expect.any(Function),
        },
        authz: {
          isRoleManagementEnabled: expect.any(Function),
          roles: expect.any(Object),
          privileges: expect.any(Object),
        },
        license: {
          isLicenseAvailable: expect.any(Function),
          getLicenseType: expect.any(Function),
          isEnabled: expect.any(Function),
          getUnavailableReason: expect.any(Function),
          getFeatures: expect.any(Function),
          hasAtLeast: expect.any(Function),
          features$: expect.any(Observable),
        },
      });
    });

    it('setups Management Service if `management` plugin is available', () => {
      const coreSetupMock = getCoreSetupMock();
      const setupManagementServiceMock = jest
        .spyOn(ManagementService.prototype, 'setup')
        .mockImplementation(() => {});
      const managementSetupMock = managementPluginMock.createSetupContract();

      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());

      plugin.setup(coreSetupMock as CoreSetup<PluginStartDependencies>, {
        licensing: licensingMock.createSetup(),
        management: managementSetupMock,
      });

      expect(setupManagementServiceMock).toHaveBeenCalledTimes(1);
      expect(setupManagementServiceMock).toHaveBeenCalledWith({
        authc: {
          getCurrentUser: expect.any(Function),
          areAPIKeysEnabled: expect.any(Function),
          isUIAMEnabled: expect.any(Function),
        },
        license: {
          isLicenseAvailable: expect.any(Function),
          getLicenseType: expect.any(Function),
          isEnabled: expect.any(Function),
          getUnavailableReason: expect.any(Function),
          getFeatures: expect.any(Function),
          hasAtLeast: expect.any(Function),
          features$: expect.any(Observable),
        },
        management: managementSetupMock,
        fatalErrors: coreSetupMock.fatalErrors,
        uiSettings: coreSetupMock.uiSettings,
        getStartServices: coreSetupMock.getStartServices,
        buildFlavor: expect.stringMatching(new RegExp('^serverless|traditional$')),
      });
    });

    it('calls core.security.registerSecurityDelegate', () => {
      const coreSetupMock = getCoreSetupMock();

      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());

      plugin.setup(coreSetupMock, {
        licensing: licensingMock.createSetup(),
      });

      expect(coreSetupMock.security.registerSecurityDelegate).toHaveBeenCalledTimes(1);
    });

    it('calls core.userProfile.registerUserProfileDelegate', () => {
      const coreSetupMock = getCoreSetupMock();

      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());

      plugin.setup(coreSetupMock, {
        licensing: licensingMock.createSetup(),
      });

      expect(coreSetupMock.userProfile.registerUserProfileDelegate).toHaveBeenCalledTimes(1);
    });
  });

  describe('#start', () => {
    it('should be able to setup if optional plugins are not available', () => {
      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());
      plugin.setup(getCoreSetupMock(), { licensing: licensingMock.createSetup() });

      expect(
        plugin.start(coreMock.createStart({ basePath: '/some-base-path' }), {
          dataViews: {} as DataViewsPublicPluginStart,
          features: {} as FeaturesPluginStart,
        })
      ).toMatchInlineSnapshot(`
        Object {
          "authc": Object {
            "areAPIKeysEnabled": [Function],
            "getCurrentUser": [Function],
            "isUIAMEnabled": [Function],
          },
          "authz": Object {
            "isRoleManagementEnabled": [Function],
            "privileges": Object {
              "getAll": [Function],
            },
            "roles": Object {
              "bulkUpdateRoles": [Function],
              "deleteRole": [Function],
              "getRole": [Function],
              "getRoles": [Function],
              "saveRole": [Function],
            },
          },
          "navControlService": Object {
            "addUserMenuLinks": [Function],
            "getUserMenuLinks$": [Function],
          },
          "uiApi": Object {
            "components": Object {
              "getChangePassword": [Function],
              "getPersonalInfo": [Function],
            },
          },
          "userProfiles": Object {
            "bulkGet": [Function],
            "dataUpdates$": Observable {
              "source": Subject {
                "closed": false,
                "currentObservers": null,
                "hasError": false,
                "isStopped": false,
                "observers": Array [],
                "thrownError": null,
              },
            },
            "enabled$": Observable {
              "operator": [Function],
              "source": Observable {
                "operator": [Function],
                "source": Observable {
                  "operator": [Function],
                  "source": Observable {
                    "operator": [Function],
                    "source": Observable {
                      "source": BehaviorSubject {
                        "_value": false,
                        "closed": false,
                        "currentObservers": null,
                        "hasError": false,
                        "isStopped": false,
                        "observers": Array [],
                        "thrownError": null,
                      },
                    },
                  },
                },
              },
            },
            "getCurrent": [Function],
            "partialUpdate": [Function],
            "suggest": [Function],
            "update": [Function],
            "userProfile$": Observable {
              "source": BehaviorSubject {
                "_value": null,
                "closed": false,
                "currentObservers": null,
                "hasError": false,
                "isStopped": false,
                "observers": Array [],
                "thrownError": null,
              },
            },
            "userProfileLoaded$": Observable {
              "operator": [Function],
              "source": Observable {
                "source": BehaviorSubject {
                  "_value": false,
                  "closed": false,
                  "currentObservers": null,
                  "hasError": false,
                  "isStopped": false,
                  "observers": Array [],
                  "thrownError": null,
                },
              },
            },
          },
        }
      `);
    });

    it('starts Management Service if `management` plugin is available', () => {
      jest.spyOn(ManagementService.prototype, 'setup').mockImplementation(() => {});
      const startManagementServiceMock = jest
        .spyOn(ManagementService.prototype, 'start')
        .mockImplementation(() => {});
      const managementSetupMock = managementPluginMock.createSetupContract();
      const managementStartMock = managementPluginMock.createStartContract();

      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());

      plugin.setup(getCoreSetupMock(), {
        licensing: licensingMock.createSetup(),
        management: managementSetupMock,
      });

      const coreStart = coreMock.createStart({ basePath: '/some-base-path' });
      plugin.start(coreStart, {
        dataViews: {} as DataViewsPublicPluginStart,
        features: {} as FeaturesPluginStart,
        management: managementStartMock,
      });

      expect(startManagementServiceMock).toHaveBeenCalledTimes(1);
    });

    it('calls UserProfileAPIClient start() to fetch the user profile', () => {
      const startUserProfileAPIClient = jest
        .spyOn(UserProfileAPIClient.prototype, 'start')
        .mockImplementation(() => {});
      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());
      plugin.setup(getCoreSetupMock(), { licensing: licensingMock.createSetup() });

      const coreStart = coreMock.createStart({ basePath: '/some-base-path' });
      plugin.start(coreStart, {
        dataViews: {} as DataViewsPublicPluginStart,
        features: {} as FeaturesPluginStart,
      });

      expect(startUserProfileAPIClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('#stop', () => {
    it('does not fail if called before `start`.', () => {
      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());
      plugin.setup(getCoreSetupMock(), { licensing: licensingMock.createSetup() });

      expect(() => plugin.stop()).not.toThrow();
    });

    it('does not fail if called during normal plugin life cycle.', () => {
      const plugin = new SecurityPlugin(coreMock.createPluginInitializerContext());

      plugin.setup(getCoreSetupMock(), { licensing: licensingMock.createSetup() });

      plugin.start(coreMock.createStart({ basePath: '/some-base-path' }), {
        dataViews: {} as DataViewsPublicPluginStart,
        features: {} as FeaturesPluginStart,
      });

      expect(() => plugin.stop()).not.toThrow();
    });
  });
});
