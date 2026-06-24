/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiPanel,
  EuiSplitPanel,
  logicalCSS,
  useEuiMaxBreakpoint,
  useEuiMinBreakpoint,
  useEuiTheme,
} from '@elastic/eui';
import moment from 'moment';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderBadge } from '@kbn/app-header';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import type { AppHeaderMetadataItems } from '@kbn/app-header';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import { useDeleteRule } from '../../hooks/use_delete_rule';
import { useComposeDiscoverFlyout } from '../../hooks/use_compose_discover_flyout';
import { DeleteConfirmationModal } from '../rule/modals/delete_confirmation_modal';
import { useToggleRuleEnabled } from '../../hooks/use_toggle_rule_enabled';
import { useBulkGetUserProfiles } from '../../hooks/use_bulk_get_user_profiles';
import { resolveDisplayName } from '../../utils/resolve_display_name';
import { RuleOverviewSection } from './overview';
import { RuleSidebar } from './sidebar/rule_sidebar';
import { useRule } from './rule_context';
import { paths } from '../../constants';
import { APP_HEADER_BACK_LABEL } from '../../lib/app_header';

const METADATA_DATE_FORMAT = 'MMM D, YYYY';

export const RuleDetailPage: React.FunctionComponent = () => {
  const rule = useRule();
  useBreadcrumbs('rule_details', { ruleName: rule.metadata?.name });
  const { euiTheme } = useEuiTheme();
  const docLinks = useService(CoreStart('docLinks'));
  const { mutate: toggleRuleEnabled } = useToggleRuleEnabled();
  const userUids = useMemo(
    () => [rule.createdBy, rule.updatedBy].filter((uid): uid is string => Boolean(uid)),
    [rule.createdBy, rule.updatedBy]
  );
  const { data: userProfileByUid } = useBulkGetUserProfiles({ uids: userUids });

  const smallMediaQuery = useEuiMaxBreakpoint('s');
  const largeMediaQuery = useEuiMinBreakpoint('m');

  const history = useHistory();
  const { mutate: deleteRule, isLoading: isDeleting } = useDeleteRule();
  const { flyout, openEditFlyout, openCloneFlyout } = useComposeDiscoverFlyout();
  const [showDeleteConfirmation, setShowDeleteConfirmation] = React.useState(false);

  const KIND_LABELS: Record<string, string> = {
    signal: i18n.translate('xpack.alertingV2.ruleDetails.kindSignal', { defaultMessage: 'Signal' }),
    alert: i18n.translate('xpack.alertingV2.ruleDetails.kindAlert', { defaultMessage: 'Alert' }),
  };

  const showDeleteConfirmationModal = () => {
    setShowDeleteConfirmation(true);
  };

  const handleRuleDelete = () => {
    setShowDeleteConfirmation(false);
    deleteRule(
      { id: rule.id, name: rule.metadata.name },
      {
        onSuccess: () => {
          history.push('/');
        },
      }
    );
  };

  const badges: AppHeaderBadge[] = [
    {
      label: KIND_LABELS[rule.kind] ?? rule.kind,
      color: 'hollow',
      tooltip: i18n.translate('xpack.alertingV2.ruleDetails.kindBadgeTooltip', {
        defaultMessage: 'Mode can be changed in the rule edit form',
      }),
      'data-test-subj': 'kindBadge',
    },
    rule.enabled
      ? {
          label: i18n.translate('xpack.alertingV2.ruleDetails.enabled', {
            defaultMessage: 'Enabled',
          }),
          color: 'success',
          'data-test-subj': 'enabledBadge',
        }
      : {
          label: i18n.translate('xpack.alertingV2.ruleDetails.disabled', {
            defaultMessage: 'Disabled',
          }),
          color: 'default',
          'data-test-subj': 'disabledBadge',
        },
  ];

  const formatDate = (iso: string) => moment(iso).format(METADATA_DATE_FORMAT);

  const metadata: AppHeaderMetadataItems = [
    {
      // rule.metadata.owner
      //   ? {
      //       type: 'text',
      //       label: i18n.translate('xpack.alertingV2.ruleDetails.apiKeyOwner', {
      //         defaultMessage: 'API key owner {owner}',
      //         values: { owner: rule.metadata.owner },
      //       }),
      //       'data-test-subj': 'ruleDetailsApiKeyOwner',
      //     }
      //   : undefined,
      type: 'text',
      label: i18n.translate('xpack.alertingV2.ruleDetails.createdBy', {
        defaultMessage: 'Created by {user} on {date}',
        values: {
          user: resolveDisplayName(rule.createdBy, userProfileByUid, rule.createdBy ?? '—'),
          date: formatDate(rule.createdAt),
        },
      }),
      'data-test-subj': 'ruleDetailsCreatedBy',
    },
    {
      type: 'text',
      label: i18n.translate('xpack.alertingV2.ruleDetails.lastUpdateBy', {
        defaultMessage: 'Last update by {user} on {date}',
        values: {
          user: resolveDisplayName(rule.updatedBy, userProfileByUid, rule.updatedBy ?? '—'),
          date: formatDate(rule.updatedAt),
        },
      }),
      'data-test-subj': 'ruleDetailsLastUpdateBy',
    },
  ];

  const appMenu: AppMenuConfig = {
    primaryActionItem: {
      id: 'editRule',
      label: i18n.translate('xpack.alertingV2.sections.ruleDetails.editRuleButtonLabel', {
        defaultMessage: 'Edit Rule',
      }),
      iconType: 'pencil',
      testId: 'openEditRuleFlyoutButton',
      run: () => openEditFlyout(rule),
    },
    switch: {
      id: 'toggleEnabled',
      label: i18n.translate('xpack.alertingV2.ruleDetails.enableSwitchLabel', {
        defaultMessage: 'Enabled',
      }),
      labelProps: {},
      checked: rule.enabled,
      onChange: (checked) => toggleRuleEnabled({ id: rule.id, enabled: checked }),
      'data-test-subj': 'ruleDetailsEnableSwitch',
    },
    items: [
      {
        id: 'cloneRule',
        order: 200,
        label: i18n.translate('xpack.alertingV2.ruleDetails.cloneRuleButtonLabel', {
          defaultMessage: 'Clone rule',
        }),
        iconType: 'copy',
        testId: 'ruleDetailsCloneButton',
        run: () => openCloneFlyout(rule),
        overflow: true,
      },
      {
        id: 'deleteRule',
        order: 900,
        label: i18n.translate('xpack.alertingV2.ruleDetails.deleteRuleButtonLabel', {
          defaultMessage: 'Delete rule',
        }),
        iconType: 'trash',
        testId: 'ruleDetailsDeleteButton',
        run: showDeleteConfirmationModal,
        overflow: true,
      },
    ],
  };

  return (
    <KibanaPageTemplate
      paddingSize="none"
      bottomBorder={false}
      data-test-subj="alertingV2RuleDetailsPage"
      minHeight={0}
      grow={false}
      css={css`
        ${largeMediaQuery} {
          block-size: calc(var(--kbn-application--content-height, 100vh) - ${euiTheme.size.l} * 2);
        }
      `}
    >
      <AppHeader
        title={rule.metadata.name}
        back={{ href: paths.ruleList, label: APP_HEADER_BACK_LABEL }}
        badges={badges}
        docLink={docLinks.links.alerting.guide}
        menu={appMenu}
        padding="none"
        metadata={metadata}
      />
      <KibanaPageTemplate.Section
        paddingSize="none"
        grow
        restrictWidth={false}
        css={css`
          min-height: 0;
        `}
        contentProps={{
          css: css`
            flex: 1 1;
            min-height: 0;
          `,
        }}
      >
        <EuiSplitPanel.Outer
          direction="row"
          hasBorder={false}
          hasShadow={false}
          data-test-subj="ruleDetailLayout"
          css={css`
            ${largeMediaQuery} {
              height: 100%;
            }
          `}
        >
          <EuiSplitPanel.Inner grow paddingSize="none" data-test-subj="ruleDetailOverviewColumn">
            <EuiPanel
              hasBorder={false}
              hasShadow={false}
              paddingSize="l"
              css={css`
                ${smallMediaQuery} {
                  ${logicalCSS('padding-horizontal', '0')}
                }
                ${largeMediaQuery} {
                  height: 100%;
                  overflow-y: auto;
                  ${logicalCSS('padding-left', '0')}
                }
              `}
            >
              <RuleOverviewSection />
            </EuiPanel>
          </EuiSplitPanel.Inner>
          <EuiSplitPanel.Inner
            grow={false}
            paddingSize="none"
            data-test-subj="ruleDetailSidebarColumn"
            css={css`
              min-height: 0;
              ${logicalCSS('padding-top', euiTheme.size.l)}

              ${largeMediaQuery} {
                ${logicalCSS('padding-top', '0')}
                flex-shrink: 0;
                flex-basis: 400px;
                min-width: 40px;
                max-width: 500px;
                height: 100%;
                overflow-y: auto;
                padding: ${euiTheme.size.l};
                border-left: ${euiTheme.border.thin};
              }
            `}
          >
            <RuleSidebar />
          </EuiSplitPanel.Inner>
        </EuiSplitPanel.Outer>
      </KibanaPageTemplate.Section>
      {showDeleteConfirmation && (
        <DeleteConfirmationModal
          onConfirm={handleRuleDelete}
          onCancel={() => setShowDeleteConfirmation(false)}
          ruleName={rule.metadata?.name ?? ''}
          isLoading={isDeleting}
        />
      )}
      {flyout}
    </KibanaPageTemplate>
  );
};
