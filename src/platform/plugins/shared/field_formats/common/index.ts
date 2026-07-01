/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import { FieldFormatsRegistry } from './field_formats_registry';

/** @public */
type IFieldFormatsRegistry = PublicMethodsOf<FieldFormatsRegistry>;

export type { IFieldFormatsRegistry };
export { FieldFormatsRegistry };
export { FieldFormat } from './field_format';
export { baseFormatters } from './constants/base_formatters';
export {
  BoolFormat,
  BytesFormat,
  ColorFormat,
  DurationFormat,
  convertDurationValue,
  GeoPointFormat,
  IpFormat,
  NumberFormat,
  PercentFormat,
  RelativeDateFormat,
  StaticLookupFormat,
  UrlFormat,
  StringFormat,
  TruncateFormat,
  HistogramFormat,
} from './converters';

export { getHighlightRequest, geoUtils } from './utils';

export { DEFAULT_CONVERTER_COLOR } from './constants/color_default';
export { FORMATS_UI_SETTINGS } from './constants/ui_settings';
export {
  DEFAULT_DURATION_INPUT_FORMAT,
  DEFAULT_DURATION_OUTPUT_FORMAT,
  DURATION_INPUT_FORMATS,
  DURATION_OUTPUT_FORMATS,
} from './constants/duration_formats';
export { FIELD_FORMAT_IDS } from './types';

export type {
  FieldFormatsGetConfigFn,
  FieldFormatConfig,
  FieldFormatId,
  SerializedFieldFormat,
  FormatFactory,
  FieldFormatInstanceType,
  IFieldFormat,
  FieldFormatsStartCommon,
  FieldFormatParams,
  FieldFormatMetaParams,
  ReactContextTypeConvert,
  ReactConvertFunction,
  ReactContextTypeOptions,
  TextContextTypeConvert,
  TextContextTypeOptions,
} from './types';
