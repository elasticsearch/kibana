/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from 'zod/v4';
import {
  assertUnboundedStringReason,
  getStringHelperLimits,
  reportStringLengthViolation,
} from '@kbn/schema-string-helpers';
import type { StringHelperLimits, StringHelperName } from '@kbn/schema-string-helpers';

export type ZodStringOptions = Exclude<NonNullable<Parameters<typeof z.string>[0]>, string> &
  Partial<StringHelperLimits>;

export type ZodStringWarnOptions = ZodStringOptions & {
  /** Static field identifier, never a value derived from request input. */
  label?: string;
};

export interface ZodStringHelper {
  (options?: ZodStringOptions): z.ZodString;
  warn(options?: ZodStringWarnOptions): z.ZodString;
}

const makeHelper = (helper: StringHelperName): ZodStringHelper => {
  const strict = (options: ZodStringOptions = {}): z.ZodString => {
    const { minLength, maxLength } = getStringHelperLimits(helper, options);
    const { minLength: _min, maxLength: _max, ...params } = options;
    return z.string(params).min(minLength).max(maxLength);
  };

  const warn = ({ label, ...options }: ZodStringWarnOptions = {}): z.ZodString => {
    const { minLength, maxLength } = getStringHelperLimits(helper, options);
    const { minLength: _min, maxLength: _max, ...params } = options;
    return z
      .string(params)
      .min(minLength)
      .superRefine((value) => {
        if (value.length > maxLength) {
          reportStringLengthViolation({
            helper,
            library: 'zod',
            maxLength,
            length: value.length,
            label,
          });
        }
      });
  };

  return Object.assign(strict, { warn });
};

export const savedObjectId = makeHelper('savedObjectId');
export const savedObjectType = makeHelper('savedObjectType');
export const savedObjectVersion = makeHelper('savedObjectVersion');
export const spaceId = makeHelper('spaceId');
export const displayName = makeHelper('displayName');
export const description = makeHelper('description');
export const searchFilter = makeHelper('searchFilter');
export const aggregation = makeHelper('aggregation');
export const querySortField = makeHelper('querySortField');

export type UnboundedStringOptions = Omit<ZodStringOptions, 'maxLength'> & { reason: string };

/** Creates an intentionally unbounded string with a required explanation. */
export const unboundedString = ({
  reason,
  minLength,
  ...params
}: UnboundedStringOptions): z.ZodString => {
  assertUnboundedStringReason(reason);
  const stringSchema = z.string(params);
  return minLength === undefined ? stringSchema : stringSchema.min(minLength);
};
