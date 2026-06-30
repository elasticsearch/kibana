/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiStepStatus } from '@elastic/eui';
import { EuiText, EuiSpacer, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiCard } from '@elastic/eui';

import { MANAGEMENT_APP_ID } from '@kbn/deeplinks-management/constants';

import { useStartServices } from '../../hooks';
import type { RegistryPolicyTemplate } from '../../types';

import { NextSteps } from './next_steps';
import type { AgentlessEnrollmentConnector } from './types';

const CONNECTORS_PATH = '/data/content_connectors/connectors';

/**
 * Connector integrations don't ingest data until the connector is configured,
 * so there is nothing to poll for. This step simply points the user to the
 * connector configuration and is considered complete as soon as it renders.
 */
export const AgentlessStepConfigureConnector = ({
  connectors,
  policyName,
  setStepStatus,
  policyTemplates,
  onClose,
}: {
  connectors?: AgentlessEnrollmentConnector[];
  policyName: string;
  setStepStatus: (status: EuiStepStatus) => void;
  policyTemplates?: RegistryPolicyTemplate[];
  onClose: () => void;
}) => {
  const { application } = useStartServices();

  useEffect(() => {
    setStepStatus('complete');
  }, [setStepStatus]);

  const navigateToConnector = (connectorId?: string) => {
    onClose();
    application.navigateToApp(MANAGEMENT_APP_ID, {
      path: connectorId ? `${CONNECTORS_PATH}/${connectorId}` : CONNECTORS_PATH,
    });
  };

  const cardDescription = i18n.translate(
    'xpack.fleet.agentlessEnrollmentFlyout.configureConnector.cardDescription',
    { defaultMessage: 'Configure connector' }
  );

  // A connector may already be associated with the policy. When it is, deep-link
  // to that connector; otherwise fall back to the connectors list so the user can
  // still reach the configuration screen.
  const connectorCards =
    connectors && connectors.length > 0 ? (
      connectors.map((connector, index) => {
        const connectorKey = connector.id ?? index;
        return (
          <EuiFlexItem key={connectorKey}>
            <EuiCard
              data-test-subj={`agentlessStepConfigureConnector.connectorCard.${connectorKey}`}
              title={`${connector.name ?? policyName}`}
              description={cardDescription}
              onClick={() => navigateToConnector(connector.id)}
            />
          </EuiFlexItem>
        );
      })
    ) : (
      <EuiFlexItem>
        <EuiCard
          data-test-subj="agentlessStepConfigureConnector.connectorCard"
          title={policyName}
          description={cardDescription}
          onClick={() => navigateToConnector()}
        />
      </EuiFlexItem>
    );

  return (
    <>
      <EuiCallOut
        announceOnMount
        color="primary"
        iconType="rocket"
        title={i18n.translate(
          'xpack.fleet.agentlessEnrollmentFlyout.configureConnector.calloutTitle',
          {
            defaultMessage: 'Configure your connector to start syncing data',
          }
        )}
      />
      <EuiSpacer size="m" />
      <EuiText>
        <p>
          <FormattedMessage
            id="xpack.fleet.agentlessEnrollmentFlyout.configureConnector.helperDescription"
            defaultMessage="Your connector has been deployed. Finish setting it up to start syncing data into Elasticsearch."
          />
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="center" direction="row" wrap={true}>
        {connectorCards}
      </EuiFlexGroup>
      <NextSteps policyTemplates={policyTemplates} />
    </>
  );
};
