/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { pagePathGetters } from '@kbn/fleet-plugin/public';
import { ENDPOINT_VERSION_NOT_SUPPORTED, HOST_ISOLATION } from '../../../../common/translations';
import type { EndpointCapabilities } from '../../../../../../common/endpoint/service/response_actions/constants';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { useWithShowResponder } from '../../../../hooks';
import { APP_UI_ID } from '../../../../../../common/constants';
import { getEndpointDetailsPath, getEndpointListPath } from '../../../../common/routing';
import type { HostInfo, MaybeImmutable } from '../../../../../../common/endpoint/types';
import { useEndpointSelector } from './hooks';
import { uiQueryParams } from '../../store/selectors';
import { useAppUrl } from '../../../../../common/lib/kibana/hooks';
import type { ContextMenuItemNavByRouterProps } from '../../../../components/context_menu_with_router_support/context_menu_item_nav_by_router';
import { isEndpointHostIsolated } from '../../../../../common/utils/validators';
import { getHostPlatform } from '../../../../../common/lib/endpoint/utils/get_host_platform';

interface Options {
  isEndpointList: boolean;
}

/**
 * Returns a list (array) of actions for an individual endpoint
 * @param endpointInfo
 * @param options
 */
export const useEndpointActionItems = (
  endpointInfo: MaybeImmutable<HostInfo> | undefined,
  options?: Options
): ContextMenuItemNavByRouterProps[] => {
  const { getAppUrl } = useAppUrl();
  const allCurrentUrlParams = useEndpointSelector(uiQueryParams);
  const showEndpointResponseActionsConsole = useWithShowResponder();
  const {
    canAccessResponseConsole,
    canIsolateHost,
    canUnIsolateHost,
    canAccessEndpointActionsLogManagement,
    canReadFleetAgentPolicies,
    canWriteFleetAgents,
    canReadFleetAgents,
  } = useUserPrivileges().endpointPrivileges;

  return useMemo<ContextMenuItemNavByRouterProps[]>(() => {
    if (!endpointInfo) {
      return [];
    }

    const endpointAgentPolicyId = endpointInfo.policy_info?.agent.applied.id;
    const endpointMetadata = endpointInfo.metadata;
    const supportsHostIsolation =
      endpointInfo.metadata.Endpoint.capabilities?.includes('isolation') ?? true;
    const isIsolated = isEndpointHostIsolated(endpointMetadata);
    const endpointId = endpointMetadata.agent.id;
    const endpointHostName = endpointMetadata.host.hostname.toLowerCase();
    const fleetAgentId = endpointMetadata.elastic.agent.id;
    const { show, selected_endpoint: _selectedEndpoint, ...currentUrlParams } = allCurrentUrlParams;
    const endpointActionsPath = getEndpointDetailsPath({
      name: 'endpointActivityLog',
      ...currentUrlParams,
      selected_endpoint: endpointId,
    });
    const endpointIsolatePath = getEndpointDetailsPath({
      name: 'endpointIsolate',
      ...currentUrlParams,
      selected_endpoint: endpointId,
    });
    const endpointUnIsolatePath = getEndpointDetailsPath({
      name: 'endpointUnIsolate',
      ...currentUrlParams,
      selected_endpoint: endpointId,
    });

    const isolationActions: ContextMenuItemNavByRouterProps[] = [];

    if (isIsolated && canUnIsolateHost) {
      // Un-isolate is available to users regardless of license level if they have unisolate permissions
      isolationActions.push({
        'data-test-subj': 'unIsolateLink',
        icon: 'lockOpen',
        key: 'unIsolateHost',
        navigateAppId: APP_UI_ID,
        navigateOptions: {
          path: endpointUnIsolatePath,
        },
        href: getAppUrl({ path: endpointUnIsolatePath }),
        children: (
          <FormattedMessage
            id="xpack.securitySolution.endpoint.actions.unIsolateHost"
            defaultMessage="Release host"
          />
        ),
      });
    } else if (canIsolateHost) {
      // For Platinum++ licenses, users also have ability to isolate
      isolationActions.push({
        'data-test-subj': 'isolateLink',
        icon: 'lock',
        key: 'isolateHost',
        navigateAppId: APP_UI_ID,
        navigateOptions: { path: endpointIsolatePath },
        href: getAppUrl({ path: endpointIsolatePath }),
        toolTipContent: !supportsHostIsolation
          ? ENDPOINT_VERSION_NOT_SUPPORTED(HOST_ISOLATION)
          : '',
        disabled: !supportsHostIsolation,
        children: (
          <FormattedMessage
            id="xpack.securitySolution.endpoint.actions.isolateHost"
            defaultMessage="Isolate host"
          />
        ),
      });
    }

    return [
      ...isolationActions,
      ...(canAccessResponseConsole
        ? [
            {
              'data-test-subj': 'console',
              icon: 'commandLine',
              key: 'consoleLink',
              onClick: (ev: React.MouseEvent) => {
                ev.preventDefault();
                showEndpointResponseActionsConsole({
                  agentId: endpointMetadata.agent.id,
                  agentType: 'endpoint',
                  capabilities:
                    (endpointMetadata.Endpoint.capabilities as EndpointCapabilities[]) ?? [],
                  hostName: endpointMetadata.host.name,
                  platform: getHostPlatform(endpointMetadata),
                });
              },
              children: (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.actions.console"
                  defaultMessage="Respond"
                />
              ),
            },
          ]
        : []),
      ...(options?.isEndpointList && canAccessEndpointActionsLogManagement
        ? [
            {
              'data-test-subj': 'actionsLink',
              icon: 'logoSecurity',
              key: 'actionsLogLink',
              navigateAppId: APP_UI_ID,
              navigateOptions: { path: endpointActionsPath },
              href: getAppUrl({ path: endpointActionsPath }),
              children: (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.actions.responseActionsHistory"
                  defaultMessage="View response actions history"
                />
              ),
            },
          ]
        : []),
      {
        'data-test-subj': 'hostLink',
        icon: 'logoSecurity',
        key: 'hostDetailsLink',
        navigateAppId: APP_UI_ID,
        navigateOptions: { path: `/hosts/${endpointHostName}` },
        href: getAppUrl({ path: `/hosts/${endpointHostName}` }),
        children: (
          <FormattedMessage
            id="xpack.securitySolution.endpoint.actions.hostDetails"
            defaultMessage="View host details"
          />
        ),
      },
      ...(canReadFleetAgentPolicies
        ? [
            {
              icon: 'gear',
              key: 'agentConfigLink',
              'data-test-subj': 'agentPolicyLink',
              navigateAppId: 'fleet',
              ...(endpointAgentPolicyId
                ? {
                    navigateOptions: {
                      path: `${
                        pagePathGetters.policy_details({
                          policyId: endpointAgentPolicyId,
                        })[1]
                      }`,
                    },
                    href: `${getAppUrl({ appId: 'fleet' })}${
                      pagePathGetters.policy_details({
                        policyId: endpointAgentPolicyId,
                      })[1]
                    }`,
                  }
                : {}),
              disabled: endpointAgentPolicyId === undefined,
              children: (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.actions.agentPolicy"
                  defaultMessage="View agent policy"
                />
              ),
            },
          ]
        : []),
      ...(canReadFleetAgents
        ? [
            {
              icon: 'gear',
              key: 'agentDetailsLink',
              'data-test-subj': 'agentDetailsLink',
              navigateAppId: 'fleet',
              navigateOptions: {
                path: `${
                  pagePathGetters.agent_details({
                    agentId: fleetAgentId,
                  })[1]
                }`,
              },
              href: `${getAppUrl({ appId: 'fleet' })}${
                pagePathGetters.agent_details({
                  agentId: fleetAgentId,
                })[1]
              }`,
              children: (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.actions.agentDetails"
                  defaultMessage="View agent details"
                />
              ),
            },
          ]
        : []),
      ...(canWriteFleetAgents
        ? [
            {
              icon: 'gear',
              key: 'agentPolicyReassignLink',
              'data-test-subj': 'agentPolicyReassignLink',
              navigateAppId: 'fleet',
              navigateOptions: {
                path: `${
                  pagePathGetters.agent_details({
                    agentId: fleetAgentId,
                  })[1]
                }?openReassignFlyout=true`,
                state: {
                  onDoneNavigateTo: [
                    APP_UI_ID,
                    { path: getEndpointListPath({ name: 'endpointList' }) },
                  ],
                },
              },
              href: `${getAppUrl({ appId: 'fleet' })}${
                pagePathGetters.agent_details({
                  agentId: fleetAgentId,
                })[1]
              }?openReassignFlyout=true`,
              children: (
                <FormattedMessage
                  id="xpack.securitySolution.endpoint.actions.agentPolicyReassign"
                  defaultMessage="Reassign agent policy"
                />
              ),
            },
          ]
        : []),
    ];
  }, [
    allCurrentUrlParams,
    canAccessResponseConsole,
    canAccessEndpointActionsLogManagement,
    endpointInfo,
    getAppUrl,
    showEndpointResponseActionsConsole,
    options?.isEndpointList,
    canIsolateHost,
    canUnIsolateHost,
    canReadFleetAgentPolicies,
    canReadFleetAgents,
    canWriteFleetAgents,
  ]);
};
