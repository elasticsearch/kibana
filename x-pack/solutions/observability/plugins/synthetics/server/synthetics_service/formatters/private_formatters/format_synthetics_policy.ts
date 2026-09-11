/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NewPackagePolicy } from '@kbn/fleet-plugin/common';
import { cloneDeep } from 'lodash';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import { processorsFormatter } from './processors_formatter';
import { LegacyConfigKey } from '../../../../common/constants/monitor_management';
import type { MonitorTypeEnum, MonitorFields } from '../../../../common/runtime_types';
import { ConfigKey } from '../../../../common/runtime_types';
import { throttlingFormatter } from './browser_formatters';
import {
  formatMWs,
  handleMultilineStringFormatter,
  replaceStringWithParams,
} from '../formatting_utils';
import { syntheticsPolicyFormatters } from './formatters';
import { PARAMS_KEYS_TO_SKIP } from '../common';

export interface ProcessorFields {
  location_name: string;
  location_id: string;
  'monitor.project.name': string;
  'monitor.project.id': string;
  'monitor.id': string;
  test_run_id: string;
  run_once: boolean;
  space_id: string;
  kibanaUrl?: string;
}

export const formatSyntheticsPolicy = (
  newPolicy: NewPackagePolicy,
  monitorType: MonitorTypeEnum,
  config: Partial<MonitorFields & ProcessorFields>,
  params: Record<string, string>,
  mws: MaintenanceWindow[],
  isLegacy?: boolean
) => {
  const configKeys = Object.keys(config) as ConfigKey[];

  const formattedPolicy = cloneDeep(newPolicy);

  const currentInput = formattedPolicy.inputs.find(
    (input) => input.type === `synthetics/${monitorType}`
  );
  const dataStream = currentInput?.streams.find(
    (stream) => stream.data_stream.dataset === monitorType
  );
  formattedPolicy.inputs.forEach((input) => (input.enabled = false));

  if (currentInput && dataStream) {
    // reset all data streams to enabled false
    formattedPolicy.inputs.forEach((input) => (input.enabled = false));
    // enable only the input type and data stream that matches the monitor type.
    currentInput.enabled = true;
    dataStream.enabled = true;

    if (monitorType === 'browser') {
      currentInput.streams.forEach((stream) => {
        if (
          stream.data_stream.dataset === 'browser.network' ||
          stream.data_stream.dataset === 'browser.screenshot'
        ) {
          stream.enabled = true;
        }
      });
    }
    // API monitors emit a companion `synthetics.api.network` document per
    // request via Heartbeat's enrichSynthEvent → SetEventDataset path.
    // Enabling the `api.network` stream here is what causes Fleet to include
    // the matching index privileges in the generated agent API key. Without
    // it, journey/network_info events are produced and routed correctly by
    // Heartbeat but rejected at the bulk indexing layer with a 403, leaving
    // the api.network data stream silently empty.
    if (monitorType === 'api') {
      currentInput.streams.forEach((stream) => {
        if (stream.data_stream.dataset === 'api.network') {
          stream.enabled = true;
        }
      });
    }
  }

  configKeys.forEach((key) => {
    const configItem = dataStream?.vars?.[key];
    if (configItem) {
      if (syntheticsPolicyFormatters[key]) {
        configItem.value = syntheticsPolicyFormatters[key]?.(config, key);
      } else if (key === ConfigKey.MONITOR_SOURCE_TYPE && isLegacy) {
        configItem.value = undefined;
      } else {
        configItem.value = config[key] === undefined || config[key] === null ? null : config[key];
      }
      if (!PARAMS_KEYS_TO_SKIP.includes(key)) {
        configItem.value = replaceStringWithParams(configItem.value, params);
      }
      // if value contains a new line we need to add extra \n to escape it
      if (typeof configItem.value === 'string' && configItem.value.includes('\n')) {
        configItem.value = handleMultilineStringFormatter(configItem.value);
      }
    }
  });

  // Heartbeat decodes inline scripts when source.inline.encoding=base64.
  // synthetics 1.10.0 added this var to the API input with the same name as
  // browser, so encode whenever the installed package exposes it.
  const encodingVar = dataStream?.vars?.['source.inline.encoding'];
  if (encodingVar && config[ConfigKey.SOURCE_INLINE]) {
    encodingVar.value = 'base64';
    const inlineScript = dataStream.vars?.[ConfigKey.SOURCE_INLINE];
    if (inlineScript && typeof inlineScript.value === 'string') {
      inlineScript.value = Buffer.from(inlineScript.value).toString('base64');
    }
  }

  const processorItem = dataStream?.vars?.processors;
  if (processorItem) {
    processorItem.value = processorsFormatter(config as MonitorFields & ProcessorFields);
  }

  const mwItem = dataStream?.vars?.[ConfigKey.MAINTENANCE_WINDOWS];
  if (config[ConfigKey.MAINTENANCE_WINDOWS]?.length && mwItem) {
    const maintenanceWindows = config[ConfigKey.MAINTENANCE_WINDOWS];
    const formattedVal = formatMWs(
      maintenanceWindows.map((window) => {
        if (typeof window === 'string') {
          return mws.find((m) => m.id === window);
        }
        return window;
      }) as MaintenanceWindow[]
    );
    if (formattedVal) {
      mwItem.value = formattedVal;
    }
  }

  // TODO: remove this once we remove legacy support
  const throttling = dataStream?.vars?.[LegacyConfigKey.THROTTLING_CONFIG];
  if (throttling) {
    throttling.value = throttlingFormatter?.(config, ConfigKey.THROTTLING_CONFIG);
  }

  // Drop disabled inputs so we persist only the single active input. Disabled inputs never
  // contribute to the compiled agent policy and only bloat the saved object. A guard in Fleet's
  // `updatePackageInputs` keeps them from being re-added on package upgrade. Only strip once the
  // active input is resolved, so an unknown monitor type still yields the template.
  if (currentInput && dataStream) {
    formattedPolicy.inputs = formattedPolicy.inputs.filter((input) => input.enabled);
  }

  return { formattedPolicy, hasDataStream: Boolean(dataStream), hasInput: Boolean(currentInput) };
};
