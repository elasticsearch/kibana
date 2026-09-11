/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MonitorTypeEnum } from '../../../common/runtime_types';
import type { formatZodErrors as FormatZodErrors } from '../../../common/runtime_types/zod/format_errors';
import type { MonitorTypeCodec as MonitorTypeCodecType } from '../../../common/runtime_types/zod/monitor_configs';
import type {
  BrowserFieldsCodec,
  HTTPFieldsCodec,
  ICMPFieldsCodec,
  TCPFieldsCodec,
} from '../../../common/runtime_types/zod/monitor_types';
import type { ProjectMonitorCodec as ProjectMonitorCodecType } from '../../../common/runtime_types/zod/monitor_types_project';

type MonitorCodecType =
  | typeof ICMPFieldsCodec
  | typeof TCPFieldsCodec
  | typeof HTTPFieldsCodec
  | typeof BrowserFieldsCodec;

interface ZodMonitorCodecs {
  BrowserFieldsCodec: typeof BrowserFieldsCodec;
  HTTPFieldsCodec: typeof HTTPFieldsCodec;
  ICMPFieldsCodec: typeof ICMPFieldsCodec;
  TCPFieldsCodec: typeof TCPFieldsCodec;
  MonitorTypeCodec: typeof MonitorTypeCodecType;
  ProjectMonitorCodec: typeof ProjectMonitorCodecType;
  formatZodErrors: typeof FormatZodErrors;
  monitorTypeToCodecMap: Record<MonitorTypeEnum, MonitorCodecType>;
}

let cached: ZodMonitorCodecs | undefined;

/**
 * Lazily load the zod monitor schema tree. Eager top-level imports retain
 * several MiB on warm-start; decode only needs these on the first validation.
 */
export function getZodMonitorCodecs(): ZodMonitorCodecs {
  if (cached) {
    return cached;
  }

  /* eslint-disable @typescript-eslint/no-var-requires */
  const monitorTypes = require('../../../common/runtime_types/zod/monitor_types') as {
    BrowserFieldsCodec: typeof BrowserFieldsCodec;
    HTTPFieldsCodec: typeof HTTPFieldsCodec;
    ICMPFieldsCodec: typeof ICMPFieldsCodec;
    TCPFieldsCodec: typeof TCPFieldsCodec;
  };
  const { MonitorTypeCodec } = require('../../../common/runtime_types/zod/monitor_configs') as {
    MonitorTypeCodec: typeof MonitorTypeCodecType;
  };
  const { ProjectMonitorCodec } =
    require('../../../common/runtime_types/zod/monitor_types_project') as {
      ProjectMonitorCodec: typeof ProjectMonitorCodecType;
    };
  const { formatZodErrors } = require('../../../common/runtime_types/zod/format_errors') as {
    formatZodErrors: typeof FormatZodErrors;
  };
  /* eslint-enable @typescript-eslint/no-var-requires */

  cached = {
    BrowserFieldsCodec: monitorTypes.BrowserFieldsCodec,
    HTTPFieldsCodec: monitorTypes.HTTPFieldsCodec,
    ICMPFieldsCodec: monitorTypes.ICMPFieldsCodec,
    TCPFieldsCodec: monitorTypes.TCPFieldsCodec,
    MonitorTypeCodec,
    ProjectMonitorCodec,
    formatZodErrors,
    monitorTypeToCodecMap: {
      [MonitorTypeEnum.ICMP]: monitorTypes.ICMPFieldsCodec,
      [MonitorTypeEnum.TCP]: monitorTypes.TCPFieldsCodec,
      [MonitorTypeEnum.HTTP]: monitorTypes.HTTPFieldsCodec,
      [MonitorTypeEnum.BROWSER]: monitorTypes.BrowserFieldsCodec,
    },
  };

  return cached;
}
