/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiAvatar,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
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
import { CaseDetailsLink } from '../../../../links';
import { ActionColumnComponent as ActionColumn } from '../../../../all_cases/use_actions';
import { severities } from '../../../../severity/config';
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

  const styles = useMemo(
    () => ({
      mainFlexGroup: css`
        height: 100%;
      `,
      panel: css`
        min-height: ${LIST_ITEM_HEIGHT}px;
        border-radius: ${euiTheme.border.radius.medium};
        transition: background-color 150ms ease-in-out;

        &:hover {
          background-color: ${euiTheme.colors.backgroundBaseSubdued};
        }
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
      <EuiFlexGroup
        alignItems="center"
        gutterSize="s"
        responsive={false}
        wrap={false}
        css={styles.mainFlexGroup}
      >
        <EuiFlexItem grow>
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
              <CaseDetailsLink detailName={theCase.id} title={theCase.title}>
                <EuiText size="s" data-test-subj="cases-list-item-title" css={styles.title}>
                  {theCase.title}
                </EuiText>
              </CaseDetailsLink>
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
          <ListItemOptionalFields theCase={theCase} selectedFields={selectedFields} />
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge
                color={euiTheme.colors.backgroundLightText}
                iconType="comment"
                data-test-subj="cases-list-item-comments-badge"
              >
                {theCase.totalComment}
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
