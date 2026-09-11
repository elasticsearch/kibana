/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type React from 'react';
import { act } from '@testing-library/react';
import type { UseHostIsolationActionProps } from './use_host_isolation_action';
import { useHostIsolationAction } from './use_host_isolation_action';
import type { AppContextTestRender, UserPrivilegesMockSetter } from '../../../../mock/endpoint';
import { createAppRootMockRenderer, endpointAlertDataMock } from '../../../../mock/endpoint';
import { agentStatusGetHttpMock } from '../../../../../management/mocks';
import { endpointMetadataHttpMocks } from '../../../../../management/pages/endpoint_hosts/mocks';
import { EndpointMetadataGenerator } from '../../../../../../common/endpoint/data_generators/endpoint_metadata_generator';
import {
  ENDPOINT_VERSION_NOT_SUPPORTED,
  HOST_ISOLATION,
} from '../../../../../management/common/translations';
import { useUserPrivileges as _useUserPrivileges } from '../../../user_privileges';
import type { AlertTableContextMenuItem } from '../../../../../detections/components/alerts_table/types';
import type { ResponseActionsApiCommandNames } from '../../../../../../common/endpoint/service/response_actions/constants';
import { agentStatusMocks } from '../../../../../../common/endpoint/service/response_actions/mocks/agent_status.mocks';
import { ISOLATE_HOST, UNISOLATE_HOST } from './translations';
import {
  HOST_ENDPOINT_UNENROLLED_TOOLTIP,
  LOADING_ENDPOINT_DATA_TOOLTIP,
  NOT_FROM_ENDPOINT_HOST_TOOLTIP,
} from '../..';
import { HostStatus } from '../../../../../../common/endpoint/types';

jest.mock('../../../user_privileges');

const useUserPrivilegesMock = _useUserPrivileges as jest.Mock;

describe('useHostIsolationAction', () => {
  let appContextMock: AppContextTestRender;
  let hookProps: UseHostIsolationActionProps;
  let apiMock: ReturnType<typeof agentStatusGetHttpMock>;
  let metadataApiMock: ReturnType<typeof endpointMetadataHttpMocks>;
  let generator: EndpointMetadataGenerator;
  let authMockSetter: UserPrivilegesMockSetter;

  const buildExpectedMenuItemResult = (
    overrides: Partial<AlertTableContextMenuItem> = {}
  ): AlertTableContextMenuItem => {
    return {
      'data-test-subj': 'isolate-host-action-item',
      disabled: false,
      key: 'isolate-host-action-item',
      name: ISOLATE_HOST,
      onClick: expect.any(Function),
      ...overrides,
    } as AlertTableContextMenuItem;
  };

  const render = () => {
    return appContextMock.renderHook(() => useHostIsolationAction(hookProps));
  };

  beforeEach(() => {
    appContextMock = createAppRootMockRenderer();
    generator = new EndpointMetadataGenerator('test');
    authMockSetter = appContextMock.getUserPrivilegesMockSetter(useUserPrivilegesMock);
    hookProps = {
      closePopover: jest.fn(),
      detailsData: endpointAlertDataMock.generateEndpointAlertDetailsItemData(),
      isHostIsolationPanelOpen: false,
      onAddIsolationStatusClick: jest.fn(),
    };
    apiMock = agentStatusGetHttpMock(appContextMock.coreStart.http);
    metadataApiMock = endpointMetadataHttpMocks(appContextMock.coreStart.http);
    authMockSetter.set({
      canIsolateHost: true,
      canUnIsolateHost: true,
    });
  });

  afterEach(() => {
    authMockSetter.reset();
  });

  it.each<ResponseActionsApiCommandNames>(['isolate', 'unisolate'])(
    'should return menu item for displaying %s',
    async (command) => {
      if (command === 'unisolate') {
        apiMock.responseProvider.getAgentStatus.mockReturnValue({
          data: {
            'abfe4a35-d5b4-42a0-a539-bd054c791769': agentStatusMocks.generateAgentStatus({
              isolated: true,
            }),
          },
        });
      }

      const { result } = render();

      await appContextMock.waitFor(() =>
        expect(result.current).toEqual([
          buildExpectedMenuItemResult({
            ...(command === 'unisolate' ? { name: UNISOLATE_HOST } : {}),
          }),
        ])
      );
    }
  );

  it('should call `closePopover` callback when menu item `onClick` is called', async () => {
    const { result } = render();
    await appContextMock.waitFor(() => expect(result.current[0].onClick).toBeDefined());

    result.current[0].onClick!({} as unknown as React.MouseEvent<HTMLHRElement>);

    expect(hookProps.closePopover).toHaveBeenCalled();
  });

  it('should return the menu item for Events', () => {
    hookProps.detailsData = endpointAlertDataMock.generateAlertDetailsItemDataForAgentType('foo', {
      'kibana.alert.rule.uuid': undefined,
    });
    const { result } = render();

    expect(result.current).toHaveLength(1);
  });

  it('should NOT return menu item if user does not have authz', async () => {
    authMockSetter.set({
      canIsolateHost: false,
      canUnIsolateHost: false,
    });
    const { result } = render();

    expect(result.current).toHaveLength(0);
  });

  it('should NOT attempt to get Agent status if host does not support response actions', async () => {
    hookProps.detailsData = [];
    render();

    expect(apiMock.responseProvider.getAgentStatus).not.toHaveBeenCalled();
  });

  it('should return disabled menu item while loading agent status', async () => {
    const { result } = render();

    await appContextMock.waitFor(() =>
      expect(result.current).toEqual([
        buildExpectedMenuItemResult({
          disabled: true,
          toolTipContent: LOADING_ENDPOINT_DATA_TOOLTIP,
        }),
      ])
    );
  });

  it.each(['endpoint', 'non-endpoint'])(
    'should return disabled menu item if %s host agent is unenrolled',
    async (type) => {
      apiMock.responseProvider.getAgentStatus.mockReturnValue({
        data: {
          'abfe4a35-d5b4-42a0-a539-bd054c791769': agentStatusMocks.generateAgentStatus({
            status: HostStatus.UNENROLLED,
          }),
        },
      });
      if (type === 'non-endpoint') {
        hookProps.detailsData = endpointAlertDataMock.generateSentinelOneAlertDetailsItemData();
      }
      const { result } = render();
      await appContextMock.waitFor(() =>
        expect(result.current).toEqual([
          buildExpectedMenuItemResult({
            disabled: true,
            toolTipContent:
              type === 'endpoint'
                ? HOST_ENDPOINT_UNENROLLED_TOOLTIP
                : NOT_FROM_ENDPOINT_HOST_TOOLTIP,
          }),
        ])
      );
    }
  );

  it('should return disabled menu item when endpoint host does not support isolation capability', async () => {
    const metadata = generator.generate();
    metadata.Endpoint.capabilities = (metadata.Endpoint.capabilities ?? []).filter(
      (capability) => capability !== 'isolation'
    );
    metadataApiMock.responseProvider.metadataDetails.mockReturnValue({
      ...metadataApiMock.responseProvider.metadataDetails(),
      metadata,
    });

    const { result } = render();

    await appContextMock.waitFor(() =>
      expect(result.current).toEqual([
        buildExpectedMenuItemResult({
          disabled: true,
          toolTipContent: ENDPOINT_VERSION_NOT_SUPPORTED(HOST_ISOLATION),
        }),
      ])
    );
  });

  it('should return enabled menu item when endpoint host supports isolation capability', async () => {
    const metadata = generator.generate();
    expect(metadata.Endpoint.capabilities).toContain('isolation');
    metadataApiMock.responseProvider.metadataDetails.mockReturnValue({
      ...metadataApiMock.responseProvider.metadataDetails(),
      metadata,
    });

    const { result } = render();

    await appContextMock.waitFor(() =>
      expect(result.current).toEqual([buildExpectedMenuItemResult()])
    );
  });

  it('should NOT fetch endpoint metadata for a non-endpoint host agent type', async () => {
    hookProps.detailsData = endpointAlertDataMock.generateSentinelOneAlertDetailsItemData();
    render();

    await appContextMock.waitFor(() =>
      expect(apiMock.responseProvider.getAgentStatus).toHaveBeenCalled()
    );

    expect(metadataApiMock.responseProvider.metadataDetails).not.toHaveBeenCalled();
  });

  it('should call isolate API when agent is currently NOT isolated', async () => {
    const { result } = render();
    await appContextMock.waitFor(() => expect(result.current[0].onClick).toBeDefined());
    result.current[0].onClick!({} as unknown as React.MouseEvent<HTMLHRElement>);

    expect(hookProps.onAddIsolationStatusClick).toHaveBeenCalledWith('isolateHost');
  });

  it('should call un-isolate API when agent is currently isolated', async () => {
    apiMock.responseProvider.getAgentStatus.mockImplementation(({ query }) => {
      const agentId = (query!.agentIds as string[])[0];

      return agentStatusMocks.generateAgentStatusApiResponse({
        data: { [agentId]: { isolated: true } },
      });
    });

    const { result } = render();

    await appContextMock.waitFor(() => {
      expect(apiMock.responseProvider.getAgentStatus).toHaveBeenCalled();
      expect(result.current[0].onClick).toBeDefined();
    });

    act(() => {
      result.current[0].onClick!({} as unknown as React.MouseEvent<HTMLHRElement>);
    });

    await appContextMock.waitFor(() =>
      expect(hookProps.onAddIsolationStatusClick).toHaveBeenCalledWith('unisolateHost')
    );
  });
});
