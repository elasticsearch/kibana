/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AppContextTestRender,
  UserPrivilegesMockSetter,
} from '../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../common/mock/endpoint';
import { useUserPrivileges as _useUserPrivileges } from '../../../../../common/components/user_privileges';
import { EndpointMetadataGenerator } from '../../../../../../common/endpoint/data_generators/endpoint_metadata_generator';
import type { HostInfo } from '../../../../../../common/endpoint/types';
import type { EndpointCapabilities } from '../../../../../../common/endpoint/service/response_actions/constants';
import { ENDPOINT_VERSION_NOT_SUPPORTED, HOST_ISOLATION } from '../../../../common/translations';
import type { ContextMenuItemNavByRouterProps } from '../../../../components/context_menu_with_router_support/context_menu_item_nav_by_router';
import { useEndpointActionItems } from './use_endpoint_action_items';

jest.mock('../../../../../common/components/user_privileges');

const useUserPrivilegesMock = _useUserPrivileges as jest.Mock;

describe('useEndpointActionItems', () => {
  let appContextMock: AppContextTestRender;
  let authMockSetter: UserPrivilegesMockSetter;
  let generator: EndpointMetadataGenerator;
  let endpointInfo: HostInfo;

  const getIsolateActionItem = (
    items: ContextMenuItemNavByRouterProps[]
  ): ContextMenuItemNavByRouterProps | undefined =>
    items.find((item) => item['data-test-subj'] === 'isolateLink');

  // Build a `HostInfo` whose endpoint capabilities are exactly the ones provided. When `capabilities`
  // is `undefined` the `Endpoint.capabilities` property is removed entirely.
  const buildEndpointInfo = (capabilities: EndpointCapabilities[] | undefined): HostInfo => {
    const hostInfo = generator.generateHostInfo();

    hostInfo.metadata.Endpoint.state = { isolation: false };

    if (capabilities === undefined) {
      delete hostInfo.metadata.Endpoint.capabilities;
    } else {
      hostInfo.metadata.Endpoint.capabilities = capabilities;
    }

    return hostInfo;
  };

  const render = () =>
    appContextMock.renderHook(() => useEndpointActionItems(endpointInfo, { isEndpointList: true }));

  beforeEach(() => {
    appContextMock = createAppRootMockRenderer();
    generator = new EndpointMetadataGenerator('test');
    authMockSetter = appContextMock.getUserPrivilegesMockSetter(useUserPrivilegesMock);
    authMockSetter.set({
      canIsolateHost: true,
      canUnIsolateHost: true,
    });
    endpointInfo = buildEndpointInfo(['isolation']);
  });

  afterEach(() => {
    authMockSetter.reset();
  });

  it('should return an enabled isolate action when the endpoint supports isolation', () => {
    const { result } = render();
    const isolateAction = getIsolateActionItem(result.current);

    expect(isolateAction).toEqual(
      expect.objectContaining({
        disabled: false,
        toolTipContent: '',
      })
    );
  });

  it('should return a disabled isolate action when the endpoint does not support isolation', () => {
    endpointInfo = buildEndpointInfo(['get_file']);
    const { result } = render();
    const isolateAction = getIsolateActionItem(result.current);

    expect(isolateAction).toEqual(
      expect.objectContaining({
        disabled: true,
        toolTipContent: ENDPOINT_VERSION_NOT_SUPPORTED(HOST_ISOLATION),
      })
    );
  });

  it('should default to supporting isolation when the endpoint has no capabilities defined', () => {
    endpointInfo = buildEndpointInfo(undefined);
    const { result } = render();
    const isolateAction = getIsolateActionItem(result.current);

    expect(isolateAction).toEqual(
      expect.objectContaining({
        disabled: false,
        toolTipContent: '',
      })
    );
  });

  it('should not return an isolate action when the user lacks isolate privilege', () => {
    authMockSetter.set({
      canIsolateHost: false,
      canUnIsolateHost: false,
    });
    endpointInfo = buildEndpointInfo(['get_file']);
    const { result } = render();

    expect(getIsolateActionItem(result.current)).toBeUndefined();
  });
});
