/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiDescriptionList, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedDate, FormattedRelative } from '@kbn/i18n-react';

import type { Agent, OTelCollectorConfig } from '../../../../../common/types';

import { AgentHealth } from '../../../../applications/fleet/sections/agents/components/agent_health';

interface CollectorDetailInfoProps {
  agent: Agent;
  config?: OTelCollectorConfig;
}

const FormattedTimestampOrDash: React.FC<{ value?: string }> = ({ value }) => {
  if (!value) return <>-</>;
  const date = new Date(value);
  return (
    <EuiToolTip
      content={
        <FormattedDate
          value={date}
          year="numeric"
          month="short"
          day="2-digit"
          hour="numeric"
          minute="numeric"
          timeZoneName="short"
        />
      }
    >
      <span tabIndex={0}>
        <FormattedRelative value={date} />
      </span>
    </EuiToolTip>
  );
};

export const CollectorDetailInfo: React.FC<CollectorDetailInfoProps> = ({ agent, config }) => {
  const host = agent.local_metadata?.host;
  const identifying = agent.identifying_attributes;
  const nonIdentifying = agent.non_identifying_attributes;
  const pipelineCount = Object.keys(config?.service?.pipelines ?? {}).length;

  const listItems = useMemo(
    () =>
      [
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.name', {
            defaultMessage: 'Name',
          }),
          description: nonIdentifying?.['elastic.display.name'] ?? agent.id,
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.agentId', {
            defaultMessage: 'Agent ID',
          }),
          description: agent.id,
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.agentStatus', {
            defaultMessage: 'Agent status',
          }),
          description: <AgentHealth agent={agent} fromDetails={true} />,
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.lastActivity', {
            defaultMessage: 'Last activity',
          }),
          description: <FormattedTimestampOrDash value={agent.last_checkin} />,
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.lastCheckinMessage', {
            defaultMessage: 'Last checkin message',
          }),
          description: agent.last_checkin_message ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.serviceName', {
            defaultMessage: 'Service name',
          }),
          description: identifying?.['service.name'] ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.serviceVersion', {
            defaultMessage: 'Service version',
          }),
          description: identifying?.['service.version'] ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.hostName', {
            defaultMessage: 'Host name',
          }),
          description:
            (typeof host === 'object' ? host?.hostname : undefined) ??
            nonIdentifying?.['host.name'] ??
            '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.hostId', {
            defaultMessage: 'Host ID',
          }),
          description: (typeof host === 'object' ? host?.id : undefined) ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.hostArch', {
            defaultMessage: 'Host architecture',
          }),
          description: nonIdentifying?.['host.arch'] ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.os', {
            defaultMessage: 'OS',
          }),
          description: nonIdentifying?.['os.type'] ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.platform', {
            defaultMessage: 'Platform',
          }),
          description: nonIdentifying?.['os.description'] ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.collectorGroup', {
            defaultMessage: 'Collector group',
          }),
          description: nonIdentifying?.['elastic.collector.group'] ?? '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.pipelines', {
            defaultMessage: 'Pipelines',
          }),
          description: String(pipelineCount),
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.enrolled', {
            defaultMessage: 'Enrolled',
          }),
          description: <FormattedTimestampOrDash value={agent.enrolled_at} />,
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.tags', {
            defaultMessage: 'Tags',
          }),
          description: (agent.tags ?? []).length > 0 ? agent.tags!.join(', ') : '-',
        },
        {
          title: i18n.translate('xpack.fleet.otelUi.collectorDetail.info.capabilities', {
            defaultMessage: 'Capabilities',
          }),
          description: agent.capabilities?.join(', ') || '-',
        },
      ].map((item) => ({
        ...item,
        description: String(item.description) === '' ? '-' : item.description,
      })),
    [agent, host, identifying, nonIdentifying, pipelineCount]
  );

  return (
    <EuiDescriptionList
      compressed
      type="column"
      rowGutterSize="m"
      columnGutterSize="m"
      data-test-subj="collectorDetailInfo"
      listItems={listItems}
    />
  );
};
