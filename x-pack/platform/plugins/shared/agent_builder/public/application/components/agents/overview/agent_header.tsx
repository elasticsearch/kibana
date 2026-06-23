/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { AgentDefinition } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { SYSTEM_USER_ID } from '@kbn/agent-builder-common/constants';
import { getEbtProps } from '@kbn/ebt-click';
import { css } from '@emotion/react';
import { labels } from '../../../utils/i18n';
import { AgentAvatar } from '../../common/agent_avatar';
import { AgentVisibilityBadge } from '../list/agent_visibility_badge';
import { AgentDescription } from './agent_description';
import { accessSummaryManageButton } from '../access/access_i18n';

const { agentOverview: overviewLabels } = labels;

export interface AgentHeaderProps {
  agent: AgentDefinition;
  docsUrl?: string;
  canEditAgent: boolean;
  onEditDetails: () => void;
  canManageAccess?: boolean;
  onManageAccess?: () => void;
}

export const AgentHeader: React.FC<AgentHeaderProps> = ({
  agent,
  docsUrl,
  canEditAgent,
  onEditDetails,
  canManageAccess,
  onManageAccess,
}) => {
  const { euiTheme } = useEuiTheme();

  const textSubduedStyles = css`
    color: ${euiTheme.colors.textSubdued};
  `;

  let createdByUsername = agent.created_by?.username;
  if (createdByUsername === SYSTEM_USER_ID) {
    createdByUsername = overviewLabels.createdByElastic;
  }
  const byAuthorLabel = createdByUsername && overviewLabels.byAuthor(createdByUsername);

  return (
    <>
      <EuiFlexGroup gutterSize="m" responsive={false}>
        <EuiFlexGroup responsive={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <AgentAvatar agent={agent} size="xl" iconSize="xl" iconPaddingSize="m" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column" gutterSize="xs">
              <EuiTitle size="l">
                <h1>{agent.name}</h1>
              </EuiTitle>
              <EuiFlexGroup alignItems="center" gutterSize="l" responsive={false} wrap>
                {byAuthorLabel && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued">
                      {byAuthorLabel}
                    </EuiText>
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText color="subdued" size="s">
                        {overviewLabels.agentId(agent.id)}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false} css={textSubduedStyles}>
                      <EuiCopy textToCopy={agent.id}>
                        {(copy) => (
                          <EuiToolTip
                            content={overviewLabels.copyIdAriaLabel}
                            disableScreenReaderOutput
                          >
                            <EuiButtonIcon
                              iconType="copy"
                              onClick={copy}
                              size="xs"
                              aria-label={overviewLabels.copyIdAriaLabel}
                              data-test-subj="agentOverviewCopyId"
                              css={textSubduedStyles}
                              {...getEbtProps({
                                element: AGENT_BUILDER_UI_EBT.element.pageContent,
                                action: AGENT_BUILDER_UI_EBT.action.agentOverview.COPY_ID,
                                detail: AGENT_BUILDER_UI_EBT.entity.AGENT,
                              })}
                            />
                          </EuiToolTip>
                        )}
                      </EuiCopy>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <AgentVisibilityBadge agent={agent} />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" responsive={false}>
            {docsUrl && (
              <EuiButtonEmpty
                href={docsUrl}
                target="_blank"
                iconType="question"
                size="s"
                data-test-subj="agentOverviewDocsLink"
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.pageContent,
                  action: AGENT_BUILDER_UI_EBT.action.agentOverview.DOCS_LINK,
                  detail: AGENT_BUILDER_UI_EBT.entity.AGENT,
                })}
              >
                {overviewLabels.docsLink}
              </EuiButtonEmpty>
            )}
            {canEditAgent && (
              <EuiButtonEmpty
                iconType="pencil"
                size="s"
                onClick={onEditDetails}
                data-test-subj="agentOverviewEditDetailsButton"
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.pageContent,
                  action: AGENT_BUILDER_UI_EBT.action.agentOverview.EDIT_DETAILS,
                  detail: AGENT_BUILDER_UI_EBT.entity.AGENT,
                })}
              >
                {overviewLabels.editDetailsButton}
              </EuiButtonEmpty>
            )}
            {canManageAccess && onManageAccess && (
              <EuiButtonEmpty
                iconType="lockOpen"
                size="s"
                onClick={onManageAccess}
                data-test-subj="agentOverviewManageAccessButton"
              >
                {accessSummaryManageButton}
              </EuiButtonEmpty>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />
      <AgentDescription description={agent.description} />

      {agent.labels && agent.labels.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
            {agent.labels.map((label) => (
              <EuiBadge key={label} color="hollow">
                {label}
              </EuiBadge>
            ))}
          </EuiFlexGroup>
        </>
      )}
      <EuiSpacer size="m" />
    </>
  );
};
