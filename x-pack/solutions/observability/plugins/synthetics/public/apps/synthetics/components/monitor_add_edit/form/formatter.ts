/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { get, pick } from 'lodash';
import type { MonitorTypeEnum, MonitorFields } from '../types';
import { ConfigKey, FormMonitorType, ScheduleUnit } from '../types';
import { DEFAULT_FIELDS } from '../constants';

export const serializeNestedFormField = (fields: Record<string, any>) => {
  const monitorType = fields[ConfigKey.MONITOR_TYPE] as MonitorTypeEnum;
  const monitorFields: Record<string, any> = {};
  const defaults = DEFAULT_FIELDS[monitorType] as MonitorFields;
  Object.keys(defaults).map((key) => {
    /* split key names on dot to handle dot notation fields,
     * which are changed to nested fields by react-hook-form */
    monitorFields[key] = get(fields, key.split('.')) ?? fields[key] ?? defaults[key as ConfigKey];
  });
  return monitorFields as MonitorFields;
};

export const ALLOWED_FIELDS = [ConfigKey.ENABLED, ConfigKey.ALERT_CONFIG];

const formatSchedule = (schedule: { number: string; unit: ScheduleUnit }) => {
  const isFrequencyInSeconds = schedule.number.endsWith('s');
  return {
    number: isFrequencyInSeconds ? schedule.number.slice(0, -1) : schedule.number,
    unit: isFrequencyInSeconds ? ScheduleUnit.SECONDS : ScheduleUnit.MINUTES,
  };
};

export const format = (fields: Record<string, unknown>, readOnly: boolean = false) => {
  const formattedFields = serializeNestedFormField(fields) as MonitorFields;
  const textAssertion = formattedFields[ConfigKey.TEXT_ASSERTION]
    ? `
          await page.getByText('${formattedFields[ConfigKey.TEXT_ASSERTION]}').first().waitFor();`
    : ``;

  formattedFields[ConfigKey.SCHEDULE] = formatSchedule(formattedFields[ConfigKey.SCHEDULE]);

  const formattedMap = {
    [FormMonitorType.SINGLE]: {
      ...formattedFields,
      [ConfigKey.SOURCE_INLINE]: `step('Go to ${formattedFields[ConfigKey.URLS]}', async () => {
          await page.goto('${formattedFields[ConfigKey.URLS]}');${textAssertion}
        });`,
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.SINGLE,
    },
    [FormMonitorType.MULTISTEP]: {
      ...formattedFields,
      [ConfigKey.METADATA]: {
        script_source: {
          is_generated_script: get(fields, 'source.inline.type') === 'recorder' ? true : false,
          file_name: get(fields, 'source.inline.fileName') || '',
        },
      },
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.MULTISTEP,
    },
    [FormMonitorType.API]: {
      ...formattedFields,
      [ConfigKey.METADATA]: {
        script_source: {
          // API journeys are never produced by the recorder; this stays in the
          // shape only because the SO schema is shared with BROWSER monitors.
          is_generated_script: get(fields, 'source.inline.type') === 'recorder' ? true : false,
          file_name: get(fields, 'source.inline.fileName') || '',
        },
      },
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.API,
    },
    [FormMonitorType.HTTP]: {
      ...formattedFields,
      [ConfigKey.METADATA]: {
        is_tls_enabled: fields.isTLSEnabled,
      },
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.HTTP,
    },
    [FormMonitorType.TCP]: {
      ...formattedFields,
      [ConfigKey.METADATA]: {
        is_tls_enabled: fields.isTLSEnabled,
      },
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.TCP,
    },
    [FormMonitorType.ICMP]: {
      ...formattedFields,
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.ICMP,
    },
  };
  const formFields = formattedMap[fields[ConfigKey.FORM_MONITOR_TYPE] as FormMonitorType];
  return readOnly ? pick(formFields, ALLOWED_FIELDS) : formFields;
};
