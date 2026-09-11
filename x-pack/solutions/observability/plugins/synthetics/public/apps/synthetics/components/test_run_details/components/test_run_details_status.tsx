/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';

import { EuiDescriptionList, EuiSkeletonText } from '@elastic/eui';
import { useJourneySteps } from '../../monitor_details/hooks/use_journey_steps';
import { useSelectedMonitor } from '../../monitor_details/hooks/use_selected_monitor';
import { BadgeStatus, MonitorStatus, STATUS_LABEL } from '../../common/components/monitor_status';

export const TestRunDetailsStatus = () => {
  const { monitor, isMonitorMissing } = useSelectedMonitor();

  const { data: stepsData, loading } = useJourneySteps();

  if (!monitor) {
    return (
      <EuiDescriptionList
        align="left"
        compressed={false}
        listItems={[
          {
            title: STATUS_LABEL,
            description:
              isMonitorMissing && stepsData?.details ? (
                <BadgeStatus
                  status={stepsData.details.journey.monitor.status}
                  // Browser + API journeys share the Succeeded/Failed badge
                  // semantics; HTTP/TCP/ICMP fall back to Up/Down.
                  isBrowserType={
                    stepsData.details.journey.monitor.type === 'browser' ||
                    stepsData.details.journey.monitor.type === 'api'
                  }
                />
              ) : (
                <EuiSkeletonText lines={1} />
              ),
          },
        ]}
      />
    );
  }

  return (
    <MonitorStatus
      status={stepsData?.details?.journey.monitor.status}
      monitor={monitor}
      loading={loading}
      compressed={false}
    />
  );
};
