/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiAvatar,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { Status } from '@kbn/cases-components/src/status/status';

import type { CaseUI } from '../../../../../../common/ui/types';
import type { CasesColumnSelection } from '../../types';
import { ListItemOptionalFields } from './list_item_optional_fields';
import { UserToolTip } from '../../../../user_profiles/user_tooltip';
import { SmallUserAvatar } from '../../../../user_profiles/small_user_avatar';
import { useAssignees } from '../../../../../containers/user_profiles/use_assignees';
import { FormattedRelativePreferenceDate } from '../../../../formatted_date';
import { useCaseViewNavigation } from '../../../../../common/navigation/hooks';
import { ActionColumnComponent as ActionColumn } from '../../../../all_cases/use_actions';
import { severities } from '../../../../severity/config';
import { CASE_DETAILS_LINK_ARIA } from '../../../../links/translations';
import * as i18n from '../../translations';

const LIST_ITEM_HEIGHT = 80;
const MAX_VISIBLE_ASSIGNEES = 3;

export const CaseListItem: React.FC<{
  theCase: CaseUI;
  userProfiles: Map<string, UserProfileWithAvatar>;
  disableActions: boolean;
  selectedFields: CasesColumnSelection[];
}> = React.memo(({ theCase, userProfiles, disableActions, selectedFields }) => {
  const { euiTheme } = useEuiTheme();
  const { navigateToCaseView, getCaseViewUrl } = useCaseViewNavigation();

  const caseUrl = getCaseViewUrl({ detailName: theCase.id });

  const handleLinkClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      e.preventDefault();
      navigateToCaseView({ detailName: theCase.id });
    },
    [navigateToCaseView, theCase.id]
  );

  const styles = useMemo(
    () => ({
      panel: css`
        position: relative;
        isolation: isolate;
        min-height: ${LIST_ITEM_HEIGHT}px;
        border-radius: ${euiTheme.border.radius.medium};
        transition: background-color 150ms ease-in-out;

        &:hover {
          background-color: ${euiTheme.colors.backgroundBaseSubdued};
        }
      `,
      stretchedLink: css`
        display: block;
        flex: 1;
        min-width: 0;
        text-decoration: none;
        color: inherit;

        &:hover,
        &:focus {
          text-decoration: none;
          color: inherit;
        }

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          cursor: pointer;
        }
      `,
      actions: css`
        position: relative;
      `,
      title: css`
        font-size: ${euiTheme.size.base};
        font-weight: ${euiTheme.font.weight.bold};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: ${euiTheme.colors.textHeading};
      `,
      metaRow: css`
        margin-top: ${euiTheme.size.s};
      `,
      labelSpan: css`
        font-weight: ${euiTheme.font.weight.semiBold};
      `,
    }),
    [euiTheme]
  );

  const { allAssignees } = useAssignees({
    caseAssignees: theCase.assignees,
    userProfiles,
  });

  const reporterName = theCase.createdBy.fullName ?? theCase.createdBy.username ?? i18n.UNKNOWN;

  return (
    <EuiPanel
      hasBorder
      hasShadow={false}
      paddingSize="m"
      data-test-subj={`cases-list-item-${theCase.id}`}
      css={styles.panel}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={false}>
        <EuiFlexItem grow>
          <EuiLink
            href={caseUrl}
            onClick={handleLinkClick}
            css={styles.stretchedLink}
            aria-label={CASE_DETAILS_LINK_ARIA(theCase.title)}
            data-test-subj={`cases-list-item-clickable-${theCase.id}`}
          >
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={false}>
              {theCase.incrementalId != null && (
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued" data-test-subj="cases-list-item-id">
                    {'#'}
                    {theCase.incrementalId}
                  </EuiText>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiText size="s" data-test-subj="cases-list-item-title" css={styles.title}>
                  {theCase.title}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge
                  color={severities[theCase.severity].badgeColor}
                  data-test-subj={`case-severity-badge-${theCase.severity}`}
                >
                  {severities[theCase.severity].label}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <Status status={theCase.status} />
              </EuiFlexItem>
              {theCase.totalAlerts > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiBadge
                    color="danger"
                    iconType="warning"
                    data-test-subj="cases-list-item-alerts-badge"
                  >
                    {theCase.totalAlerts}
                  </EuiBadge>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>

            <EuiFlexGroup
              alignItems="center"
              gutterSize="s"
              responsive={false}
              wrap={false}
              css={styles.metaRow}
            >
              {allAssignees.length > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup
                    gutterSize="xs"
                    alignItems="center"
                    responsive={false}
                    data-test-subj="cases-list-item-assignees"
                  >
                    {allAssignees.slice(0, MAX_VISIBLE_ASSIGNEES).map((assignee) => (
                      <EuiFlexItem grow={false} key={assignee.uid}>
                        <UserToolTip userInfo={assignee.profile}>
                          <SmallUserAvatar userInfo={assignee.profile} />
                        </UserToolTip>
                      </EuiFlexItem>
                    ))}
                    {allAssignees.length > MAX_VISIBLE_ASSIGNEES && (
                      <EuiFlexItem grow={false}>
                        <EuiAvatar
                          name={`+${allAssignees.length - MAX_VISIBLE_ASSIGNEES}`}
                          initials={`+${allAssignees.length - MAX_VISIBLE_ASSIGNEES}`}
                          initialsLength={2}
                          size="s"
                          color="subdued"
                          data-test-subj="cases-list-item-assignees-overflow"
                        />
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued" data-test-subj="cases-list-item-reporter">
                  <span css={styles.labelSpan}>
                    {i18n.LIST_REPORTED_BY}
                    {':'}
                  </span>{' '}
                  {reporterName}
                </EuiText>
              </EuiFlexItem>
              {theCase.updatedAt && (
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued" data-test-subj="cases-list-item-updated-at">
                    <span css={styles.labelSpan}>
                      {i18n.LIST_LAST_UPDATE}
                      {':'}
                    </span>{' '}
                    <FormattedRelativePreferenceDate value={theCase.updatedAt} stripMs />
                  </EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiLink>
          <ListItemOptionalFields theCase={theCase} selectedFields={selectedFields} />
        </EuiFlexItem>

        <EuiFlexItem grow={false} css={styles.actions}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge
                color={euiTheme.colors.backgroundLightText}
                iconType="comment"
                data-test-subj="cases-list-item-comments-badge"
              >
                {String(theCase.totalComment)}
              </EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <ActionColumn theCase={theCase} disableActions={disableActions} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
});

CaseListItem.displayName = 'CaseListItem';
