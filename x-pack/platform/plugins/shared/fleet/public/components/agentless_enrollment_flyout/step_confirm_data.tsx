/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiStepStatus } from '@elastic/eui';
import { EuiText, EuiLink, EuiSpacer, EuiCallOut } from '@elastic/eui';

import { useStartServices } from '../../hooks';
import type { Agent, RegistryPolicyTemplate } from '../../types';
import {
  usePollingIncomingData,
  POLLING_TIMEOUT_MS,
} from '../agent_enrollment_flyout/use_get_agent_incoming_data';

import { NextSteps } from './next_steps';

export const AgentlessStepConfirmData = ({
  agent,
  packageName,
  packageVersion,
  setConfirmDataStatus,
  policyTemplates,
}: {
  agent: Agent;
  packageName: string;
  packageVersion: string;
  setConfirmDataStatus: (status: EuiStepStatus) => void;
  policyTemplates?: RegistryPolicyTemplate[];
}) => {
  const { docLinks } = useStartServices();
  const [overallState, setOverallState] = useState<'pending' | 'success' | 'failure'>('pending');

  // Fetch integration data for the given agent and package
  const { incomingData, hasReachedTimeout } = usePollingIncomingData({
    agentIds: [agent.id],
    pkgName: packageName,
    pkgVersion: packageVersion,
  });

  // Calculate overall UI state from polling data
  useEffect(() => {
    if (incomingData.length > 0) {
      setConfirmDataStatus('complete');
      setOverallState('success');
    } else if (hasReachedTimeout) {
      setConfirmDataStatus('danger');
      setOverallState('failure');
    } else {
      setConfirmDataStatus('loading');
      setOverallState('pending');
    }
  }, [incomingData, hasReachedTimeout, setConfirmDataStatus]);

  if (overallState === 'success') {
    return (
      <>
        <EuiCallOut
          announceOnMount
          color="success"
          title={i18n.translate('xpack.fleet.agentlessEnrollmentFlyout.confirmData.successText', {
            defaultMessage: 'Incoming data received from agentless integration',
          })}
          iconType="check"
        />
        <EuiSpacer size="m" />
        <NextSteps policyTemplates={policyTemplates} />
      </>
    );
  } else if (overallState === 'failure') {
    return (
      <>
        <EuiCallOut
          announceOnMount
          color="danger"
          title={i18n.translate('xpack.fleet.agentlessEnrollmentFlyout.confirmData.failureText', {
            defaultMessage: 'No incoming data received from agentless integration',
          })}
          iconType="warning"
        />
        <EuiSpacer size="m" />
        <EuiText>
          <p>
            <FormattedMessage
              id="xpack.fleet.agentlessEnrollmentFlyout.confirmData.failureHelperText"
              defaultMessage="No integration data received in the past {num} minutes. Check out the {troubleshootingGuideLink} for help."
              values={{
                num: POLLING_TIMEOUT_MS / 1000 / 60,
                troubleshootingGuideLink: (
                  <EuiLink href={docLinks.links.fleet.troubleshooting} target="_blank">
                    <FormattedMessage
                      id="xpack.fleet.agentlessEnrollmentFlyout.confirmData.pendingHelperText.troubleshootingLinkLabel"
                      defaultMessage="troubleshooting guide"
                    />
                  </EuiLink>
                ),
              }}
            />
          </p>
        </EuiText>
      </>
    );
  }

  return null;
};
