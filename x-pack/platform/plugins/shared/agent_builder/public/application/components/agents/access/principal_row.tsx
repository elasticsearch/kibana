/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSuperSelect,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import {
  UserAvatar,
  getUserDisplayName,
  type UserProfileWithAvatar,
} from '@kbn/user-profile-components';
import type {
  AgentAccessControlEntry,
  AgentAccessControlRole,
  AgentAccessControlMode,
} from '@kbn/agent-builder-common';
import {
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  selectableRolesForAccessControlMode,
} from './role_to_capabilities';
import { accessFlyoutRemoveAriaLabel, accessFlyoutRoleAriaLabel } from './access_i18n';

interface PrincipalRowProps {
  entry: AgentAccessControlEntry;
  /** Resolved user profile for id-backed entries. Undefined while it loads or for legacy rows. */
  profile?: UserProfileWithAvatar;
  /** Used to constrain the selectable roles for Public/Shared agents. */
  accessControlMode?: AgentAccessControlMode;
  isDisabled?: boolean;
  onChangeRole: (next: AgentAccessControlRole) => void;
  onRemove: () => void;
}

/**
 * One row in the People section. Layout:
 *
 *   [avatar]  [name / secondary]                              [role select ▾]  [✕]
 */
export const PrincipalRow: React.FC<PrincipalRowProps> = ({
  entry,
  profile,
  accessControlMode,
  isDisabled,
  onChangeRole,
  onRemove,
}) => {
  const { euiTheme } = useEuiTheme();

  const roleOptions = useMemo(() => {
    const allowed = selectableRolesForAccessControlMode(accessControlMode);
    // Always include the entry's existing role even when not in the allowed list,
    // so admins can fix it without it disappearing from the select.
    const includeCurrent = allowed.includes(entry.role) ? allowed : [entry.role, ...allowed];
    return includeCurrent.map((role) => ({
      value: role,
      inputDisplay: ROLE_LABEL[role],
      dropdownDisplay: (
        <EuiFlexGroup direction="column" gutterSize="none" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>{ROLE_LABEL[role]}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {ROLE_DESCRIPTION[role]}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    }));
  }, [entry.role, accessControlMode]);

  const avatarStyles = css`
    flex-shrink: 0;
  `;

  const rowStyles = css`
    padding: ${euiTheme.size.s};
    border-top: ${euiTheme.border.thin};
    &:first-of-type {
      border-top: none;
    }
  `;

  // Fall back to the raw identifier while the profile loads or for legacy name-only entries.
  const displayName = profile ? getUserDisplayName(profile.user) : entry.name ?? entry.id ?? '';
  const secondary = profile?.user.email ?? profile?.user.username;
  const showSecondary = Boolean(secondary && secondary !== displayName);

  const testSubjectSuffix = entry.id ?? entry.name;

  return (
    <div css={rowStyles} data-test-subj={`agentBuilderAclRow-${entry.type}-${testSubjectSuffix}`}>
      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          {profile ? (
            <UserAvatar
              css={avatarStyles}
              user={profile.user}
              avatar={profile.data?.avatar}
              size="s"
            />
          ) : (
            <UserAvatar css={avatarStyles} user={{ username: displayName }} size="s" />
          )}
        </EuiFlexItem>

        <EuiFlexItem grow>
          <EuiText size="s">
            <strong>{displayName}</strong>
          </EuiText>
          {showSecondary ? (
            <EuiText size="xs" color="subdued">
              {secondary}
            </EuiText>
          ) : null}
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem
              grow={false}
              css={css`
                min-width: 180px;
              `}
            >
              <EuiSuperSelect<AgentAccessControlRole>
                compressed
                aria-label={accessFlyoutRoleAriaLabel}
                valueOfSelected={entry.role}
                options={roleOptions}
                disabled={isDisabled}
                onChange={(next) => onChangeRole(next)}
                popoverProps={{
                  panelPaddingSize: 's',
                  panelStyle: { minWidth: 280 },
                  anchorPosition: 'downRight',
                }}
                data-test-subj={`agentBuilderAclRoleSelect-${entry.type}-${testSubjectSuffix}`}
              />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiToolTip content={accessFlyoutRemoveAriaLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="trash"
                  color="danger"
                  aria-label={accessFlyoutRemoveAriaLabel}
                  onClick={onRemove}
                  isDisabled={isDisabled}
                  data-test-subj={`agentBuilderAclRemove-${entry.type}-${testSubjectSuffix}`}
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
