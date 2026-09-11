/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import type { MonitorFields } from '../../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum } from '../../../../common/runtime_types';
import { secondsToCronFormatter } from '../formatting_utils';

type FormatterFn = (
  fields: Partial<MonitorFields>,
  key: ConfigKey
) => string | null | Record<string, any> | string[];

const LIGHTWEIGHT_DEFAULT_TIMEOUT_SECONDS = 16;

/**
 * Omits a field from the config sent to the Synthetics service when its value
 * matches the Heartbeat default. Heartbeat applies the same default when the
 * field is absent, so monitor behavior is unchanged (elastic/kibana#241818).
 */
export const omitDefaultFormatter =
  (defaultValue: unknown, formatter?: FormatterFn): FormatterFn =>
  (fields, key) => {
    const value = fields[key];
    if (isEqual(value, defaultValue)) {
      return null;
    }
    return formatter ? formatter(fields, key) : (value as string) ?? null;
  };

export const arrayFormatter: FormatterFn = (fields, key) => {
  const value = (fields[key] as string[]) ?? [];

  return value.length ? value : null;
};

export const objectFormatter: FormatterFn = (fields, key) => {
  const value = (fields[key] as Record<string, any>) ?? {};

  return Object.keys(value).length ? value : null;
};

export const stringToObjectFormatter: FormatterFn = (fields, key) => {
  const value = fields[key] as string;
  try {
    const obj = JSON.parse(value || '{}');
    return Object.keys(obj).length ? obj : undefined;
  } catch {
    return undefined;
  }
};

export const publicTimeoutFormatter: FormatterFn = (fields) => {
  // Browser and API monitors share the synthexec runtime; timeout is enforced
  // at the Node level rather than via Heartbeat's per-monitor timeout config.
  if (
    fields[ConfigKey.MONITOR_TYPE] === MonitorTypeEnum.BROWSER ||
    fields[ConfigKey.MONITOR_TYPE] === MonitorTypeEnum.API
  ) {
    return null;
  }

  // 16s is the Heartbeat default for lightweight monitors, so omit it.
  // `TimeoutString` accepts any numeric string, so compare with `Number` rather
  // than `parseInt` -- the latter truncates `16.5` to the default and would
  // silently drop a timeout the user explicitly asked for.
  if (Number((fields[ConfigKey.TIMEOUT] as string) ?? '') === LIGHTWEIGHT_DEFAULT_TIMEOUT_SECONDS) {
    return null;
  }

  return secondsToCronFormatter(fields, ConfigKey.TIMEOUT);
};
