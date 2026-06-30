/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiHealth } from '@elastic/eui';

import type { EntityTableRows } from '../../../../../flyout/entity_details/shared/components/entity_table/types';
import type { ObservedEntityData } from '../../../../../flyout/entity_details/shared/components/observed_entity/types';
import { AgentStatus } from '../../../../../common/components/endpoint/agents/agent_status';
import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import type { HostItem } from '../../../../../../common/search_strategy';
import { HostPolicyResponseActionStatus } from '../../../../../../common/search_strategy';
import * as i18n from './translations';

export const policyFields: EntityTableRows<ObservedEntityData<HostItem>> = [
  {
    label: i18n.ENDPOINT_POLICY,
    render: (hostData: ObservedEntityData<HostItem>) => {
      const appliedPolicy = hostData.details.endpoint?.hostInfo?.metadata.Endpoint.policy.applied;
      return appliedPolicy?.name ? <>{appliedPolicy.name}</> : getEmptyTagValue();
    },
    isVisible: (hostData: ObservedEntityData<HostItem>) => hostData.details.endpoint != null,
  },
  {
    label: i18n.POLICY_STATUS,
    render: (hostData: ObservedEntityData<HostItem>) => {
      const appliedPolicy = hostData.details.endpoint?.hostInfo?.metadata.Endpoint.policy.applied;
      const policyColor =
        appliedPolicy?.status === HostPolicyResponseActionStatus.failure
          ? 'danger'
          : appliedPolicy?.status;

      return appliedPolicy?.status ? (
        <EuiHealth aria-label={appliedPolicy?.status} color={policyColor}>
          {appliedPolicy?.status}
        </EuiHealth>
      ) : (
        getEmptyTagValue()
      );
    },
    isVisible: (hostData: ObservedEntityData<HostItem>) => hostData.details.endpoint != null,
  },
  {
    label: i18n.SENSORVERSION,
    getValues: (hostData: ObservedEntityData<HostItem>) =>
      hostData.details.endpoint?.hostInfo?.metadata.agent.version
        ? [hostData.details.endpoint?.hostInfo?.metadata.agent.version]
        : undefined,
    field: 'agent.version',
    isVisible: (hostData: ObservedEntityData<HostItem>) => hostData.details.endpoint != null,
  },
  {
    label: i18n.FLEET_AGENT_STATUS,
    render: (hostData: ObservedEntityData<HostItem>) =>
      hostData.details.endpoint?.hostInfo ? (
        <AgentStatus
          agentId={hostData.details.endpoint?.hostInfo.metadata.agent.id}
          agentType="endpoint"
          data-test-subj="endpointHostAgentStatus"
        />
      ) : (
        getEmptyTagValue()
      ),
    isVisible: (hostData: ObservedEntityData<HostItem>) => hostData.details.endpoint != null,
  },
];
