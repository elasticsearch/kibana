/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';

import type { PublicAppInfo } from '@kbn/core/public';
import { AppStatus } from '@kbn/core/public';
import type { RecursivePartial } from '@elastic/eui/src/components/common';
import { coreMock } from '@kbn/core/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { ILicense } from '@kbn/licensing-types';
import type { StartServices } from '../../../types';
import type { UseEuiTheme } from '@elastic/eui';
import { securityMock } from '@kbn/security-plugin/public/mocks';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { savedObjectTaggingOssPluginMock } from '@kbn/saved-objects-tagging-oss-plugin/public/mocks';
import { registerConnectorsToMockActionRegistry } from '../../mock/register_connectors';
import { connectorsMock } from '../../mock/connectors';
import { lazyObject } from '@kbn/lazy-object';

interface StartServiceArgs {
  license?: ILicense | null;
}

export const createStartServicesMock = ({ license }: StartServiceArgs = {}): StartServices => {
  const licensingPluginMock = licensingMock.createStart();
  const triggersActionsUi = triggersActionsUiMock.createStart();

  const core = coreMock.createStart();

  const services = lazyObject({
    ...core,
    storage: lazyObject({
      ...coreMock.createStorage(),
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    }),
    lens: lazyObject({
      canUseEditor: jest.fn(),
      navigateToPrefilledEditor: jest.fn(),
    }),
    dashboard: lazyObject({
      findDashboardsService: jest.fn(),
    }),
    maps: lazyObject({
      Map: () => null,
      PassiveMap: () => null,
      createLayerDescriptors: lazyObject({
        createSecurityLayerDescriptors: jest.fn(),
        createBasemapLayerDescriptor: jest.fn(),
        createESSearchSourceLayerDescriptor: jest.fn(),
      }),
      suggestEMSTermJoinConfig: jest.fn(),
    }),
    security: securityMock.createStart(),
    triggersActionsUi: lazyObject({
      actionTypeRegistry: triggersActionsUi.actionTypeRegistry,
      getAlertsStateTable: jest.fn(() => <div data-test-subj="alerts-table" />),
    }),
    spaces: spacesPluginMock.createStartContract(),
    licensing:
      license != null
        ? { ...licensingPluginMock, license$: new BehaviorSubject(license) }
        : licensingPluginMock,
    savedObjectsTaggingOss: savedObjectTaggingOssPluginMock.createStart(),
  }) as unknown as StartServices;

  services.application.currentAppId$ = new BehaviorSubject<string>('testAppId');
  services.application.applications$ = new BehaviorSubject<Map<string, PublicAppInfo>>(
    new Map([
      [
        'testAppId',
        {
          id: 'testAppId',
          title: 'test-title',
          category: { id: 'test-label-id', label: 'Test' },
          status: AppStatus.accessible,
          visibleIn: ['globalSearch'],
          appRoute: `/app/some-id`,
          keywords: [],
          deepLinks: [],
        },
      ],
    ])
  );

  services.triggersActionsUi.actionTypeRegistry.get = jest.fn().mockReturnValue({
    actionTypeTitle: '.servicenow',
    iconClass: 'logoSecurity',
  });

  registerConnectorsToMockActionRegistry(
    services.triggersActionsUi.actionTypeRegistry,
    connectorsMock
  );

  services.application.capabilities = {
    ...services.application.capabilities,
    actions: { save: true, show: true },
    generalCasesV3: {
      create_cases: true,
      read_cases: true,
      update_cases: true,
      delete_cases: true,
      push_cases: true,
      cases_connectors: true,
      cases_settings: true,
      case_reopen: true,
      create_comment: true,
      cases_assign: true,
      cases_manage_templates: true,
    },
    visualize_v2: { save: true, show: true },
    dashboard_v2: { show: true, createNew: true },
  };

  return services;
};

export const createWithKibanaMock = () => {
  const services = createStartServicesMock();

  // eslint-disable-next-line react/display-name
  return (Component: unknown) => (props: unknown) => {
    return React.createElement(Component as string, { ...(props as object), kibana: { services } });
  };
};

export const createKibanaContextProviderMock = () => {
  const services = createStartServicesMock();

  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(KibanaContextProvider, { services }, children);
};

export const getMockTheme = (partialTheme: RecursivePartial<UseEuiTheme>): UseEuiTheme =>
  partialTheme as UseEuiTheme;
