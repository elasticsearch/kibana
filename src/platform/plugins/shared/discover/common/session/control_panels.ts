/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isObject } from 'lodash';
import { ESQL_CONTROL } from '@kbn/controls-constants';
import { convertCamelCasedKeysToSnakeCase } from '@kbn/presentation-publishing';
import type { DiscoverSessionApiTab } from '../../server';

/** Converts the API ES|QL control array to a controlGroupJson string, or undefined when empty. */
export const serializeEsqlControls = (controls: DiscoverSessionApiTab['control_panels']) => {
  if (!controls?.length) {
    return undefined;
  }

  const controlGroup = Object.fromEntries(
    controls.map((control, order) => {
      const { id, type, width, grow, config } = control;

      return [
        id,
        {
          order,
          type,
          ...(width !== undefined && { width }),
          ...(grow !== undefined && { grow }),
          ...config,
        },
      ];
    })
  );

  return JSON.stringify(controlGroup);
};

/** Converts a controlGroupJson string to an ordered API control array, or undefined when empty. */
export const deserializeEsqlControls = (controlGroupJson: string | undefined) => {
  if (!controlGroupJson) {
    return undefined;
  }

  const controls = parseControlGroupJsonEntries(controlGroupJson).map(([id, value]) => {
    const control = convertControlGroupEntryToApi(id, value);

    // Older Discover sessions used this name for ES|QL controls.
    if (control.type === 'esqlControl') {
      control.type = ESQL_CONTROL;
    }

    return control;
  });

  return controls.length > 0 ? controls : undefined;
};

/** Converts a possibly malformed controlGroupJson entry to an API object; the server validates its schema. */
export const convertControlGroupEntryToApi = (id: string, value: unknown) => {
  if (!isRecord(value)) {
    throw new Error('controlGroupJson panels must be JSON objects');
  }

  if (typeof value.type !== 'string') {
    throw new Error('controlGroupJson panels must have a type');
  }

  const { order: _order, type, width, grow, ...config } = value;
  // `convertCamelCasedKeysToSnakeCase` is idempotent, so it is safe to run on non-legacy config too.
  const snakeCasedConfig = convertCamelCasedKeysToSnakeCase(config);

  return {
    id,
    type,
    ...(width !== undefined && { width }),
    ...(grow !== undefined && { grow }),
    config: snakeCasedConfig,
  };
};

/** Returns the control's numeric order, or zero when the order is missing or malformed. */
export const getControlOrder = (control: unknown) =>
  isRecord(control) && typeof control.order === 'number' ? control.order : 0;

/** Checks whether a value is a non-array object. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && !Array.isArray(value);

/** Reads controlGroupJson and sorts its entries without dropping malformed controls. */
const parseControlGroupJsonEntries = (controlGroupJson: string) => {
  const parsed: unknown = JSON.parse(controlGroupJson);

  if (!isRecord(parsed)) {
    throw new Error('controlGroupJson must be a JSON object');
  }

  return Object.entries(parsed).sort(
    ([, first], [, second]) => getControlOrder(first) - getControlOrder(second)
  );
};
