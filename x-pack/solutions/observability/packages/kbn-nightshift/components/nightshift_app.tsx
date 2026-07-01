/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiMarkdownFormat,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import { ConnectorIconsMap } from '@kbn/connector-specs/icons';
import { i18n } from '@kbn/i18n';
import { FormattedMessage, FormattedRelative } from '@kbn/i18n-react';
import { NightshiftIllustration } from './nightshift_illustration';

export interface GapsReport {
  title: string;
  content: string;
  updated_at: string;
}

interface CommonConnectorType {
  id: string;
  actionTypeIds: readonly string[];
  iconActionTypeId: string;
  name: string;
}

export interface NightshiftAppProps {
  onStartOnboarding?: () => void;
  onStartGapClosing?: (connectorName?: string) => void;
  agentBuilderAvailable?: boolean;
  gapsReport?: GapsReport | null;
  installedConnectorActionTypeIds?: string[];
}

const COMMON_OBSERVABILITY_CONNECTORS: CommonConnectorType[] = [
  {
    id: 'slack',
    actionTypeIds: ['.slack', '.slack_api', '.slack2'],
    iconActionTypeId: '.slack2',
    name: i18n.translate('xpack.nightshift.commonConnectors.slackName', {
      defaultMessage: 'Slack',
    }),
  },
  {
    id: 'microsoftTeams',
    actionTypeIds: ['.teams', '.microsoft-teams'],
    iconActionTypeId: '.microsoft-teams',
    name: i18n.translate('xpack.nightshift.commonConnectors.microsoftTeamsName', {
      defaultMessage: 'Microsoft Teams',
    }),
  },
  {
    id: 'pagerDuty',
    actionTypeIds: ['.pagerduty', '.pagerduty_mcp'],
    iconActionTypeId: '.pagerduty_mcp',
    name: i18n.translate('xpack.nightshift.commonConnectors.pagerDutyName', {
      defaultMessage: 'PagerDuty',
    }),
  },
  {
    id: 'jira',
    actionTypeIds: ['.jira', '.jira-cloud'],
    iconActionTypeId: '.jira-cloud',
    name: i18n.translate('xpack.nightshift.commonConnectors.jiraName', {
      defaultMessage: 'Jira',
    }),
  },
  {
    id: 'serviceNow',
    actionTypeIds: ['.servicenow', '.servicenow-sir', '.servicenow-itom', '.servicenow_search'],
    iconActionTypeId: '.servicenow_search',
    name: i18n.translate('xpack.nightshift.commonConnectors.serviceNowName', {
      defaultMessage: 'ServiceNow',
    }),
  },
  {
    id: 'github',
    actionTypeIds: ['.github'],
    iconActionTypeId: '.github',
    name: i18n.translate('xpack.nightshift.commonConnectors.githubName', {
      defaultMessage: 'GitHub',
    }),
  },
];

const onboardingButtonLabel = i18n.translate('xpack.nightshift.startOnboardingButton', {
  defaultMessage: 'Tell us about your system',
});

const viewGapsButtonLabel = i18n.translate('xpack.nightshift.viewGapsButtonLabel', {
  defaultMessage: 'Review gaps',
});

const closeGapsButtonLabel = i18n.translate('xpack.nightshift.closeGapsButtonLabel', {
  defaultMessage: 'Close gaps',
});

const closeButtonLabel = i18n.translate('xpack.nightshift.closeFlyoutButtonLabel', {
  defaultMessage: 'Close',
});

const gapsPanelTitle = i18n.translate('xpack.nightshift.gapsPanelTitle', {
  defaultMessage: 'Gaps',
});

const missingGapsReportDescription = i18n.translate(
  'xpack.nightshift.missingGapsReportDescription',
  {
    defaultMessage: 'No knowledge gaps report is available yet.',
  }
);

const commonConnectorsLabel = i18n.translate('xpack.nightshift.commonConnectorsLabel', {
  defaultMessage: 'Common connectors to add',
});

const getConnectorIconType = (connectorType: CommonConnectorType): IconType =>
  ConnectorIconsMap.get(connectorType.iconActionTypeId) ?? 'plugs';

const getConnectorButtonLabel = (connectorName: string) =>
  i18n.translate('xpack.nightshift.commonConnectorButtonLabel', {
    defaultMessage: 'Close gaps starting with {connectorName}',
    values: { connectorName },
  });

export function NightshiftApp({
  onStartOnboarding,
  onStartGapClosing,
  agentBuilderAvailable,
  gapsReport,
  installedConnectorActionTypeIds = [],
}: NightshiftAppProps) {
  const [isGapsFlyoutOpen, setIsGapsFlyoutOpen] = useState(false);
  const flyoutTitleId = useGeneratedHtmlId();
  const installedConnectorIds = useMemo(
    () => new Set(installedConnectorActionTypeIds),
    [installedConnectorActionTypeIds]
  );
  const missingConnectorTypes = useMemo(
    () =>
      COMMON_OBSERVABILITY_CONNECTORS.filter(
        (connectorType) =>
          !connectorType.actionTypeIds.some((actionTypeId) =>
            installedConnectorIds.has(actionTypeId)
          )
      ),
    [installedConnectorIds]
  );

  const canStartOnboarding = Boolean(agentBuilderAvailable && onStartOnboarding);
  const canCloseGaps = Boolean(agentBuilderAvailable && onStartGapClosing);

  const onboardingButton = (
    <EuiButton
      fill
      iconType="sparkles"
      disabled={!canStartOnboarding}
      onClick={() => onStartOnboarding?.()}
      data-test-subj="nightshiftStartOnboardingButton"
    >
      {onboardingButtonLabel}
    </EuiButton>
  );

  const renderConnectorButton = (connectorType: CommonConnectorType, iconType: IconType) => {
    const connectorButtonLabel = getConnectorButtonLabel(connectorType.name);

    return (
      <EuiToolTip content={connectorButtonLabel} disableScreenReaderOutput>
        <EuiButtonIcon
          iconType={iconType}
          aria-label={connectorButtonLabel}
          color="text"
          display="base"
          disabled={!canCloseGaps}
          onClick={() => onStartGapClosing?.(connectorType.name)}
          data-test-subj={`nightshiftConnectorGapClosingButton-${connectorType.id}`}
        />
      </EuiToolTip>
    );
  };

  return (
    <>
      <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
        <EuiFlexItem grow={false}>{onboardingButton}</EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />

      <EuiFlexGroup justifyContent="center" style={{ padding: '8px 0 24px' }}>
        <EuiFlexItem style={{ maxWidth: 840 }}>
          <EuiEmptyPrompt
            data-test-subj="nightshiftEmptyState"
            icon={<NightshiftIllustration />}
            title={
              <h2>
                {i18n.translate('xpack.nightshift.emptyState.title', {
                  defaultMessage: 'Nightshift',
                })}
              </h2>
            }
            body={
              <EuiText color="subdued" size="s">
                <p>
                  {gapsReport
                    ? i18n.translate('xpack.nightshift.emptyState.gapsDescription', {
                        defaultMessage:
                          'Review the latest knowledge gaps or continue in chat to add missing operational context.',
                      })
                    : i18n.translate('xpack.nightshift.emptyState.description', {
                        defaultMessage:
                          'Help Nightshift understand your system to detect and surface the right significant events for you.',
                      })}
                </p>
              </EuiText>
            }
          />

          <EuiSpacer size="l" />
          <EuiPanel paddingSize="m" hasBorder data-test-subj="nightshiftGapsPanel">
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="m" wrap>
              <EuiFlexItem>
                <EuiTitle size="xs">
                  <h3>{gapsPanelTitle}</h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <EuiText size="s" color="subdued">
                  <p>
                    {gapsReport ? (
                      <FormattedMessage
                        id="xpack.nightshift.gapsPanelDescription"
                        defaultMessage="We found these gaps when analyzing existing knowledge. Updated {updatedAt}."
                        values={{
                          updatedAt: <FormattedRelative value={gapsReport.updated_at} />,
                        }}
                      />
                    ) : (
                      missingGapsReportDescription
                    )}
                  </p>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  iconType="inspect"
                  disabled={!gapsReport}
                  onClick={() => setIsGapsFlyoutOpen(true)}
                  data-test-subj="nightshiftViewGapsButton"
                >
                  {viewGapsButtonLabel}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>

            {missingConnectorTypes.length > 0 && (
              <>
                <EuiSpacer size="m" />
                <EuiFlexGroup
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                  data-test-subj="nightshiftMissingConnectors"
                >
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      <span>{commonConnectorsLabel}</span>
                    </EuiText>
                  </EuiFlexItem>
                  {missingConnectorTypes.map((connectorType) => (
                    <EuiFlexItem
                      key={connectorType.id}
                      grow={false}
                      data-test-subj="nightshiftMissingConnectorType"
                    >
                      <Suspense fallback={renderConnectorButton(connectorType, 'plugs')}>
                        {renderConnectorButton(connectorType, getConnectorIconType(connectorType))}
                      </Suspense>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              </>
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isGapsFlyoutOpen && gapsReport && (
        <EuiFlyout
          onClose={() => setIsGapsFlyoutOpen(false)}
          aria-labelledby={flyoutTitleId}
          maxWidth={720}
          data-test-subj="nightshiftGapsFlyout"
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id={flyoutTitleId}>{gapsReport.title}</h2>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              <p>
                <FormattedMessage
                  id="xpack.nightshift.gapsFlyoutUpdatedLabel"
                  defaultMessage="Updated {updatedAt}"
                  values={{
                    updatedAt: <FormattedRelative value={gapsReport.updated_at} />,
                  }}
                />
              </p>
            </EuiText>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiMarkdownFormat textSize="s" data-test-subj="nightshiftGapsMarkdown">
              {gapsReport.content}
            </EuiMarkdownFormat>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  data-test-subj="kbnNightshiftNightshiftAppButton"
                  flush="left"
                  onClick={() => setIsGapsFlyoutOpen(false)}
                >
                  {closeButtonLabel}
                </EuiButtonEmpty>
              </EuiFlexItem>
              {agentBuilderAvailable && onStartGapClosing && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    iconType="sparkles"
                    onClick={() => {
                      setIsGapsFlyoutOpen(false);
                      onStartGapClosing();
                    }}
                    data-test-subj="nightshiftFlyoutCloseGapsButton"
                  >
                    {closeGapsButtonLabel}
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}
    </>
  );
}
