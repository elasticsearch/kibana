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
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
  type EuiThemeComputed,
} from '@elastic/eui';
import {
  type AgentAccessControlEntry,
  AgentAccessControlRole,
  type AgentDefinition,
} from '@kbn/agent-builder-common';
import { selectableRolesForAccessControlMode } from './role_to_capabilities';
import { PrincipalRow } from './principal_row';
import { UserPicker } from './user_picker';
import {
  accessFlyoutNoPeople,
  accessFlyoutPeopleHelp,
  accessFlyoutPeopleSection,
} from './access_i18n';

interface AccessFormProps {
  agent: Pick<AgentDefinition, 'access_control'>;
  entries: AgentAccessControlEntry[];
  ownerName?: string;
  isDisabled?: boolean;
  onChange: (entries: AgentAccessControlEntry[]) => void;
}

const sectionStyles = (euiTheme: EuiThemeComputed) => css`
  padding-top: ${euiTheme.size.l};
`;

const sectionHeaderStyles = (euiTheme: EuiThemeComputed) => css`
  margin-bottom: ${euiTheme.size.s};
`;

const emptyStateStyles = (euiTheme: EuiThemeComputed) => css`
  margin-top: ${euiTheme.size.m};
  padding: ${euiTheme.size.m} 0;
`;

const ownerRowStyles = (euiTheme: EuiThemeComputed) => css`
  min-height: ${euiTheme.size.xxxl};
  display: flex;
  align-items: center;
  padding-block: 0;
  padding-inline: ${euiTheme.size.s};
`;

interface SectionProps {
  title: string;
  helpText: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, helpText, children }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <div css={sectionStyles(euiTheme)}>
      <div css={sectionHeaderStyles(euiTheme)}>
        <EuiTitle size="xxs">
          <h3>{title}</h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {helpText}
        </EuiText>
      </div>
      {children}
    </div>
  );
};

export const AccessForm: React.FC<AccessFormProps> = ({
  agent,
  entries,
  ownerName,
  isDisabled,
  onChange,
}) => {
  const { euiTheme } = useEuiTheme();
  const accessControlMode = agent.access_control?.access_mode;

  const defaultRole = useMemo(() => {
    const allowed = selectableRolesForAccessControlMode(accessControlMode);
    return allowed.includes(AgentAccessControlRole.User) ? AgentAccessControlRole.User : allowed[0];
  }, [accessControlMode]);

  const handleAdd = (entry: AgentAccessControlEntry) => {
    onChange([...entries, entry]);
  };

  const handleChangeRole = (target: AgentAccessControlEntry, role: AgentAccessControlRole) => {
    onChange(
      entries.map((e) => (e.type === target.type && e.name === target.name ? { ...e, role } : e))
    );
  };

  const handleRemove = (target: AgentAccessControlEntry) => {
    onChange(entries.filter((e) => !(e.type === target.type && e.name === target.name)));
  };

  return (
    <Section title={accessFlyoutPeopleSection} helpText={accessFlyoutPeopleHelp}>
      <UserPicker
        excludedUsernames={entries.map((u) => u.name)}
        isDisabled={isDisabled}
        onAdd={(username) => handleAdd({ type: 'user', name: username, role: defaultRole })}
      />
      {entries.length === 0 ? (
        <EuiText size="xs" color="subdued" css={emptyStateStyles(euiTheme)}>
          {accessFlyoutNoPeople}
        </EuiText>
      ) : (
        <>
          <EuiSpacer size="s" />
          <EuiPanel paddingSize="s" hasBorder={false} hasShadow={false} color="subdued">
            <EuiPanel paddingSize="none" hasBorder={true} hasShadow={false}>
              {ownerName && (
                <div css={ownerRowStyles(euiTheme)}>
                  <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiAvatar size="s" name={ownerName} />
                    </EuiFlexItem>
                    <EuiFlexItem grow>
                      <EuiText size="s">
                        <strong>{ownerName}</strong>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge>Owner</EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </div>
              )}
              {entries.map((entry) => (
                <PrincipalRow
                  key={`user:${entry.name}`}
                  entry={entry}
                  accessControlMode={accessControlMode}
                  isDisabled={isDisabled}
                  onChangeRole={(role) => handleChangeRole(entry, role)}
                  onRemove={() => handleRemove(entry)}
                />
              ))}
            </EuiPanel>
          </EuiPanel>
        </>
      )}
    </Section>
  );
};
