/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';

import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';

import { getEbtProps } from '@kbn/ebt-click';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getLastAgentId } from '../../../../hooks/use_last_agent_id';
import { useNavigation } from '../../../../hooks/use_navigation';
import { appPaths } from '../../../../utils/app_paths';
import { AgentSelector } from './agent_selector';

const labels = {
  manageComponents: i18n.translate('xpack.agentBuilder.sidebar.header.manageComponents', {
    defaultMessage: 'Manage components',
  }),
  back: i18n.translate('xpack.agentBuilder.sidebar.header.back', {
    defaultMessage: 'Back',
  }),
  toggleSidebar: i18n.translate('xpack.agentBuilder.sidebar.header.toggleSidebar', {
    defaultMessage: 'Toggle sidebar',
  }),
  newConversation: i18n.translate('xpack.agentBuilder.sidebar.header.newConversation', {
    defaultMessage: 'New conversation',
  }),
};

interface SidebarHeaderProps {
  sidebarView: 'conversation' | 'manage';
  agentId: string;
  getNavigationPath: (newAgentId: string) => string;
  isCondensed: boolean;
  onToggleCondensed: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  sidebarView,
  agentId,
  getNavigationPath,
  isCondensed,
  onToggleCondensed,
}) => {
  const { euiTheme } = useEuiTheme();
  const navigate = useNavigate();
  const { navigateToAgentBuilderUrl } = useNavigation();

  const headerStyles = css`
    gap: ${euiTheme.size.s};
    padding: ${euiTheme.size.base};
    padding-left: ${euiTheme.size.l};
    flex-grow: 0;
  `;

  const condensedHeaderStyles = css`
    padding: ${euiTheme.size.base} 0;
    flex-grow: 0;
    align-items: center;
  `;

  if (isCondensed) {
    return (
      <EuiFlexGroup
        direction="column"
        alignItems="center"
        css={condensedHeaderStyles}
        gutterSize="s"
      >
        <EuiFlexItem grow={false}>
          <EuiToolTip content={labels.toggleSidebar} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="transitionLeftIn"
              aria-label={labels.toggleSidebar}
              aria-expanded={false}
              color="text"
              size="s"
              onClick={onToggleCondensed}
            />
          </EuiToolTip>
        </EuiFlexItem>
        {sidebarView === 'conversation' && (
          <EuiFlexItem grow={false}>
            <EuiToolTip content={labels.newConversation} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="plus"
                display="base"
                color="text"
                size="s"
                aria-label={labels.newConversation}
                onClick={() => {
                  navigateToAgentBuilderUrl(appPaths.agent.conversations.new({ agentId }));
                }}
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.sidebar,
                  action: AGENT_BUILDER_UI_EBT.action.conversationList.CONVERSATION_START,
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );
  }

  return (
    <EuiFlexGroup direction="column" css={headerStyles}>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
        {sidebarView === 'conversation' ? (
          <EuiFlexItem grow={true}>
            <AgentSelector agentId={agentId} getNavigationPath={getNavigationPath} />
          </EuiFlexItem>
        ) : (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="arrowLeft"
              iconSide="left"
              size="s"
              flush="both"
              color="text"
              onClick={() => {
                navigate(appPaths.agent.root({ agentId: getLastAgentId() }));
              }}
              {...getEbtProps({
                element: AGENT_BUILDER_UI_EBT.element.sidebar,
                action: AGENT_BUILDER_UI_EBT.action.navSidebar.SIDEBAR_LAYER_TRANSITION,
                detail: AGENT_BUILDER_UI_EBT.detail.layerTransition.BACK_CLICK,
              })}
            >
              {labels.manageComponents}
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
        {
          <EuiFlexItem grow={false}>
            <EuiToolTip content={labels.toggleSidebar} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="transitionLeftOut"
                aria-label={labels.toggleSidebar}
                aria-expanded={true}
                color="text"
                size="s"
                onClick={onToggleCondensed}
              />
            </EuiToolTip>
          </EuiFlexItem>
        }
      </EuiFlexGroup>
    </EuiFlexGroup>
  );
};
