/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useRouteMatch, useLocation } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiText,
  EuiSpacer,
} from '@elastic/eui';

import type { Props as EuiTabProps } from '@elastic/eui/src/components/tabs/tab';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import type { OutputsForAgentPolicy } from '../../../../../../server/types';

import type { Agent, AgentPolicy, AgentDetailsReassignPolicyAction } from '../../../types';
import { FLEET_ROUTING_PATHS } from '../../../constants';
import { removeVersionSuffixFromPolicyId } from '../../../../../../common/services/version_specific_policies_utils';
import { Loading, Error } from '../../../components';
import {
  useGetOneAgent,
  useGetOneAgentPolicy,
  useLink,
  useBreadcrumbs,
  useStartServices,
  useIntraAppState,
  sendGetAgentTagsForRq,
  useAgentlessResources,
  useGetInfoOutputsForPolicy,
} from '../../../hooks';
import { WithHeaderLayout } from '../../../layouts';
import { ExperimentalFeaturesService } from '../../../services';
import { TagsAddRemove } from '../agent_list_page/components';

import { AgentRefreshContext } from './hooks';
import {
  AgentLogs,
  AgentDetailsActionMenu,
  AgentDetailsContent,
  AgentDiagnosticsTab,
} from './components';
import { AgentSettings } from './components/agent_settings';
import { CollectorDetailsContent } from './components/collector_detail';

export const AgentDetailsPage: React.FunctionComponent = () => {
  const {
    params: { agentId, tabId = '' },
  } = useRouteMatch<{ agentId: string; tabId?: string }>();
  const { getHref } = useLink();
  const { showAgentless } = useAgentlessResources();
  const {
    isLoading,
    isInitialRequest,
    error,
    data: agentData,
    resendRequest: sendAgentRequest,
  } = useGetOneAgent(agentId, {
    pollIntervalMs: 5000,
    query: {
      withMetrics: true,
    },
  });
  const {
    isLoading: isAgentPolicyLoading,
    data: agentPolicyData,
    sendRequest: sendAgentPolicyRequest,
  } = useGetOneAgentPolicy(
    agentData?.item?.policy_id
      ? removeVersionSuffixFromPolicyId(agentData.item.policy_id)
      : undefined
  );

  const { data: outputsData } = useGetInfoOutputsForPolicy(agentPolicyData?.item?.id);

  const {
    application: { navigateToApp },
    notifications,
  } = useStartServices();
  const routeState = useIntraAppState<AgentDetailsReassignPolicyAction>();
  const queryParams = new URLSearchParams(useLocation().search);
  const openReassignFlyoutOpenByDefault = queryParams.get('openReassignFlyout') === 'true';

  const reassignCancelClickHandler = useCallback(() => {
    if (routeState && routeState.onDoneNavigateTo) {
      navigateToApp(routeState.onDoneNavigateTo[0], routeState.onDoneNavigateTo[1]);
    }
  }, [routeState, navigateToApp]);

  const isAgentlessAgent = agentPolicyData?.item.supports_agentless;
  const agent =
    agentData?.item && (isAgentlessAgent ? showAgentless : true) ? agentData.item : null;
  const host = agent && agent.local_metadata?.host;

  const { enableOtelUI } = ExperimentalFeaturesService.get();
  const classicView = queryParams.get('classic') === 'true';
  const isCollector = enableOtelUI && agent?.type === 'OPAMP' && !classicView;

  const headerLeftContent = useMemo(
    () => (
      <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
        <EuiFlexItem>
          <EuiButtonEmpty
            iconType="chevronSingleLeft"
            href={getHref('agent_list')}
            flush="left"
            size="xs"
            aria-label="View all agents"
          >
            <FormattedMessage
              id="xpack.fleet.agentDetails.viewAgentListTitle"
              defaultMessage="View all agents"
            />
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText className="eui-textBreakWord">
                <h1>
                  {isLoading && isInitialRequest ? (
                    <Loading />
                  ) : typeof host === 'object' && typeof host?.hostname === 'string' ? (
                    host.hostname
                  ) : (
                    <FormattedMessage
                      id="xpack.fleet.agentDetails.agentDetailsTitle"
                      defaultMessage="Agent ''{id}''"
                      values={{
                        id: agentId,
                      }}
                    />
                  )}
                </h1>
              </EuiText>
            </EuiFlexItem>
            {isCollector && (
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">
                  <FormattedMessage
                    id="xpack.fleet.agentDetails.collectorBadge"
                    defaultMessage="Collector (OpAMP)"
                  />
                </EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [host, agentId, getHref, isInitialRequest, isLoading, isCollector]
  );

  const [tagsPopoverButton, setTagsPopoverButton] = useState<HTMLElement>();
  const [showTagsAddRemove, setShowTagsAddRemove] = useState(false);

  const [allTags, setAllTags] = useState<string[]>();

  useEffect(() => {
    // Fetch all tags when the component mounts
    const fetchTags = async () => {
      try {
        const agentTagsResponse = await sendGetAgentTagsForRq({
          showInactive: agent?.status === 'inactive',
        });
        const newAllTags = agentTagsResponse?.items ?? [];
        setAllTags(newAllTags);
      } catch (err) {
        notifications.toasts.addError(err, {
          title: i18n.translate('xpack.fleet.agentList.errorFetchingTagsTitle', {
            defaultMessage: 'Error fetching tags',
          }),
        });
      }
    };

    if (agent?.active) {
      fetchTags();
    }
  }, [setAllTags, notifications, agent]);

  const headerRightContent = useMemo(
    () =>
      agent ? (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s" direction="row">
            {!isAgentPolicyLoading && (
              <EuiFlexItem grow={false}>
                <AgentDetailsActionMenu
                  agent={agent}
                  agentPolicy={agentPolicyData?.item}
                  assignFlyoutOpenByDefault={openReassignFlyoutOpenByDefault}
                  onCancelReassign={
                    routeState && routeState.onDoneNavigateTo
                      ? reassignCancelClickHandler
                      : undefined
                  }
                  onAddRemoveTagsClick={(button) => {
                    setTagsPopoverButton(button);
                    setShowTagsAddRemove(!showTagsAddRemove);
                  }}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      ) : undefined,
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [agentPolicyData, agentData, getHref, isAgentPolicyLoading]
  );

  const headerTabs = useMemo(() => {
    return [
      {
        id: 'details',
        name: isCollector
          ? i18n.translate('xpack.fleet.agentDetails.subTabs.collectorDetailsTab', {
              defaultMessage: 'Collector details',
            })
          : i18n.translate('xpack.fleet.agentDetails.subTabs.detailsTab', {
              defaultMessage: 'Agent details',
            }),
        href: getHref('agent_details', { agentId, tabId: 'details' }),
        isSelected: !tabId || tabId === 'details',
      },
      {
        id: 'logs',
        name: i18n.translate('xpack.fleet.agentDetails.subTabs.logsTab', {
          defaultMessage: 'Logs',
        }),
        href: getHref('agent_details_logs', { agentId, tabId: 'logs' }),
        isSelected: tabId === 'logs',
      },
      ...(!isCollector
        ? [
            {
              id: 'diagnostics',
              name: i18n.translate('xpack.fleet.agentDetails.subTabs.diagnosticsTab', {
                defaultMessage: 'Diagnostics',
              }),
              href: getHref('agent_details_diagnostics', { agentId, tabId: 'diagnostics' }),
              isSelected: tabId === 'diagnostics',
            },
          ]
        : []),
      {
        id: 'settings',
        name: i18n.translate('xpack.fleet.agentDetails.subTabs.settingsTab', {
          defaultMessage: 'Settings',
        }),
        href: getHref('agent_details_settings', { agentId, tabId: 'settings' }),
        isSelected: tabId === 'settings',
      },
    ];
  }, [getHref, agentId, tabId, isCollector]);

  return (
    <AgentRefreshContext.Provider
      value={{
        refresh: () => {
          sendAgentRequest();
          sendAgentPolicyRequest();
        },
      }}
    >
      <WithHeaderLayout
        leftColumn={headerLeftContent}
        rightColumn={headerRightContent}
        tabs={headerTabs as unknown as EuiTabProps[]}
      >
        {isLoading && isInitialRequest ? (
          <Loading />
        ) : error ? (
          <Error
            title={
              <FormattedMessage
                id="xpack.fleet.agentDetails.unexceptedErrorTitle"
                defaultMessage="Error loading agent"
              />
            }
            error={error}
          />
        ) : agent ? (
          <>
            <AgentDetailsPageContent
              agent={agent}
              agentPolicy={agentPolicyData?.item}
              outputs={outputsData?.item}
              isCollector={isCollector}
            />
            {showTagsAddRemove && (
              <TagsAddRemove
                agentId={agent?.id!}
                allTags={allTags ?? []}
                selectedTags={agent?.tags ?? []}
                button={tagsPopoverButton!}
                onTagsUpdated={(tagsToAdd: string[]) => {
                  sendAgentRequest();
                  if (tagsToAdd.length > 0) {
                    setAllTags([...new Set([...(allTags ?? []), ...tagsToAdd])].sort());
                  }
                }}
                onClosePopover={() => {
                  setShowTagsAddRemove(false);
                }}
              />
            )}
          </>
        ) : (
          <Error
            title={
              <FormattedMessage
                id="xpack.fleet.agentDetails.agentNotFoundErrorTitle"
                defaultMessage="Agent not found"
              />
            }
            error={i18n.translate('xpack.fleet.agentDetails.agentNotFoundErrorDescription', {
              defaultMessage: 'Cannot find agent ID {agentId}',
              values: {
                agentId,
              },
            })}
          />
        )}
      </WithHeaderLayout>
    </AgentRefreshContext.Provider>
  );
};

const AgentDetailsPageContent: React.FunctionComponent<{
  agent: Agent;
  agentPolicy?: AgentPolicy;
  outputs?: OutputsForAgentPolicy;
  isCollector: boolean;
}> = ({ agent, agentPolicy, outputs, isCollector }) => {
  useBreadcrumbs('agent_details', {
    agentHost:
      typeof agent.local_metadata.host === 'object' &&
      typeof agent.local_metadata.host.hostname === 'string'
        ? agent.local_metadata.host.hostname
        : '-',
  });

  return (
    <Routes>
      <Route
        path={FLEET_ROUTING_PATHS.agent_details_logs}
        render={() => {
          return <AgentLogs agent={agent} agentPolicy={agentPolicy} />;
        }}
      />
      {!isCollector && (
        <Route
          path={FLEET_ROUTING_PATHS.agent_details_diagnostics}
          render={() => {
            return <AgentDiagnosticsTab agent={agent} />;
          }}
        />
      )}
      <Route
        path={FLEET_ROUTING_PATHS.agent_details_settings}
        render={() => {
          return <AgentSettings agent={agent} agentPolicy={agentPolicy} />;
        }}
      />
      <Route
        path={FLEET_ROUTING_PATHS.agent_details}
        render={() => {
          return isCollector ? (
            <CollectorDetailsContent agent={agent} />
          ) : (
            <AgentDetailsContent agent={agent} agentPolicy={agentPolicy} outputs={outputs} />
          );
        }}
      />
    </Routes>
  );
};
