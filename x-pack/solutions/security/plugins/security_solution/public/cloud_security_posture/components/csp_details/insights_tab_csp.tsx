/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { EuiButtonGroupOptionProps } from '@elastic/eui';
import { EuiButtonGroup, EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { FlyoutPanelProps, PanelPath } from '@kbn/expandable-flyout';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { i18n } from '@kbn/i18n';
import { TableId } from '@kbn/securitysolution-data-table';
import type {
  FindingsMisconfigurationPanelExpandableFlyoutPropsPreview,
  FindingsVulnerabilityPanelExpandableFlyoutPropsPreview,
} from '@kbn/cloud-security-posture';
import { useStableExpandableFlyoutState } from '../../../flyout/shared/hooks/use_stable_expandable_flyout_state';
import { CspInsightLeftPanelSubTab } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { DocumentDetailsPreviewPanelKey } from '../../../flyout/document_details/shared/constants/panel_keys';
import { ALERT_PREVIEW_BANNER } from '../../../flyout/document_details/preview/constants';
import { MisconfigurationFindingsPreviewPanelKey } from '../../../flyout/csp_details/findings_flyout/constants';
import { VulnerabilityFindingsPreviewPanelKey } from '../../../flyout/csp_details/vulnerabilities_flyout/constants';
import { MisconfigurationFindingsDetailsTable } from './misconfiguration_findings_details_table';
import { VulnerabilitiesFindingsDetailsTable } from './vulnerabilities_findings_details_table';
import { AlertsDetailsTable } from './alerts_findings_details_table';
import type { CloudPostureEntityIdentifier } from '../entity_insight';

/**
 * Insights view displayed in the document details expandable flyout left section
 */

interface CspFlyoutPanelProps extends FlyoutPanelProps {
  params: {
    path: PanelPath;
    hasMisconfigurationFindings: boolean;
    hasVulnerabilitiesFindings: boolean;
    hasNonClosedAlerts: boolean;
  };
}

// Type guard to check if the panel is a CspFlyoutPanelProps
function isCspFlyoutPanelProps(
  panelLeft: FlyoutPanelProps | undefined
): panelLeft is CspFlyoutPanelProps {
  return (
    !!panelLeft?.params?.hasMisconfigurationFindings ||
    !!panelLeft?.params?.hasVulnerabilitiesFindings ||
    !!panelLeft?.params?.hasNonClosedAlerts
  );
}

export const InsightsTabCsp = memo(
  ({
    value,
    field,
    scopeId,
    entityId,
    entityType,
  }: {
    value: string;
    field: CloudPostureEntityIdentifier;
    scopeId: string;
    entityId?: string;
    entityType?: string;
  }) => {
    const panels = useStableExpandableFlyoutState();
    const { openPreviewPanel } = useExpandableFlyoutApi();

    const onShowAlert = useCallback(
      (eventId: string, indexName: string) => {
        openPreviewPanel({
          id: DocumentDetailsPreviewPanelKey,
          params: {
            id: eventId,
            indexName,
            scopeId: TableId.alertsOnRuleDetailsPage,
            isPreviewMode: true,
            banner: ALERT_PREVIEW_BANNER,
          },
        });
      },
      [openPreviewPanel]
    );

    const onShowFinding = useCallback(
      (resourceId: string, ruleId: string) => {
        const previewPanelProps: FindingsMisconfigurationPanelExpandableFlyoutPropsPreview = {
          id: MisconfigurationFindingsPreviewPanelKey,
          params: {
            resourceId,
            ruleId,
            scopeId,
            isPreviewMode: true,
            banner: {
              title: i18n.translate(
                'xpack.securitySolution.flyout.right.misconfigurationFinding.PreviewTitle',
                {
                  defaultMessage: 'Preview finding details',
                }
              ),
              backgroundColor: 'warning',
              textColor: 'warning',
            },
          },
        };
        openPreviewPanel(previewPanelProps);
      },
      [openPreviewPanel, scopeId]
    );

    const onShowVulnerability = useCallback(
      (params: {
        vulnerabilityId: string;
        resourceId: string;
        packageName: string;
        packageVersion: string;
        eventId: string;
      }) => {
        const previewPanelProps: FindingsVulnerabilityPanelExpandableFlyoutPropsPreview = {
          id: VulnerabilityFindingsPreviewPanelKey,
          params: {
            ...params,
            scopeId,
            isPreviewMode: true,
            banner: {
              title: i18n.translate(
                'xpack.securitySolution.flyout.right.vulnerabilityFinding.PreviewTitle',
                {
                  defaultMessage: 'Preview vulnerability details',
                }
              ),
              backgroundColor: 'warning',
              textColor: 'warning',
            },
          },
        };
        openPreviewPanel(previewPanelProps);
      },
      [openPreviewPanel, scopeId]
    );

    let hasMisconfigurationFindings = false;
    let hasVulnerabilitiesFindings = false;
    let hasNonClosedAlerts = false;
    let subTab: string | undefined;

    // Check if panels.left is of type CspFlyoutPanelProps and extract values
    if (isCspFlyoutPanelProps(panels.left)) {
      hasMisconfigurationFindings = panels.left.params.hasMisconfigurationFindings;
      hasVulnerabilitiesFindings = panels.left.params.hasVulnerabilitiesFindings;
      hasNonClosedAlerts = panels.left.params.hasNonClosedAlerts;
      subTab = panels.left.params.path?.subTab;
    }

    const getDefaultTab = () => {
      if (subTab) {
        return subTab;
      }

      return hasMisconfigurationFindings
        ? CspInsightLeftPanelSubTab.MISCONFIGURATIONS
        : hasVulnerabilitiesFindings
        ? CspInsightLeftPanelSubTab.VULNERABILITIES
        : hasNonClosedAlerts
        ? CspInsightLeftPanelSubTab.ALERTS
        : '';
    };

    const [activeInsightsId, setActiveInsightsId] = useState(getDefaultTab());
    useEffect(() => {
      if (subTab) {
        setActiveInsightsId(subTab);
      }
    }, [subTab]);

    const insightsButtons: EuiButtonGroupOptionProps[] = useMemo(() => {
      const buttons: EuiButtonGroupOptionProps[] = [];

      if (panels.left?.params?.hasNonClosedAlerts) {
        buttons.push({
          id: CspInsightLeftPanelSubTab.ALERTS,
          label: (
            <FormattedMessage
              id="xpack.securitySolution.flyout.left.insights.alertsButtonLabel"
              defaultMessage="Alerts"
            />
          ),
          'data-test-subj': 'alertsTabDataTestId',
        });
      }

      if (panels.left?.params?.hasMisconfigurationFindings) {
        buttons.push({
          id: CspInsightLeftPanelSubTab.MISCONFIGURATIONS,
          label: (
            <FormattedMessage
              id="xpack.securitySolution.flyout.left.insights.misconfigurationButtonLabel"
              defaultMessage="Misconfiguration"
            />
          ),
          'data-test-subj': 'misconfigurationTabDataTestId',
        });
      }

      if (panels.left?.params?.hasVulnerabilitiesFindings) {
        buttons.push({
          id: CspInsightLeftPanelSubTab.VULNERABILITIES,
          label: (
            <FormattedMessage
              id="xpack.securitySolution.flyout.left.insights.vulnerabilitiesButtonLabel"
              defaultMessage="Vulnerabilities"
            />
          ),
          'data-test-subj': 'vulnerabilitiesTabDataTestId',
        });
      }

      return buttons;
    }, [
      panels.left?.params?.hasMisconfigurationFindings,
      panels.left?.params?.hasNonClosedAlerts,
      panels.left?.params?.hasVulnerabilitiesFindings,
    ]);

    const isSingleOption = insightsButtons.length === 1;

    const onTabChange = (id: string) => {
      if (!isSingleOption) {
        setActiveInsightsId(id);
      }
    };

    if (insightsButtons.length === 0) {
      return null;
    }

    return (
      <>
        <EuiButtonGroup
          color="primary"
          legend={i18n.translate(
            'xpack.securitySolution.flyout.left.insights.optionsButtonGroups',
            {
              defaultMessage: 'Insights options',
            }
          )}
          options={insightsButtons}
          idSelected={activeInsightsId}
          onChange={onTabChange}
          buttonSize="compressed"
          isFullWidth
          isDisabled={isSingleOption}
          data-test-subj={'insightButtonGroupsTestId'}
        />
        <EuiSpacer size="xl" />
        {activeInsightsId === CspInsightLeftPanelSubTab.MISCONFIGURATIONS ? (
          <MisconfigurationFindingsDetailsTable
            field={field}
            value={value}
            entityId={entityId}
            entityType={entityType}
            onShowFinding={onShowFinding}
          />
        ) : activeInsightsId === CspInsightLeftPanelSubTab.VULNERABILITIES ? (
          <VulnerabilitiesFindingsDetailsTable
            identityField={field}
            value={value}
            entityId={entityId}
            entityType={entityType}
            onShowVulnerability={onShowVulnerability}
          />
        ) : (
          <AlertsDetailsTable
            field={field}
            value={value}
            entityId={entityId}
            onShowAlert={onShowAlert}
          />
        )}
      </>
    );
  }
);

InsightsTabCsp.displayName = 'InsightsTab';
