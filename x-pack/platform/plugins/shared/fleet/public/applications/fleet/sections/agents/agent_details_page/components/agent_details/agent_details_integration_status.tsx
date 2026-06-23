/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import {
  EuiHealth,
  EuiLink,
  EuiNotificationBadge,
  EuiToolTip,
  EuiText,
  EuiTreeView,
  euiFontSize,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import styled from '@emotion/styled';

import type { Agent, PackagePolicy } from '../../../../../types';
import { useLink } from '../../../../../hooks';

import { AgentDetailsIntegrationInputStatus } from './agent_details_integration_input_status';
import { displayInputType, getLogsQueryByInputType } from './input_type_utils';
import { type InputStatusFormatter } from './input_status_utils';

const StyledEuiLink = styled(EuiLink)`
  font-size: ${(props) => euiFontSize(props.theme, 's').fontSize?.toString()};
`;

const StyledEuiTreeView = styled(EuiTreeView)`
  .input-action-item-expanded {
    height: auto;
    padding-top: ${(props) => props.theme.euiTheme.size.s};
    padding-bottom: ${(props) => props.theme.euiTheme.size.s};
    .euiTreeView__nodeLabel {
      width: 100%;
      user-select: text;
      cursor: text;
    }
  }
  .euiTreeView__node--expanded {
    max-height: none !important;
    .policy-response-action-expanded + div {
      .euiTreeView__node {
        // When response action item displays a callout, this needs to be overwritten to remove the default max height of EuiTreeView
        max-height: none !important;
      }
    }
  }
  .euiTreeView__node {
    max-height: none !important;
    .euiNotificationBadge {
      margin-right: 5px;
    }
    .euiTreeView__nodeLabel {
      .euiText {
        font-size: ${(props) => euiFontSize(props.theme, 's').fontSize?.toString()};
        user-select: text;
        cursor: text;
      }
    }
  }
`;

export const AgentDetailsIntegrationStatus: React.FunctionComponent<{
  agent: Agent;
  packagePolicy: PackagePolicy;
  itemStatusMap: Map<string, InputStatusFormatter>;
  itemType: 'Input' | 'Output';
  outputName?: string;
  linkToLogs?: boolean;
  'data-test-subj'?: string;
}> = memo(
  ({
    agent,
    packagePolicy,
    itemStatusMap,
    itemType,
    outputName,
    linkToLogs = true,
    'data-test-subj': dataTestSubj,
  }) => {
    const { getHref } = useLink();

    const getItemStatusIcon = useCallback(
      (inputType: string) => {
        const outputStatus = itemStatusMap.get(inputType)!;
        if (outputStatus?.status === undefined) {
          return (
            <EuiHealth
              color="default"
              data-test-subj={`agentDetailsIntegrations${itemType}StatusHealthDefault`}
              className="itemStatusHealth"
            />
          );
        }
        return outputStatus.status === 'HEALTHY' ? (
          <EuiHealth
            color="success"
            data-test-subj={`agentDetailsIntegrations${itemType}StatusHealthSuccess`}
            className="itemStatusHealth"
          />
        ) : (
          <EuiNotificationBadge
            data-test-subj={`agentDetailsIntegrations${itemType}StatusAttentionHealth`}
            className="itemStatusHealth"
          >
            {1}
          </EuiNotificationBadge>
        );
      },
      [itemStatusMap, itemType]
    );

    const itemsResponse = useMemo(() => {
      return packagePolicy.inputs.reduce(
        (
          acc: Array<{
            label: JSX.Element;
            id: string;
            icon: JSX.Element;
            children: Array<{ label: JSX.Element; id: string }>;
          }>,
          current
        ) => {
          if (current.enabled) {
            const inputStatusFormatter = itemStatusMap.get(current.type);

            const labelText = outputName
              ? `${displayInputType(current.type, current?.id)}: ${outputName}`
              : displayInputType(current.type, current?.id);

            return [
              ...acc,
              {
                label: (
                  <EuiToolTip
                    content={i18n.translate('xpack.fleet.agentDetailsIntegrations.viewLogsButton', {
                      defaultMessage: 'View logs',
                    })}
                  >
                    {linkToLogs ? (
                      <StyledEuiLink
                        href={getHref('agent_details', {
                          agentId: agent.id,
                          tabId: 'logs',
                          logQuery: getLogsQueryByInputType(current.type),
                        })}
                      >
                        {labelText}
                      </StyledEuiLink>
                    ) : (
                      <>{labelText}</>
                    )}
                  </EuiToolTip>
                ),
                id: current.type,
                icon: getItemStatusIcon(current.type),
                children: !!inputStatusFormatter
                  ? [
                      {
                        label: (
                          <AgentDetailsIntegrationInputStatus
                            inputStatusFormatter={inputStatusFormatter}
                          />
                        ),
                        id: `input-status-${current.type}`,
                        isExpanded: true,
                        className: 'input-action-item-expanded',
                      },
                    ]
                  : [],
              },
            ];
          }
          return acc;
        },
        []
      );
    }, [
      itemStatusMap,
      agent.id,
      linkToLogs,
      packagePolicy,
      getHref,
      getItemStatusIcon,
      outputName,
    ]);

    const itemsTreeView = useMemo(() => {
      const itemsTotalErrors = Array.from(itemStatusMap.values()).reduce((acc, item) => {
        if (item.hasError) {
          acc += 1;
        }
        return acc;
      }, 0);
      return [
        {
          label: (
            <EuiText
              color={itemsTotalErrors ? 'danger' : 'default'}
              size="s"
              data-test-subj={
                itemType === 'Input'
                  ? `agentIntegrationsInputsTitle`
                  : `agentIntegrationsOutputsTitle`
              }
            >
              {itemType === 'Input' ? (
                <FormattedMessage
                  id="xpack.fleet.agentDetailsIntegrations.inputsTypeLabel"
                  defaultMessage="Inputs"
                />
              ) : (
                <FormattedMessage
                  id="xpack.fleet.agentDetailsIntegrations.outputsTypeLabel"
                  defaultMessage="Outputs"
                />
              )}
            </EuiText>
          ),
          id: 'agentIntegrationsItems',
          icon: itemsTotalErrors ? (
            <EuiNotificationBadge size="s" data-test-subj="agentIntegrationsItemsStatusHealth">
              {itemsTotalErrors}
            </EuiNotificationBadge>
          ) : undefined,
          children: itemsResponse,
        },
      ];
    }, [itemStatusMap, itemType, itemsResponse]);

    return (
      <StyledEuiTreeView
        items={itemsTreeView}
        showExpansionArrows
        aria-label="inputsTreeView"
        aria-labelledby="inputsTreeView"
      />
    );
  }
);
