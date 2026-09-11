/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import { secondsToCronFormatter } from '../formatting_utils';
import type { MonitorFields } from '../../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum } from '../../../../common/runtime_types';
import { HEARTBEAT_BROWSER_MONITOR_TIMEOUT_OVERHEAD_SECONDS } from '../../../../common/constants/monitor_defaults';

export type FormatterFn = (fields: Partial<MonitorFields>, key: ConfigKey) => string | null;

const LIGHTWEIGHT_DEFAULT_TIMEOUT_SECONDS = 16;

/**
 * Omits a field from the agent policy when its value matches the Heartbeat
 * default, so the compiled stream (and the resulting agent payload) stays lean.
 * Heartbeat applies the same default when the field is absent, so this is a
 * no-op for the running monitor (see elastic/kibana#241818).
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

/**
 * Always omits a field from the agent policy. Used for UI-only metadata
 * (`__ui`) that Heartbeat ignores, so it never needs to reach the agent
 * (see elastic/kibana#241818). An empty value already resolved to `null`
 * before, so dropping it unconditionally is a safe extension.
 */
export const omitFieldFormatter: FormatterFn = () => null;

export const arrayToJsonFormatter: FormatterFn = (fields, key) => {
  const value = (fields[key] as string[]) ?? [];
  return value.length ? JSON.stringify(value) : null;
};

export const objectToJsonFormatter: FormatterFn = (fields, fieldKey) => {
  const value = (fields[fieldKey] as Record<string, any>) ?? {};
  if (Object.keys(value).length === 0) return null;

  return JSON.stringify(value);
};

// only add tls settings if they are enabled by the user and isEnabled is true
export const tlsValueToYamlFormatter: FormatterFn = (fields, key) => {
  if (fields[ConfigKey.METADATA]?.is_tls_enabled) {
    const tlsValue = (fields[key] as string) ?? '';

    return tlsValue ? JSON.stringify(tlsValue) : null;
  } else {
    return null;
  }
};

export const tlsValueToStringFormatter: FormatterFn = (fields, key) => {
  if (fields[ConfigKey.METADATA]?.is_tls_enabled) {
    const tlsValue = (fields[key] as string) ?? '';

    return tlsValue || null;
  } else {
    return null;
  }
};

export const tlsArrayToYamlFormatter: FormatterFn = (fields, key) => {
  if (fields[ConfigKey.METADATA]?.is_tls_enabled) {
    const tlsValue = (fields[key] as string[]) ?? [];

    return tlsValue.length ? JSON.stringify(tlsValue) : null;
  } else {
    return null;
  }
};

export const stringToJsonFormatter: FormatterFn = (fields, key) => {
  const value = (fields[key] as string) ?? '';
  return value ? JSON.stringify(value) : null;
};

export const stringifyString = (value?: string) => {
  if (!value) return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return value;
  }
};

export const privateTimeoutFormatter: FormatterFn = (fields) => {
  const value = (fields[ConfigKey.TIMEOUT] as string) ?? '';
  if (!value) return null;

  // Heartbeat adds a 30s overhead to browser monitor timeouts internally,
  // so we subtract it to match the user's expected total timeout.
  // Clamp to 0 to guard against negative values if validation is bypassed.
  //
  // API monitors (monitor.type === 'api', elastic/beats#50802) reuse the same
  // synthexec runtime via browser.NewSourceJob but never launch Chromium, so
  // they do not need the 30s Chromium-startup overhead. They fall through to
  // secondsToCronFormatter and forward the user's timeout as-is.
  if (fields[ConfigKey.MONITOR_TYPE] === MonitorTypeEnum.BROWSER) {
    const timeoutSeconds = parseInt(value, 10);

    if (isNaN(timeoutSeconds)) {
      return null;
    }

    const adjustedTimeout = Math.max(
      0,
      timeoutSeconds - HEARTBEAT_BROWSER_MONITOR_TIMEOUT_OVERHEAD_SECONDS
    );
    return `${adjustedTimeout}s`;
  }

  // Lightweight monitors default to a 16s timeout, which is also Heartbeat's
  // default, so it can be omitted from the policy (elastic/kibana#241818).
  // `TimeoutString` accepts any numeric string, so compare with `Number` rather
  // than `parseInt` -- the latter truncates `16.5` to the default and would
  // silently drop a timeout the user explicitly asked for.
  if (Number(value) === LIGHTWEIGHT_DEFAULT_TIMEOUT_SECONDS) {
    return null;
  }

  return secondsToCronFormatter(fields, ConfigKey.TIMEOUT);
};
