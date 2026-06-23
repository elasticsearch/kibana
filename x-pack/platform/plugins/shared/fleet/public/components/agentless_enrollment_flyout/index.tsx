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

import { AGENTS_PREFIX, MAX_FLYOUT_WIDTH } from '../../constants';
import type { Agent, AgentPolicy, PackagePolicy } from '../../types';
import { sendGetAgents, useStartServices, useGetPackageInfoByKeyQuery } from '../../hooks';

import { AgentlessStepConfirmEnrollment } from './step_confirm_enrollment';
import { AgentlessStepConfirmData } from './step_confirm_data';

const REFRESH_INTERVAL_MS = 30000;

/**
 * This component displays additional status details of an agentless agent enrolled
 * the chosen package policy (and its agent policy).
 * It also displays confirmation that the agentless agent is ingesting data from
 * the chosen package policy.
 */
export const AgentlessEnrollmentFlyout = ({
  onClose,
  packagePolicy,
  agentPolicy,
}: {
  onClose: () => void;
  packagePolicy: PackagePolicy;
  agentPolicy?: AgentPolicy;
}) => {
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

  // Fetch agent(s) data for the first associated agent policy
  // Polls every 30 seconds until agent is found and healthy
  useEffect(() => {
    const fetchAgents = async () => {
      const { data: agentsData, error } = await sendGetAgents({
        kuery: `${AGENTS_PREFIX}.policy_id: "${packagePolicy.policy_ids[0]}"`,
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
  }, [clearAgentDataPolling, notifications.toasts, packagePolicy.policy_ids]);

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

  // Calculate integration title from the base package info and what
  // is configured on the package policy.
  const { data: packageInfoData } = useGetPackageInfoByKeyQuery(
    packagePolicy.package!.name,
    packagePolicy.package!.version,
    {
      prerelease: true,
    }
  );

  const integrationTitle = useMemo(() => {
    if (packageInfoData?.item) {
      const enabledInputs = packagePolicy.inputs?.filter((input) => input.enabled);

      // If only one input is enabled, find the input name from the package info and
      // and use that for integration title. Otherwise, use the package name.
      if (enabledInputs.length === 1 && enabledInputs[0].policy_template) {
        const policyTemplate = packageInfoData.item.policy_templates?.find(
          (template) => template.name === enabledInputs[0].policy_template
        );
        const input =
          policyTemplate && 'inputs' in policyTemplate
            ? policyTemplate.inputs?.find((i) => i.type === enabledInputs[0].type)
            : null;
        return input?.title || packageInfoData.item.title;
      } else {
        return packageInfoData.item.title;
      }
    }
    return packagePolicy.name;
  }, [packageInfoData, packagePolicy]);

  return (
    <EuiFlyout
      data-test-subj="agentlessEnrollmentFlyout"
      onClose={onClose}
      maxWidth={MAX_FLYOUT_WIDTH}
      aria-labelledby="FleetAgentlessEnrollmentFlyoutTitle"
    >
      <EuiFlyoutHeader hasBorder aria-labelledby="FleetAgentlessEnrollmentFlyoutTitle">
        <EuiTitle size="m">
          <h2 id="FleetAgentlessEnrollmentFlyoutTitle">{packagePolicy.name}</h2>
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
              title: i18n.translate('xpack.fleet.agentlessEnrollmentFlyout.stepConfirmDataTitle', {
                defaultMessage: 'Confirm incoming data',
              }),
              children:
                agentData && confirmEnrollmentStatus === 'complete' ? (
                  <AgentlessStepConfirmData
                    agent={agentData}
                    packagePolicy={packagePolicy}
                    policyTemplates={packageInfoData?.item.policy_templates}
                    setConfirmDataStatus={setConfirmDataStatus}
                  />
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
