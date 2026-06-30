/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiCallOut, EuiLink, useIsWithinMinBreakpoint } from '@elastic/eui';

import type { AppHeaderBadge } from '@kbn/app-header';
import { AppHeader, type AppHeaderTab } from '@kbn/app-header';

import { i18n } from '@kbn/i18n';

import { WithoutHeaderLayout } from '../../../../layouts';

import { useDismissableTour } from '../../../../hooks/use_dismissable_tour';
import type { Section } from '../../sections';
import { useLink, useAuthz, useConfig, useStartServices } from '../../hooks';
import { TourManagerProvider } from '../../../../hooks/use_tour_manager';

import { AutoUpgradeAgentsTour } from '../../sections/agent_policy/components/auto_upgrade_agents_tour';
import { useCanEnableAutomaticAgentUpgrades } from '../../../../hooks/use_can_enable_auto_upgrades';

export const FLEET_TAB_IDS = {
  agents: 'fleet-agents-tab',
  agentPolicies: 'fleet-agent-policies-tab',
  enrollmentTokens: 'fleet-enrollment-tokens-tab',
  uninstallTokens: 'fleet-uninstall-tokens-tab',
  dataStreams: 'fleet-datastreams-tab',
  settings: 'fleet-settings-tab',
} as const;

interface Props {
  section?: Section;
  children?: React.ReactNode;
  rightColumn?: JSX.Element;
}

export const DefaultLayout: React.FunctionComponent<Props> = ({
  section,
  children,
  rightColumn,
}) => {
  const { getHref } = useLink();
  const { agents } = useConfig();
  const authz = useAuthz();
  const { docLinks } = useStartServices();
  const granularPrivilegesCallout = useDismissableTour('GRANULAR_PRIVILEGES');
  const canEnableAutomaticAgentUpgrades = useCanEnableAutomaticAgentUpgrades();

  const isBiggerScreen = useIsWithinMinBreakpoint('xxl');
  const contentWidth = section === 'settings' && isBiggerScreen ? '80%' : '100%';

  const isReadOnly =
    (section === 'agents' && !authz.fleet.allAgents) ||
    (section === 'agent_policies' && !authz.fleet.allAgentPolicies) ||
    (section === 'settings' && !authz.fleet.allSettings);

  const tabs: AppHeaderTab[] = (
    [
      {
        id: FLEET_TAB_IDS.agents,
        label: i18n.translate('xpack.fleet.appNavigation.agentsLinkText', {
          defaultMessage: 'Agents',
        }),
        isSelected: section === 'agents',
        href: getHref('agent_list'),
        disabled: !agents?.enabled,
        isVisible: authz.fleet.readAgents,
      },
      {
        id: FLEET_TAB_IDS.agentPolicies,
        label: i18n.translate('xpack.fleet.appNavigation.policiesLinkText', {
          defaultMessage: 'Agent policies',
        }),
        isSelected: section === 'agent_policies',
        href: getHref('policies_list'),
        isVisible: authz.fleet.readAgentPolicies,
      },
      {
        id: FLEET_TAB_IDS.enrollmentTokens,
        label: i18n.translate('xpack.fleet.appNavigation.enrollmentTokensText', {
          defaultMessage: 'Enrollment tokens',
        }),
        isSelected: section === 'enrollment_tokens',
        href: getHref('enrollment_tokens'),
        isVisible: authz.fleet.allAgents,
      },
      {
        id: FLEET_TAB_IDS.uninstallTokens,
        label: i18n.translate('xpack.fleet.appNavigation.uninstallTokensText', {
          defaultMessage: 'Uninstall tokens',
        }),
        isSelected: section === 'uninstall_tokens',
        href: getHref('uninstall_tokens'),
        isVisible: authz.fleet.allAgents,
      },
      {
        id: FLEET_TAB_IDS.dataStreams,
        label: i18n.translate('xpack.fleet.appNavigation.dataStreamsLinkText', {
          defaultMessage: 'Data streams',
        }),
        isSelected: section === 'data_streams',
        href: getHref('data_streams'),
        isVisible: true,
      },
      {
        id: FLEET_TAB_IDS.settings,
        label: i18n.translate('xpack.fleet.appNavigation.settingsLinkText', {
          defaultMessage: 'Settings',
        }),
        isSelected: section === 'settings',
        href: getHref('settings'),
        isVisible: authz.fleet.readSettings,
      },
    ] satisfies Array<Omit<AppHeaderTab, 'data-test-subj'> & { isVisible: boolean }>
  )
    .filter((tab) => tab.isVisible)
    .map(({ isVisible, ...tab }) => ({ ...tab, 'data-test-subj': tab.id }));

  const badges: AppHeaderBadge[] = [];
  if (isReadOnly) {
    badges.push({
      label: i18n.translate('xpack.fleet.appNavigation.readOnlyBadge', {
        defaultMessage: 'Read-only',
      }),
      tooltip: i18n.translate('xpack.fleet.appNavigation.readOnlyTooltip', {
        defaultMessage:
          "You can view most Fleet settings, but your current privileges don't allow you to perform all actions.",
      }),
      color: 'hollow',
    });
  }

  return (
    <TourManagerProvider>
      {!authz.fleet.all || granularPrivilegesCallout.isHidden ? null : (
        <EuiCallOut
          announceOnMount
          size="s"
          iconType="popper"
          onDismiss={granularPrivilegesCallout.dismiss}
          title={
            <>
              <FormattedMessage
                id="xpack.fleet.granularPrivileges.callOutContent"
                defaultMessage="We've added new privileges that let you define more granularly who can view or edit Fleet agents, policies, and settings. {learnMoreLink}"
                values={{
                  learnMoreLink: (
                    <EuiLink href={docLinks.links.fleet.roleAndPrivileges} external target="_blank">
                      <strong>
                        <FormattedMessage
                          id="xpack.fleet.granularPrivileges.learnMoreLinkText"
                          defaultMessage="Learn more."
                        />
                      </strong>
                    </EuiLink>
                  ),
                }}
              />
            </>
          }
        />
      )}
      <WithoutHeaderLayout
        restrictWidth={contentWidth}
        header={
          <AppHeader
            title={i18n.translate('xpack.fleet.overviewPageTitle', { defaultMessage: 'Fleet' })}
            tabs={tabs}
            docLink={docLinks.links.fleet.guide}
            badges={badges}
          />
        }
      >
        {rightColumn}
        {children}
      </WithoutHeaderLayout>
      {canEnableAutomaticAgentUpgrades ? (
        <AutoUpgradeAgentsTour anchor={`[data-test-subj='${FLEET_TAB_IDS.agentPolicies}']`} />
      ) : null}
    </TourManagerProvider>
  );
};
