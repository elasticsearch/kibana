/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { FormMonitorType } from '../../../../../common/runtime_types/monitor_management/monitor_configs';

export { FormMonitorType };

export const ES_ARCHIVES = {
  BROWSER:
    'x-pack/solutions/observability/plugins/synthetics/test/scout/common/ui/es_archiver/browser',
  FULL_HEARTBEAT:
    'x-pack/solutions/observability/plugins/synthetics/test/scout/common/ui/es_archiver/full_heartbeat',
  SYNTHETICS_DATA:
    'x-pack/solutions/observability/plugins/synthetics/test/scout/common/ui/es_archiver/synthetics_data',
} as const;

const apmServiceName = 'apmServiceName';

export const monitorConfigurations = (locationLabel: string) => {
  const httpName = `http monitor ${uuidv4()}`;
  const icmpName = `icmp monitor ${uuidv4()}`;
  const tcpName = `tcp monitor ${uuidv4()}`;
  const browserName = `browser monitor ${uuidv4()}`;
  const browserRecorderName = `browser monitor recorder ${uuidv4()}`;
  const apiName = `api monitor ${uuidv4()}`;

  return {
    [FormMonitorType.HTTP]: {
      monitorType: FormMonitorType.HTTP,
      monitorConfig: {
        schedule: '3',
        name: httpName,
        url: 'https://elastic.co',
        locations: [locationLabel],
        apmServiceName,
      },
      monitorListDetails: {
        location: locationLabel,
        schedule: '3 minutes',
        name: httpName,
      },
      monitorEditDetails: [
        ['[data-test-subj=syntheticsMonitorConfigSchedule]', '3'],
        ['[data-test-subj=syntheticsMonitorConfigName]', httpName],
        ['[data-test-subj=syntheticsMonitorConfigURL]', 'https://elastic.co'],
        ['[data-test-subj=syntheticsMonitorConfigAPMServiceName]', apmServiceName],
      ] as Array<[string, string]>,
    },
    [FormMonitorType.TCP]: {
      monitorType: FormMonitorType.TCP,
      monitorConfig: {
        schedule: '3',
        name: tcpName,
        host: 'smtp.gmail.com:587',
        locations: [locationLabel],
        apmServiceName,
      },
      monitorListDetails: {
        location: locationLabel,
        schedule: '3 minutes',
        name: tcpName,
      },
      monitorEditDetails: [
        ['[data-test-subj=syntheticsMonitorConfigSchedule]', '3'],
        ['[data-test-subj=syntheticsMonitorConfigName]', tcpName],
        ['[data-test-subj=syntheticsMonitorConfigHost]', 'smtp.gmail.com:587'],
        ['[data-test-subj=syntheticsMonitorConfigAPMServiceName]', apmServiceName],
      ] as Array<[string, string]>,
    },
    [FormMonitorType.ICMP]: {
      monitorType: FormMonitorType.ICMP,
      monitorConfig: {
        schedule: '3',
        name: icmpName,
        host: '1.1.1.1',
        locations: [locationLabel],
        apmServiceName,
      },
      monitorListDetails: {
        location: locationLabel,
        schedule: '3 minutes',
        name: icmpName,
      },
      monitorEditDetails: [
        ['[data-test-subj=syntheticsMonitorConfigSchedule]', '3'],
        ['[data-test-subj=syntheticsMonitorConfigName]', icmpName],
        ['[data-test-subj=syntheticsMonitorConfigHost]', '1.1.1.1'],
        ['[data-test-subj=syntheticsMonitorConfigAPMServiceName]', apmServiceName],
      ] as Array<[string, string]>,
    },
    [FormMonitorType.MULTISTEP]: {
      monitorType: FormMonitorType.MULTISTEP,
      monitorConfig: {
        schedule: '10',
        name: browserName,
        inlineScript: 'step("test step", () => {})',
        locations: [locationLabel],
        apmServiceName,
      },
      monitorListDetails: {
        location: locationLabel,
        schedule: '10 minutes',
        name: browserName,
      },
      monitorEditDetails: [
        ['[data-test-subj=syntheticsMonitorConfigSchedule]', '10'],
        ['[data-test-subj=syntheticsMonitorConfigName]', browserName],
        [
          'div[data-test-subj="codeEditorContainer"][aria-label="JavaScript code editor"]',
          'step("test step", () => {})',
        ],
        ['[data-test-subj=syntheticsMonitorConfigAPMServiceName]', apmServiceName],
      ] as Array<[string, string]>,
    },
    [FormMonitorType.API]: {
      monitorType: FormMonitorType.API,
      monitorConfig: {
        schedule: '10',
        name: apiName,
        inlineScript: 'step("ping", async ({ request }) => {})',
        locations: [locationLabel],
        apmServiceName,
      },
      monitorListDetails: {
        location: locationLabel,
        schedule: '10 minutes',
        name: apiName,
      },
      monitorEditDetails: [
        ['[data-test-subj=syntheticsMonitorConfigSchedule]', '10'],
        ['[data-test-subj=syntheticsMonitorConfigName]', apiName],
        [
          'div[data-test-subj="codeEditorContainer"][aria-label="JavaScript code editor"]',
          'step("ping", async ({ request }) => {})',
        ],
        ['[data-test-subj=syntheticsMonitorConfigAPMServiceName]', apmServiceName],
      ] as Array<[string, string]>,
    },
    [`${FormMonitorType.MULTISTEP}__recorder`]: {
      monitorType: FormMonitorType.MULTISTEP,
      monitorConfig: {
        schedule: '10',
        name: browserRecorderName,
        recorderScript: 'step("test step", () => {})',
        locations: [locationLabel],
        apmServiceName: 'Sample APM Service',
      },
      monitorListDetails: {
        location: locationLabel,
        schedule: '10 minutes',
        name: browserRecorderName,
      },
      monitorEditDetails: [
        ['[data-test-subj=syntheticsMonitorConfigSchedule]', '10'],
        ['[data-test-subj=syntheticsMonitorConfigName]', browserRecorderName],
        [
          'div[data-test-subj="codeEditorContainer"][aria-label="JavaScript code editor"]',
          'step("test step", () => {})',
        ],
      ] as Array<[string, string]>,
    },
  };
};
