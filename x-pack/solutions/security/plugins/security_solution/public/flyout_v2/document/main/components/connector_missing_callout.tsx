/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { EuiCallOut, EuiLink } from '@elastic/eui';
import { useNavigateTo } from '@kbn/security-solution-navigation';
import { i18n } from '@kbn/i18n';

const MISSING_CONNECTOR = i18n.translate('xpack.securitySolution.alertSummary.missingConnector', {
  defaultMessage: 'Missing connector',
});
const CONNECTOR_MISSING_MESSAGE = i18n.translate(
  'xpack.securitySolution.alertSummary.noConnectorMessage',
  {
    defaultMessage: 'Your default model is invalid and may have been deleted.',
  }
);
const CONNECTOR_MISSING_MESSAGE_ADMIN = i18n.translate(
  'xpack.securitySolution.alertSummary.noConnectorMessageForAdmin',
  {
    defaultMessage:
      'Your default model is invalid and may have been deleted. You may update the default model via',
  }
);
const ADVANCED_SETTINGS_LINK_TITLE = i18n.translate(
  'xpack.securitySolution.alertSummary.advancedSettingsLinkTitle',
  {
    defaultMessage: 'Security Solution advanced settings',
  }
);

export const MISSING_CONNECTOR_CALLOUT_TEST_ID =
  'document-flyout-ai-summary-missing-connector-callout';
export const MISSING_CONNECTOR_CALLOUT_LINK_TEST_ID =
  'document-flyout-ai-summary-missing-connector-callout-link';

export interface ConnectorMissingCalloutProps {
  /**
   * Value of useKibana.services.application.capabilities.management.kibana.settings
   */
  canSeeAdvancedSettings: boolean;
}

/**
 * Callout displayed in the AI summary section of the alert flyouts when no
 * default AI connector is configured. When the current user can manage
 * advanced settings, the callout offers a link to the Security Solution
 * advanced settings page so the connector can be (re)configured.
 */
export const ConnectorMissingCallout = memo(
  ({ canSeeAdvancedSettings }: ConnectorMissingCalloutProps) => {
    const { navigateTo } = useNavigateTo();
    const goToKibanaSettings = useCallback(
      () =>
        navigateTo({
          appId: 'management',
          path: '/modelManagement/model_settings',
        }),
      [navigateTo]
    );

    return (
      <EuiCallOut
        color="danger"
        data-test-subj={MISSING_CONNECTOR_CALLOUT_TEST_ID}
        iconType="error"
        title={MISSING_CONNECTOR}
      >
        <p>
          {canSeeAdvancedSettings ? CONNECTOR_MISSING_MESSAGE_ADMIN : CONNECTOR_MISSING_MESSAGE}
          {canSeeAdvancedSettings && (
            <>
              {' '}
              <EuiLink
                data-test-subj={MISSING_CONNECTOR_CALLOUT_LINK_TEST_ID}
                onClick={goToKibanaSettings}
              >
                {ADVANCED_SETTINGS_LINK_TITLE}
              </EuiLink>
              {'.'}
            </>
          )}
        </p>
      </EuiCallOut>
    );
  }
);

ConnectorMissingCallout.displayName = 'ConnectorMissingCallout';
