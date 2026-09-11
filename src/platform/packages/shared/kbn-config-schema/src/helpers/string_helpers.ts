/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  assertUnboundedStringReason,
  getStringHelperLimits,
  reportStringLengthViolation,
} from '@kbn/schema-string-helpers';
import type { StringHelperName } from '@kbn/schema-string-helpers';
import type { StringOptions } from '../types/string_type';
import { StringType } from '../types/string_type';
import type { Type } from '../types/type';

export type StringWarnOptions = StringOptions & {
  /** Static field identifier, never a value derived from request input. */
  label?: string;
};

export interface SchemaHelper {
  (options?: StringOptions): Type<string>;
  warn(options?: StringWarnOptions): Type<string>;
}

const makeHelper = (helper: StringHelperName): SchemaHelper => {
  const strict = (options: StringOptions = {}): Type<string> =>
    new StringType({ ...options, ...getStringHelperLimits(helper, options) });

  const warn = ({ label, validate, ...options }: StringWarnOptions = {}): Type<string> => {
    const { minLength, maxLength } = getStringHelperLimits(helper, options);
    return new StringType({
      ...options,
      minLength,
      maxLength: undefined,
      validate: (value) => {
        if (value.length > maxLength) {
          reportStringLengthViolation({
            helper,
            library: 'config-schema',
            maxLength,
            length: value.length,
            label,
          });
        }
        return validate?.(value);
      },
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

export type UnboundedStringOptions = Omit<StringOptions, 'maxLength'> & { reason: string };

/** Creates an intentionally unbounded string with a required explanation. */
export const unboundedString = ({ reason, ...options }: UnboundedStringOptions): Type<string> => {
  assertUnboundedStringReason(reason);
  return new StringType({ ...options, maxLength: undefined });
};
