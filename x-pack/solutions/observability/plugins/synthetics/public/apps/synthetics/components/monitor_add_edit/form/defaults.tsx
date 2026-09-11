/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { formatKibanaNamespace } from '../../../../../../common/formatters';
import { DEFAULT_FIELDS } from '../constants';

import type { SyntheticsMonitor, BrowserFields, HTTPFields, ScheduleUnit } from '../types';
import { ConfigKey, MonitorTypeEnum, FormMonitorType } from '../types';

export const getDefaultFormFields = (
  spaceId: string = 'default'
): Record<FormMonitorType, Record<string, any>> => {
  const kibanaNamespace = formatKibanaNamespace(spaceId);
  return {
    [FormMonitorType.MULTISTEP]: {
      ...DEFAULT_FIELDS[MonitorTypeEnum.BROWSER],
      'source.inline': {
        type: 'recorder',
        script: '',
        fileName: '',
      },
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.MULTISTEP,
      [ConfigKey.NAMESPACE]: kibanaNamespace,
    },
    [FormMonitorType.API]: {
      ...DEFAULT_FIELDS[MonitorTypeEnum.API],
      'source.inline': {
        type: 'inline',
        script: '',
        fileName: '',
      },
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.API,
      [ConfigKey.NAMESPACE]: kibanaNamespace,
    },
    [FormMonitorType.SINGLE]: {
      ...DEFAULT_FIELDS[MonitorTypeEnum.BROWSER],
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.SINGLE,
      [ConfigKey.NAMESPACE]: kibanaNamespace,
    },
    [FormMonitorType.HTTP]: {
      ...DEFAULT_FIELDS[MonitorTypeEnum.HTTP],
      isTLSEnabled: false,
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.HTTP,
      [ConfigKey.NAMESPACE]: kibanaNamespace,
    },
    [FormMonitorType.TCP]: {
      ...DEFAULT_FIELDS[MonitorTypeEnum.TCP],
      isTLSEnabled: false,
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.TCP,
      [ConfigKey.NAMESPACE]: kibanaNamespace,
    },
    [FormMonitorType.ICMP]: {
      ...DEFAULT_FIELDS[MonitorTypeEnum.ICMP],
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.ICMP,
      [ConfigKey.NAMESPACE]: kibanaNamespace,
    },
  };
};

export const formatDefaultFormValues = (monitor?: SyntheticsMonitor) => {
  if (!monitor) return undefined;

  let formMonitorType = monitor[ConfigKey.FORM_MONITOR_TYPE];
  const monitorType = monitor[ConfigKey.MONITOR_TYPE];
  let schedule = monitor[ConfigKey.SCHEDULE];
  if (schedule?.unit === 's') {
    schedule = { number: `${schedule.number}s`, unit: 's' as ScheduleUnit };
  }
  const monitorWithFormMonitorType = {
    ...monitor,
    [ConfigKey.SCHEDULE]: schedule,
  };

  const params = monitorWithFormMonitorType[ConfigKey.PARAMS];
  if (typeof params !== 'string' && params) {
    try {
      monitorWithFormMonitorType[ConfigKey.PARAMS] = JSON.stringify(params);
    } catch (e) {
      // ignore
    }
  }
  const browserMonitor = monitor as BrowserFields;

  const pwOptions = browserMonitor[ConfigKey.PLAYWRIGHT_OPTIONS];
  if (typeof pwOptions !== 'string' && pwOptions) {
    try {
      (monitorWithFormMonitorType as BrowserFields)[ConfigKey.PLAYWRIGHT_OPTIONS] =
        JSON.stringify(pwOptions);
    } catch (e) {
      // ignore
    }
  }

  // handle default monitor types from Uptime, which don't contain `ConfigKey.FORM_MONITOR_TYPE`
  if (!formMonitorType) {
    if (monitorType === MonitorTypeEnum.BROWSER) {
      formMonitorType = FormMonitorType.MULTISTEP;
    } else if (monitorType === MonitorTypeEnum.API) {
      formMonitorType = FormMonitorType.API;
    } else {
      formMonitorType = monitorType as Omit<
        MonitorTypeEnum,
        MonitorTypeEnum.BROWSER | MonitorTypeEnum.API
      > as FormMonitorType;
    }
    monitorWithFormMonitorType[ConfigKey.FORM_MONITOR_TYPE] = formMonitorType;
  }

  switch (formMonitorType) {
    case FormMonitorType.MULTISTEP:
    case FormMonitorType.API:
      return {
        ...monitorWithFormMonitorType,
        'source.inline': {
          // API journeys never come from the recorder (recorder is a browser-only
          // UI flow), but the metadata shape is shared with BROWSER monitors so
          // we still read it the same way.
          type: browserMonitor[ConfigKey.METADATA]?.script_source?.is_generated_script
            ? 'recorder'
            : 'inline',
          script: browserMonitor[ConfigKey.SOURCE_INLINE],
          fileName: browserMonitor[ConfigKey.METADATA]?.script_source?.file_name,
        },
      };
    case FormMonitorType.SINGLE:
    case FormMonitorType.ICMP:
      return {
        ...monitorWithFormMonitorType,
      };
    case FormMonitorType.HTTP:
    case FormMonitorType.TCP:
      return {
        ...monitorWithFormMonitorType,
        isTLSEnabled: (monitor as HTTPFields)[ConfigKey.METADATA].is_tls_enabled,
      };
  }
};
