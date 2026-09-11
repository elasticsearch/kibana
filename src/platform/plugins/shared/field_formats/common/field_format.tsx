/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import React from 'react';
import { transform, size, cloneDeep, get, defaults } from 'lodash';
import {
  EMPTY_LABEL,
  getMissingValueLabel,
  MISSING_TOKEN,
  NULL_LABEL,
} from '@kbn/field-formats-common';
import { createCustomFieldFormat } from './converters/custom';
import { asPrettyString, formatReactArray, formatTextArray } from './utils';
import type {
  FieldFormatsGetConfigFn,
  FieldFormatInstanceType,
  TextContextTypeOptions,
  FieldFormatMetaParams,
  FieldFormatParams,
} from './types';
import { getHighlightReact } from './utils/highlight';
import type {
  ReactContextTypeConvert,
  ReactConvertFunction,
  TextContextTypeConvert,
} from './types';
import { emptyValueStyles } from './field_format_styles';

export abstract class FieldFormat {
  /**
   * @property {string} - Field Format Id
   * @static
   * @public
   */
  static id: string;

  /**
   * Hidden field formats can only be accessed directly by id,
   * They won't appear in field format editor UI,
   * But they can be accessed and used from code internally.
   *
   * @property {boolean} -  Is this a hidden field format
   * @static
   * @public
   */
  static hidden: boolean;

  /**
   * @property {string} -  Field Format Title
   * @static
   * @public
   */
  static title: string;

  /**
   * @property {string} - Field Format Type
   * @internal
   */
  static fieldType: string | string[];

  /**
   * Single-value React converter. Override this in subclasses to customize React rendering
   * for individual (non-array) values. The public `convertToReact` method handles array
   * wrapping automatically and delegates here for scalar values.
   *
   * When defined, you are responsible for missing-value and highlight handling.
   *
   * @protected
   */
  protected reactConvert: ReactConvertFunction | undefined;

  /**
   * React-based converter. Handles arrays and delegates single values to `reactConvert`
   * (if overridden) or the default text/highlight logic.
   *
   * Do NOT override this method in subclasses — override `reactConvert` instead so that
   * array handling is always applied correctly.
   *
   * @public
   */
  convertToReact: ReactContextTypeConvert = (val, options) => {
    // Arrays: bracket/comma rendering with React nodes.
    // Single-element arrays and empty arrays are passed through without brackets.
    if (Array.isArray(val)) {
      return formatReactArray(val, (v) => this.convertToReact(v, options));
    }

    if (this.reactConvert) {
      return this.reactConvert(val, options);
    }

    const missing = this.checkForMissingValueReact(val);
    if (missing) return missing;

    const formatted = this.convertToText(val, options);
    const fieldName = options?.field?.name;
    return getHighlightReact(formatted, fieldName, options?.hit);
  };

  /**
   * Plain-text converter for a single scalar value. Override this in subclasses.
   * Arrays are handled by the base class before this method is called.
   *
   * @protected
   */
  protected textConvert: TextContextTypeConvert | undefined;

  /**
   * Convert a raw value to a formatted string.
   * Handles arrays automatically (JSON-encodes them).
   * @param  {unknown} value
   * @param  {TextContextTypeOptions} [options]
   * @return {string} - the formatted string
   * @public
   */
  convertToText(value: unknown, options?: TextContextTypeOptions): string {
    if (Array.isArray(value)) {
      return formatTextArray(value, (v) => this.convertToText(v, options));
    }
    if (this.textConvert) {
      return this.textConvert(value, options);
    }
    return asPrettyString(value, options);
  }

  /**
   * @property {Function} - ref to child class
   * @internal
   */
  public type = this.constructor as typeof FieldFormat;
  public allowsNumericalAggregations?: boolean;

  protected readonly _params: FieldFormatParams & FieldFormatMetaParams;
  protected getConfig: FieldFormatsGetConfigFn | undefined;

  constructor(
    _params: FieldFormatParams & FieldFormatMetaParams = {},
    getConfig?: FieldFormatsGetConfigFn
  ) {
    this._params = _params;

    if (getConfig) {
      this.getConfig = getConfig;
    }
  }

  /**
   * Get parameter defaults
   * @return {object} - parameter defaults
   * @public
   */
  getParamDefaults(): FieldFormatParams {
    return {};
  }

  /**
   * Get the value of a param. This value may be a default value.
   *
   * @param  {string} name - the param name to fetch
   * @return {any} TODO: https://github.com/elastic/kibana/issues/108158
   * @public
   */
  param(name: string): any {
    const val = get(this._params, name);

    if (val || val === false || val === 0) {
      // truthy, false, or 0 are fine
      // '', NaN, null, undefined, etc are not
      return val;
    }

    return get(this.getParamDefaults(), name);
  }

  /**
   * Get all of the params in a single object
   * @return {object}
   * @public
   */
  params(): FieldFormatParams & FieldFormatMetaParams {
    return cloneDeep(defaults({}, this._params, this.getParamDefaults()));
  }

  /**
   * Serialize this format to a simple POJO, with only the params
   * that are not default
   *
   * @return {object}
   * @public
   */
  toJSON() {
    const id = this.type.id;
    const defaultsParams = this.getParamDefaults() || {};

    const params = transform(
      this._params,
      (uniqParams: FieldFormatParams & FieldFormatMetaParams, val, param: string) => {
        if (param === 'parsedUrl') return;
        if (param && val !== get(defaultsParams, param)) {
          uniqParams[param] = val;
        }
      },
      {}
    );

    return {
      id,
      params: size(params) ? params : undefined,
    };
  }

  static from(convertFn: TextContextTypeConvert): FieldFormatInstanceType {
    return createCustomFieldFormat(convertFn);
  }

  static isInstanceOfFieldFormat(fieldFormat: unknown): fieldFormat is FieldFormat {
    return Boolean(
      fieldFormat &&
        typeof fieldFormat === 'object' &&
        (typeof (fieldFormat as FieldFormat).convertToText === 'function' ||
          typeof (fieldFormat as FieldFormat).convertToReact === 'function')
    );
  }

  protected checkForMissingValueText(val: unknown): string | void {
    return getMissingValueLabel(val);
  }

  protected checkForMissingValueReact(val: unknown): ReactNode | undefined {
    if (val === '') {
      return <span css={emptyValueStyles}>{EMPTY_LABEL}</span>;
    }
    if (val == null || val === MISSING_TOKEN) {
      return <span css={emptyValueStyles}>{NULL_LABEL}</span>;
    }
  }
}
