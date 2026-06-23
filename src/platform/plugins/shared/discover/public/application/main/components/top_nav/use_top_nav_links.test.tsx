/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { AppMenuActionId } from '@kbn/discover-utils';
import { BehaviorSubject } from 'rxjs';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { useTopNavLinks } from './use_top_nav_links';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import { internalStateActions } from '../../state_management/redux';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import type { DiscoverServices } from '../../../../build_services';
import type {
  AlertsLegacyRuleType,
  AppMenuExtension,
  AppMenuExtensionParams,
  Profile,
} from '../../../../context_awareness/types';
import { useProfileAccessor } from '../../../../context_awareness/hooks/use_profile_accessor';
import * as getAlerts from './app_menu_actions/get_alerts';

jest.mock('@kbn/alerts-ui-shared', () => ({
  ...jest.requireActual('@kbn/alerts-ui-shared'),
  useGetRuleTypesPermissions: jest.fn(() => ({
    authorizedRuleTypes: [
      {
        id: '.es-query',
        authorizedConsumers: {
          discover: { all: true, read: true },
        },
      },
    ],
  })),
}));

jest.mock('../../../../context_awareness/hooks/use_profile_accessor', () => ({
  useProfileAccessor: jest.fn((accessorId: string) => jest.fn((baseImpl) => baseImpl)),
}));

const mockUseProfileAccessor = useProfileAccessor as jest.MockedFunction<typeof useProfileAccessor>;

const createTestServices = (overrides: Partial<DiscoverServices> = {}): DiscoverServices => {
  const services = createDiscoverServicesMock();
  const uiSettingsGetMock = services.uiSettings.get;

  services.share = sharePluginMock.createStartContract();
  services.application.currentAppId$ = new BehaviorSubject('discover');
  services.capabilities.discover_v2 = {
    save: true,
    storeSearchSession: true,
  };
  services.capabilities.management = {
    ...services.capabilities.management,
    insightsAndAlerting: {
      triggersActions: true,
    },
  };
  services.uiSettings.get = <T,>(key: string) => {
    return key === ENABLE_ESQL ? (true as T) : uiSettingsGetMock<T>(key);
  };

  services.settings.globalClient.get = <T,>(_key: string) => true as T;

  // Apply overrides
  return {
    ...services,
    ...overrides,
    capabilities: {
      ...services.capabilities,
      ...overrides.capabilities,
    },
  } as DiscoverServices;
};

describe('useTopNavLinks', () => {
  const setup = async (hookAttrs: Partial<Parameters<typeof useTopNavLinks>[0]> = {}) => {
    const services = hookAttrs.services ?? createTestServices();
    const toolkit = getDiscoverInternalStateMock({ services });
    const testDataView = hookAttrs.dataView ?? dataViewMock;

    await toolkit.initializeTabs();

    if (hookAttrs.isEsqlMode) {
      toolkit.internalState.dispatch(
        toolkit.injectCurrentTab(internalStateActions.setAppState)({
          appState: { query: { esql: 'FROM test-index' } },
        })
      );
    }

    await toolkit.initializeSingleTab({
      tabId: toolkit.getCurrentTab().id,
    });

    return renderHook(
      () =>
        useTopNavLinks({
          dataView: testDataView,
          services,
          hasUnsavedChanges: false,
          isEsqlMode: false,
          adHocDataViews: [],
          hasShareIntegration: false,
          persistedDiscoverSession: undefined,
          ...hookAttrs,
          onOpenSaveModal: hookAttrs.onOpenSaveModal ?? jest.fn(),
          onOpenSaveAsModal: hookAttrs.onOpenSaveAsModal ?? jest.fn(),
        }),
      {
        wrapper: ({ children }) => (
          <DiscoverToolkitTestProvider toolkit={toolkit}>{children}</DiscoverToolkitTestProvider>
        ),
      }
    ).result.current;
  };

  it('should return results', async () => {
    const appMenuConfig = await setup();
    const newItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.new);
    const openItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.open);

    expect(appMenuConfig.items).toBeDefined();
    expect(appMenuConfig.items?.length).toBeGreaterThan(0);

    // Check for key items
    const itemIds = appMenuConfig.items?.map((item) => item.id);
    expect(itemIds).toContain('new');
    expect(itemIds).toContain('open');
    expect(newItem?.label).toBe('New session');
    expect(openItem?.label).toBe('Open session');

    // Check primary action item (Save)
    expect(appMenuConfig.primaryActionItem).toBeDefined();
    expect(appMenuConfig.primaryActionItem?.label).toBe('Save');
  });

  describe('when ES|QL mode is true', () => {
    it('should include the switch-to-classic item', async () => {
      const appMenuConfig = await setup({
        isEsqlMode: true,
      });

      const switchLanguageModeItem = appMenuConfig.items?.find(
        (item) => item.testId === 'select-classic-mode-btn'
      );

      expect(switchLanguageModeItem).toBeDefined();
      expect(switchLanguageModeItem?.label).toBe('Switch to Classic');
      expect(switchLanguageModeItem?.tooltipContent).toBe(
        'Search your data with data views and KQL in Classic Discover'
      );
    });
  });

  describe('when ES|QL mode is false (classic mode)', () => {
    it('should include the switch-to-esql item', async () => {
      const appMenuConfig = await setup({
        isEsqlMode: false,
      });

      const switchLanguageModeItem = appMenuConfig.items?.find(
        (item) => item.testId === 'select-text-based-language-btn'
      );

      expect(switchLanguageModeItem).toBeDefined();
      expect(switchLanguageModeItem?.label).toBe('Query in ES|QL');
      expect(switchLanguageModeItem?.tooltipContent).toBe(
        'Search, transform, join and aggregate your data with ES|QL or PromQL'
      );
    });
  });

  describe('when share service included', () => {
    it('should include the share menu item', async () => {
      const services = createTestServices();

      jest.spyOn(services.share!, 'availableIntegrations').mockReturnValue([]);

      const appMenuConfig = await setup({ hasShareIntegration: true, services });

      expect(appMenuConfig.items).toBeDefined();

      // Check for share item
      const shareItem = appMenuConfig.items?.find((item) => item.id === 'share');
      expect(shareItem).toBeDefined();
      expect(shareItem?.label).toBe('Share');
    });

    it('should include the export menu item', async () => {
      const services = createTestServices();

      jest
        .spyOn(services.share!, 'availableIntegrations')
        .mockImplementation((_objectType, groupId) => {
          if (groupId === 'export') {
            return [
              {
                id: 'csvReports',
                shareType: 'integration' as const,
                groupId: 'export',
                config: () => Promise.resolve({}),
              },
            ];
          }
          return [];
        });

      const appMenuConfig = await setup({ hasShareIntegration: true, services });

      const exportItem = appMenuConfig.items?.find((item) => item.id === 'export');
      expect(exportItem).toBeDefined();
      expect(exportItem?.label).toBe('Export tab results');

      expect(exportItem?.items).toBeDefined();
      expect(exportItem?.items?.length).toBeGreaterThan(0);

      const shareItem = appMenuConfig.items?.find((item) => item.id === 'share');
      expect(shareItem).toBeDefined();
    });
  });

  describe('when background search is enabled', () => {
    it('should return the background search menu item', async () => {
      const services = createTestServices();
      services.data.search.isBackgroundSearchEnabled = true;
      const appMenuConfig = await setup({ services });

      const backgroundSearchItem = appMenuConfig.items?.find(
        (item) => item.id === 'backgroundSearch'
      );
      expect(backgroundSearchItem).toBeDefined();
    });
  });

  describe('when background search is disabled', () => {
    it('should NOT return the background search menu item', async () => {
      const appMenuConfig = await setup();

      const backgroundSearchItem = appMenuConfig.items?.find(
        (item) => item.id === 'backgroundSearch'
      );
      expect(backgroundSearchItem).toBeUndefined();
    });
  });

  describe('inspect menu item', () => {
    it('should include the inspect menu item', async () => {
      const appMenuConfig = await setup();

      const inspectItem = appMenuConfig.items?.find((item) => item.id === 'inspect');
      expect(inspectItem).toBeDefined();
      expect(inspectItem?.label).toBe('Inspect tab');
    });
  });

  describe('save as button', () => {
    it('should disable save as button when session is not persisted', async () => {
      const appMenuConfig = await setup({ persistedDiscoverSession: undefined });

      const items = appMenuConfig.primaryActionItem?.splitButtonProps?.items;
      const saveAsItem = items?.find((item) => item.id === 'saveAs');

      expect(saveAsItem?.disableButton).toBe(true);
    });

    it('should enable save as button when session is persisted', async () => {
      const persistedSession = {
        id: 'test-session-id',
        title: 'Test Session',
        description: 'Test Description',
        tags: [],
        managed: false,
        tabs: [],
        timeRestore: false,
      };
      const appMenuConfig = await setup({ persistedDiscoverSession: persistedSession });

      const items = appMenuConfig.primaryActionItem?.splitButtonProps?.items;
      const saveAsItem = items?.find((item) => item.id === 'saveAs');

      expect(saveAsItem?.disableButton).toBe(false);
    });
  });

  describe('save button with unsaved changes', () => {
    it('should show notification indicator when there are unsaved changes', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: true });

      expect(appMenuConfig.primaryActionItem).toBeDefined();
      expect(appMenuConfig.primaryActionItem?.id).toBe('save');
      expect(appMenuConfig.primaryActionItem?.splitButtonProps?.showNotificationIndicator).toBe(
        true
      );
      expect(
        appMenuConfig.primaryActionItem?.splitButtonProps?.notificationIndicatorTooltipContent
      ).toBe('You have unsaved changes');
    });

    it('should NOT show notification indicator when there are no unsaved changes', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: false });

      expect(appMenuConfig.primaryActionItem).toBeDefined();
      expect(appMenuConfig.primaryActionItem?.id).toBe('save');
      expect(appMenuConfig.primaryActionItem?.splitButtonProps?.showNotificationIndicator).toBe(
        false
      );
      expect(
        appMenuConfig.primaryActionItem?.splitButtonProps?.notificationIndicatorTooltipContent
      ).toBeUndefined();
    });

    it('should include Save as and Reset changes options in split button menu', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: true });

      expect(appMenuConfig.primaryActionItem?.splitButtonProps?.items).toBeDefined();
      const itemIds = appMenuConfig.primaryActionItem?.splitButtonProps?.items?.map(
        (item) => item.id
      );
      expect(itemIds).toContain('saveAs');
      expect(itemIds).toContain('resetChanges');
    });

    it('should have correct labels for split button menu items', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: true });

      const items = appMenuConfig.primaryActionItem?.splitButtonProps?.items;
      const saveAsItem = items?.find((item) => item.id === 'saveAs');
      const resetChangesItem = items?.find((item) => item.id === 'resetChanges');

      expect(saveAsItem?.label).toBe('Save as');
      expect(resetChangesItem?.label).toBe('Reset changes');
    });

    it('should have run functions defined for split button menu items', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: true });

      const items = appMenuConfig.primaryActionItem?.splitButtonProps?.items;
      const saveAsItem = items?.find((item) => item.id === 'saveAs');
      const resetChangesItem = items?.find((item) => item.id === 'resetChanges');

      expect(saveAsItem?.run).toBeDefined();
      expect(resetChangesItem?.run).toBeDefined();
    });

    it('should disable reset changes button when there are no unsaved changes', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: false });

      const items = appMenuConfig.primaryActionItem?.splitButtonProps?.items;
      const resetChangesItem = items?.find((item) => item.id === 'resetChanges');

      expect(resetChangesItem?.disableButton).toBe(true);
    });

    it('should enable reset changes button when there are unsaved changes', async () => {
      const appMenuConfig = await setup({ hasUnsavedChanges: true });

      const items = appMenuConfig.primaryActionItem?.splitButtonProps?.items;
      const resetChangesItem = items?.find((item) => item.id === 'resetChanges');

      expect(resetChangesItem?.disableButton).toBe(false);
    });
  });

  describe('alerting v2 rules menu', () => {
    const setupWithAlertingV2 = async (
      hookAttrs: Partial<Parameters<typeof useTopNavLinks>[0]> = {},
      alertingV2Enabled = true
    ) => {
      const baseMock = createDiscoverServicesMock();
      const v2Services = createTestServices({
        capabilities: {
          ...baseMock.capabilities,
          discover_v2: {
            save: true,
            storeSearchSession: true,
          },
          management: {
            ...baseMock.capabilities.management,
            insightsAndAlerting: {
              triggersActions: true,
            },
          },
          ...(alertingV2Enabled ? { alertingVTwo: {} } : {}),
        },
        alertingVTwo: alertingV2Enabled ? baseMock.alertingVTwo : undefined,
        triggersActionsUi: triggersActionsUiMock.createStart(),
      });

      v2Services.settings.globalClient.get = <T,>(_key: string) => alertingV2Enabled as T;

      const toolkit = getDiscoverInternalStateMock({ services: v2Services });
      await toolkit.initializeTabs();

      if (hookAttrs.isEsqlMode) {
        toolkit.internalState.dispatch(
          toolkit.injectCurrentTab(internalStateActions.setAppState)({
            appState: { query: { esql: 'FROM test-index' } },
          })
        );
      }

      await toolkit.initializeSingleTab({
        tabId: toolkit.getCurrentTab().id,
      });
      toolkit.internalState.dispatch(
        toolkit.injectCurrentTab(internalStateActions.assignNextDataView)({
          dataView: dataViewMock,
        })
      );

      return renderHook(
        () =>
          useTopNavLinks({
            dataView: dataViewMock,
            services: v2Services,
            hasUnsavedChanges: false,
            isEsqlMode: true,
            adHocDataViews: [],
            hasShareIntegration: false,
            persistedDiscoverSession: undefined,
            ...hookAttrs,
            onOpenSaveModal: hookAttrs.onOpenSaveModal ?? jest.fn(),
            onOpenSaveAsModal: hookAttrs.onOpenSaveAsModal ?? jest.fn(),
          }),
        {
          wrapper: ({ children }) => (
            <DiscoverToolkitTestProvider toolkit={toolkit}>{children}</DiscoverToolkitTestProvider>
          ),
        }
      ).result.current;
    };

    it('should include the alerts menu as a direct action when alerting v2 is enabled', async () => {
      const appMenuConfig = await setupWithAlertingV2({ isEsqlMode: true }, true);

      const alertsItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.alerts);
      expect(alertsItem).toBeDefined();
      expect(alertsItem?.label).toBe('Create alert rule');
      expect(alertsItem?.run).toBeDefined();
      expect(alertsItem?.items).toBeUndefined();
    });

    it('should show the v2 selector flyout only in ES|QL mode and fall back to v1 popover in classic mode', async () => {
      const esqlConfig = await setupWithAlertingV2({ isEsqlMode: true }, true);
      const classicConfig = await setupWithAlertingV2({ isEsqlMode: false }, true);

      const esqlAlerts = esqlConfig.items?.find((item) => item.id === AppMenuActionId.alerts);
      const classicAlerts = classicConfig.items?.find((item) => item.id === AppMenuActionId.alerts);

      expect(esqlAlerts).toBeDefined();
      expect(esqlAlerts?.items).toBeUndefined();
      expect(classicAlerts).toBeDefined();
      expect(classicAlerts?.items).toBeDefined();
      expect(classicAlerts?.items!.length).toBeGreaterThan(0);
    });

    it('should fall back to v1 popover items when alerting v2 is disabled', async () => {
      const appMenuConfig = await setupWithAlertingV2({ isEsqlMode: true }, false);

      const alertsItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.alerts);
      expect(alertsItem).toBeDefined();
      expect(alertsItem?.items).toBeDefined();
      expect(alertsItem?.items!.length).toBeGreaterThan(0);
    });

    describe('getAlertsLegacyRuleTypes', () => {
      const profileLegacyRule: AlertsLegacyRuleType = {
        id: 'custom-threshold-rule',
        label: 'Create custom threshold rule',
        render: jest.fn(() => null),
      };

      beforeEach(() => {
        mockUseProfileAccessor.mockImplementation((accessorId) => {
          if (accessorId === 'getAppMenu') {
            return jest.fn((baseImpl) => {
              const getAppMenu = baseImpl as Profile['getAppMenu'];

              return (params: AppMenuExtensionParams): AppMenuExtension => ({
                ...getAppMenu(params),
                getAlertsLegacyRuleTypes: () => [profileLegacyRule],
              });
            });
          }

          return jest.fn((baseImpl) => baseImpl);
        });
      });

      afterEach(() => {
        mockUseProfileAccessor.mockImplementation((accessorId) => jest.fn((baseImpl) => baseImpl));
      });

      it('should pass profile legacy rule types to getAlertsAppMenuItem in ES|QL mode', async () => {
        const getAlertsSpy = jest.spyOn(getAlerts, 'getAlertsAppMenuItem');

        await setupWithAlertingV2({ isEsqlMode: true }, true);

        expect(getAlertsSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            showCreateRuleV2: true,
            additionalLegacyRuleTypes: expect.arrayContaining([
              expect.objectContaining({
                id: 'custom-threshold-rule',
                label: 'Create custom threshold rule',
              }),
            ]),
          })
        );

        getAlertsSpy.mockRestore();
      });

      it('should not expose getAlertsLegacyRuleTypes through the v2 flyout in classic mode', async () => {
        const appMenuConfig = await setupWithAlertingV2({ isEsqlMode: false }, true);

        const alertsItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.alerts);
        expect(alertsItem?.run).toBeUndefined();
        expect(alertsItem?.items).toBeDefined();
      });
    });
  });

  describe('alerts menu when only alerting v2 capability is granted', () => {
    /**
     * Users with v2 access but no v1 rule-type authorization should still see
     * the Alerts menu (containing only the v2 ES|QL rule entry) when in ES|QL
     * mode. Verifies the parent gate considers v2 access independently.
     */
    const setupV2OnlyServices = (
      overrides: { alertingVTwoEnabled?: boolean } = {}
    ): DiscoverServices => {
      const baseMock = createDiscoverServicesMock();
      const { alertingVTwoEnabled = true } = overrides;
      const v2OnlyServices = createTestServices({
        capabilities: {
          ...baseMock.capabilities,
          discover_v2: {
            save: true,
            storeSearchSession: true,
          },
          // No v1 management.insightsAndAlerting.triggersActions capability.
          management: {
            ...baseMock.capabilities.management,
            insightsAndAlerting: {},
          },
          ...(alertingVTwoEnabled ? { alertingVTwo: {} } : {}),
        },
        alertingVTwo: alertingVTwoEnabled ? baseMock.alertingVTwo : undefined,
        triggersActionsUi: triggersActionsUiMock.createStart(),
      });

      v2OnlyServices.settings.globalClient.get = <T,>(_key: string) => alertingVTwoEnabled as T;

      return v2OnlyServices;
    };

    beforeEach(() => {
      jest.requireMock('@kbn/alerts-ui-shared').useGetRuleTypesPermissions.mockReturnValue({
        authorizedRuleTypes: [],
      });
    });

    afterEach(() => {
      jest.requireMock('@kbn/alerts-ui-shared').useGetRuleTypesPermissions.mockReturnValue({
        authorizedRuleTypes: [
          {
            id: '.es-query',
            authorizedConsumers: {
              discover: { all: true, read: true },
            },
          },
        ],
      });
    });

    it('should show the v2 selector flyout as a direct action when only alerting v2 is granted', async () => {
      const services = setupV2OnlyServices();
      const toolkit = getDiscoverInternalStateMock({ services });
      await toolkit.initializeTabs();
      await toolkit.initializeSingleTab({ tabId: toolkit.getCurrentTab().id });

      const appMenuConfig = renderHook(
        () =>
          useTopNavLinks({
            dataView: dataViewMock,
            services,
            hasUnsavedChanges: false,
            isEsqlMode: true,
            adHocDataViews: [],
            hasShareIntegration: false,
            persistedDiscoverSession: undefined,
            onOpenSaveModal: jest.fn(),
            onOpenSaveAsModal: jest.fn(),
          }),
        {
          wrapper: ({ children }) => (
            <DiscoverToolkitTestProvider toolkit={toolkit}>{children}</DiscoverToolkitTestProvider>
          ),
        }
      ).result.current;

      const alertsItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.alerts);
      expect(alertsItem).toBeDefined();
      expect(alertsItem?.run).toBeDefined();
      expect(alertsItem?.items).toBeUndefined();
    });

    it('should NOT include the alerts menu when neither v1 nor v2 access is granted', async () => {
      const services = setupV2OnlyServices({ alertingVTwoEnabled: false });
      const toolkit = getDiscoverInternalStateMock({ services });
      await toolkit.initializeTabs();
      await toolkit.initializeSingleTab({ tabId: toolkit.getCurrentTab().id });

      const appMenuConfig = renderHook(
        () =>
          useTopNavLinks({
            dataView: dataViewMock,
            services,
            hasUnsavedChanges: false,
            isEsqlMode: true,
            adHocDataViews: [],
            hasShareIntegration: false,
            persistedDiscoverSession: undefined,
            onOpenSaveModal: jest.fn(),
            onOpenSaveAsModal: jest.fn(),
          }),
        {
          wrapper: ({ children }) => (
            <DiscoverToolkitTestProvider toolkit={toolkit}>{children}</DiscoverToolkitTestProvider>
          ),
        }
      ).result.current;

      const alertsItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.alerts);
      expect(alertsItem).toBeUndefined();
    });
  });

  describe('when there are tab-scoped app menu items', () => {
    it('should add the separator above the first tab-scoped app menu item', async () => {
      const services = createTestServices();

      jest.spyOn(services.share!, 'availableIntegrations').mockReturnValue([]);

      let appMenuConfig = await setup({ hasShareIntegration: true, services });

      let exportItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.export);
      let inspectItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.inspect);

      expect(exportItem?.separator).toBe('above');
      expect(inspectItem?.separator).toBeUndefined();

      appMenuConfig = await setup({ services });

      exportItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.export);
      inspectItem = appMenuConfig.items?.find((item) => item.id === AppMenuActionId.inspect);

      expect(exportItem?.separator).toBeUndefined();
      expect(inspectItem?.separator).toBe('above');
    });
  });
});
