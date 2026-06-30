/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EuiStepStatus } from '@elastic/eui';
import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiFlyoutFooter,
  EuiSteps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { AGENTS_PREFIX, FLEET_CONNECTORS_PACKAGE, MAX_FLYOUT_WIDTH } from '../../constants';
import type { Agent } from '../../types';
import { sendGetAgents, useStartServices, useGetPackageInfoByKeyQuery } from '../../hooks';

import { AgentlessStepConfirmEnrollment } from './step_confirm_enrollment';
import { AgentlessStepConfirmData } from './step_confirm_data';
import { AgentlessStepConfigureConnector } from './step_configure_connector';
import type { AgentlessEnrollmentFlyoutProps } from './types';
import { resolveIntegrationTitle } from './utils';

// re-export the flyout contract types so external consumers can import them from this module
export type {
  AgentlessEnrollmentConnector,
  AgentlessEnrollmentSelectedInput,
  AgentlessEnrollmentFlyoutProps,
} from './types';

const REFRESH_INTERVAL_MS = 30000;

/**
 * This component displays additional status details of an agentless agent enrolled
 * into the chosen agentless policy (and its agent policy).
 * It also displays confirmation that the agentless agent is ingesting data.
 */
export const AgentlessEnrollmentFlyout = ({
  onClose,
  policyId,
  policyName,
  packageInfo,
  selectedInput,
  agentPolicy,
  connectors,
}: AgentlessEnrollmentFlyoutProps) => {
  const core = useStartServices();
  const { notifications } = core;
  const [confirmEnrollmentStatus, setConfirmEnrollmentStatus] = useState<EuiStepStatus>('loading');
  const [confirmDataStatus, setConfirmDataStatus] = useState<EuiStepStatus>('disabled');
  const [agentData, setAgentData] = useState<Agent>();

  // Clear agent data polling
  // Called when component is unmounted or when agent is healthy
  const agentDataInterval = useRef<NodeJS.Timeout>();
  const clearAgentDataPolling = useMemo(() => {
    return () => {
      if (agentDataInterval.current) {
        clearInterval(agentDataInterval.current);
      }
    };
  }, [agentDataInterval]);

  // Fetch agent(s) data for the agent policy identified by the `policyId` prop
  // Polls every 30 seconds until agent is found and healthy
  useEffect(() => {
    const fetchAgents = async () => {
      const { data: agentsData, error } = await sendGetAgents({
        kuery: `${AGENTS_PREFIX}.policy_id: "${policyId}"`,
      });

      if (error) {
        notifications.toasts.addError(error, {
          title: i18n.translate(
            'xpack.fleet.epm.packageDetails.integrationList.agentlessStatusError',
            {
              defaultMessage: 'Error fetching agentless status information',
            }
          ),
        });
      }

      if (agentsData?.items?.[0]) {
        setAgentData(agentsData.items?.[0]);
      }
    };

    fetchAgents();
    agentDataInterval.current = setInterval(() => {
      fetchAgents();
    }, REFRESH_INTERVAL_MS);

    return () => clearAgentDataPolling();
  }, [clearAgentDataPolling, notifications.toasts, policyId]);

  // Watches agent data and updates step statuses and clears polling when agent is healthy
  useEffect(() => {
    if (agentData) {
      if (agentData.status === 'online') {
        setConfirmEnrollmentStatus('complete');
        setConfirmDataStatus('loading');
        clearAgentDataPolling();
      } else if (agentData.status === 'error' || agentData.status === 'degraded') {
        setConfirmEnrollmentStatus('danger');
        setConfirmDataStatus('disabled');
      } else {
        setConfirmEnrollmentStatus('loading');
        setConfirmDataStatus('disabled');
      }
    } else {
      setConfirmEnrollmentStatus('loading');
      setConfirmDataStatus('disabled');
    }
  }, [agentData, clearAgentDataPolling]);

  // Calculate integration title from the base package info
  const { data: packageInfoData } = useGetPackageInfoByKeyQuery(
    packageInfo.name,
    packageInfo.version,
    {
      prerelease: true,
    }
  );

  const integrationTitle = useMemo(
    () =>
      resolveIntegrationTitle({
        packageTitle: packageInfoData?.item?.title,
        policyTemplates: packageInfoData?.item?.policy_templates,
        selectedInput,
        fallbackName: policyName,
      }),
    [packageInfoData, selectedInput, policyName]
  );

  // Connector integrations don't ingest data until the connector is configured,
  // so the "Confirm incoming data" step is reframed as a connector setup step.
  const isConnector = packageInfo.name === FLEET_CONNECTORS_PACKAGE;

  return (
    <EuiFlyout
      data-test-subj="agentlessEnrollmentFlyout"
      onClose={onClose}
      maxWidth={MAX_FLYOUT_WIDTH}
      aria-labelledby="FleetAgentlessEnrollmentFlyoutTitle"
    >
      <EuiFlyoutHeader hasBorder aria-labelledby="FleetAgentlessEnrollmentFlyoutTitle">
        <EuiTitle size="m">
          <h2 id="FleetAgentlessEnrollmentFlyoutTitle">{policyName}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiSteps
          steps={[
            {
              title: i18n.translate(
                'xpack.fleet.agentlessEnrollmentFlyout.stepConfirmEnrollmentTitle',
                {
                  defaultMessage: 'Confirm agentless enrollment',
                }
              ),
              children: (
                <AgentlessStepConfirmEnrollment
                  agent={agentData}
                  agentPolicy={agentPolicy}
                  integrationTitle={integrationTitle}
                />
              ),
              status: confirmEnrollmentStatus,
            },
            {
              title: isConnector
                ? i18n.translate(
                    'xpack.fleet.agentlessEnrollmentFlyout.stepConfigureConnectorTitle',
                    {
                      defaultMessage: 'Configure connector',
                    }
                  )
                : i18n.translate('xpack.fleet.agentlessEnrollmentFlyout.stepConfirmDataTitle', {
                    defaultMessage: 'Confirm incoming data',
                  }),
              children:
                agentData && confirmEnrollmentStatus === 'complete' ? (
                  isConnector ? (
                    <AgentlessStepConfigureConnector
                      connectors={connectors}
                      policyName={policyName}
                      policyTemplates={packageInfoData?.item?.policy_templates}
                      setStepStatus={setConfirmDataStatus}
                      onClose={onClose}
                    />
                  ) : (
                    <AgentlessStepConfirmData
                      agent={agentData}
                      packageName={packageInfo.name}
                      packageVersion={packageInfo.version}
                      policyTemplates={packageInfoData?.item?.policy_templates}
                      setConfirmDataStatus={setConfirmDataStatus}
                    />
                  )
                ) : (
                  <></> // Avoids React error about null children prop
                ),
              status: confirmDataStatus,
            },
          ]}
        />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexStart">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>
              <FormattedMessage
                id="xpack.fleet.agentlessEnrollmentFlyout.closeFlyoutButtonLabel"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
