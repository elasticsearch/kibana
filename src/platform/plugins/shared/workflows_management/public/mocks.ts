/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloudMock } from '@kbn/cloud-plugin/public/mocks';
import { coreLifecycleMock } from '@kbn/core-lifecycle-browser-mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import type { KibanaReactContextValue } from '@kbn/kibana-react-plugin/public';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { navigationPluginMock } from '@kbn/navigation-plugin/public/mocks';
import { QueryClient } from '@kbn/react-query';
import { serverlessMock } from '@kbn/serverless/public/mocks';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/public/mocks';
import { createAvailabilityServiceMock } from './common/lib/availability/mock';
import type { WorkflowsBaseTelemetry } from './common/service/telemetry';
import type { WorkflowsPublicPluginStart, WorkflowsServices } from './types';

export const createStartServicesMock = () => ({
  ...coreLifecycleMock.createCoreStart(),
  navigation: navigationPluginMock.createStartContract(),
  serverless: serverlessMock.createStart(),
  storage: new Storage(localStorage),
  dataViews: dataViewPluginMocks.createStartContract(),
  kql: kqlPluginMock.createStartContract(),
  fieldFormats: fieldFormatsServiceMock.createStartContract(),
  unifiedSearch: unifiedSearchPluginMock.createStartContract(),
  data: dataPluginMock.createStartContract(),
  spaces: spacesPluginMock.createStartContract(),
  triggersActionsUi: triggersActionsUiMock.createStart(),
  uiActions: uiActionsPluginMock.createStartContract(),
  workflowsExtensions: workflowsExtensionsMock.createStart(),
  licensing: licensingMock.createStart(),
  cloud: cloudMock.createStart(),
  workflowsManagement: {
    telemetry: {
      reportEvent: jest.fn(),
    },
    availability: createAvailabilityServiceMock(),
    globalExecutionsView: {
      enabled: false,
    },
  },
});

export type StartServicesMock = ReturnType<typeof createStartServicesMock>;

/**
 * Creates a properly typed return value for mocking `useKibana()`.
 * Returns the full `KibanaReactContextValue<WorkflowsServices>` shape
 * so `mockUseKibana.mockReturnValue(...)` does not require `as any`.
 *
 * The single `as unknown as` cast here is intentional and centralized:
 * upstream plugin mocks (e.g. `coreMock.createCoreStart()`) return jest-enhanced
 * types that are structurally compatible but not identical to `WorkflowsServices`.
 */
export const createUseKibanaMockValue = (services?: StartServicesMock) => {
  const svc = services ?? createStartServicesMock();
  return {
    services: svc,
    overlays: {
      openFlyout: jest.fn(),
      openModal: jest.fn(),
    },
  } as unknown as KibanaReactContextValue<WorkflowsServices>;
};

export const workflowsManagementMocks = {
  createStart: (): jest.Mocked<WorkflowsPublicPluginStart> => ({
    setUnavailableInServerlessTier: jest.fn(),
    getTelemetry: jest.fn(async () => ({} as WorkflowsBaseTelemetry)),
    getQueryClient: jest.fn(async () => new QueryClient()),
  }),
};
