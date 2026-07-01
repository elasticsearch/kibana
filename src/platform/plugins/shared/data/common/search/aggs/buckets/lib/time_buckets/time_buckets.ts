/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Assign } from 'utility-types';
import { isString, isObject as isObjectLodash, isPlainObject, sortBy } from 'lodash';
import type { Moment } from 'moment';
import moment from 'moment';

import type { Unit } from '@kbn/datemath';
import { parseInterval, splitStringInterval } from '../../../utils';
import type { TimeRangeBounds } from '../../../../../query';
import { calcAutoIntervalLessThan, calcAutoIntervalNear } from './calc_auto_interval';
import type { EsInterval } from './calc_es_interval';
import {
  convertDurationToNormalizedEsInterval,
  convertIntervalToEsInterval,
  getPreciseDurationDescription,
} from './calc_es_interval';
import { autoInterval } from '../../_interval_options';

export interface TimeBucketsInterval extends moment.Duration {
  // TODO double-check whether all of these are needed
  description: string;
  esValue: EsInterval['value'];
  esUnit: EsInterval['unit'];
  expression: EsInterval['expression'];
  preScaled?: TimeBucketsInterval;
  scale?: number;
  scaled?: boolean;
}

function isObject(o: any): o is Record<string, any> {
  return isObjectLodash(o);
}

function isValidMoment(m: any): boolean {
  return m && 'isValid' in m && m.isValid();
}

function isDurationInterval(i: any): i is moment.Duration {
  return moment.isDuration(i) && Boolean(+i);
}

export interface TimeBucketsConfig extends Record<string, unknown> {
  'histogram:maxBars': number;
  'histogram:barTarget': number;
  dateFormat: string;
  'dateFormat:scaled': string[][];
}

/**
 * Helper class for wrapping the concept of an "Interval",
 * which describes a timespan that will separate moments.
 *
 * @param {state} object - one of ""
 * @param {[type]} display [description]
 */
export class TimeBuckets {
  private _timeBucketConfig: TimeBucketsConfig;
  private _lb: TimeRangeBounds['min'];
  private _ub: TimeRangeBounds['max'];
  private _originalInterval: string | null = null;
  private _i?: moment.Duration | 'auto';

  // because other parts of Kibana arbitrarily add properties
  [key: string]: unknown;

  constructor(timeBucketConfig: TimeBucketsConfig) {
    this._timeBucketConfig = timeBucketConfig;
  }

  /**
   * Get a moment duration object representing
   * the distance between the bounds, if the bounds
   * are set.
   *
   * @return {moment.duration|undefined}
   */
  private getDuration(): moment.Duration | undefined {
    if (this._ub === undefined || this._lb === undefined || !this.hasBounds()) {
      return;
    }
    const difference = this._ub.valueOf() - this._lb.valueOf();
    return moment.duration(difference, 'ms');
  }

  /**
   * Set the bounds that these buckets are expected to cover.
   * This is required to support interval "auto" as well
   * as interval scaling.
   *
   * @param {object} input - an object with properties min and max,
   *                       representing the edges for the time span
   *                       we should cover
   *
   * @returns {undefined}
   */
  setBounds(input?: TimeRangeBounds | TimeRangeBounds[]) {
    if (!input) return this.clearBounds();

    let bounds;
    if (isPlainObject(input) && !Array.isArray(input)) {
      // accept the response from timefilter.getActiveBounds()
      bounds = [input.min, input.max];
    } else {
      bounds = Array.isArray(input) ? input : [];
    }

    const moments: Moment[] = sortBy(bounds, Number) as Moment[];

    const valid = moments.length === 2 && moments.every(isValidMoment);
    if (!valid) {
      this.clearBounds();
      throw new Error('invalid bounds set: ' + input);
    }

    this._lb = moments.shift() as any;
    this._ub = moments.pop() as any;

    const duration = this.getDuration();
    if (!duration || duration.asSeconds() < 0) {
      throw new TypeError('Intervals must be positive');
    }
  }

  /**
   * Clear the stored bounds
   *
   * @return {undefined}
   */
  clearBounds() {
    this._lb = this._ub = undefined;
  }

  /**
   * Check to see if we have received bounds yet
   *
   * @return {Boolean}
   */
  hasBounds(): boolean {
    return isValidMoment(this._ub) && isValidMoment(this._lb);
  }

  /**
   * Return the current bounds, if we have any.
   *
   * THIS DOES NOT CLONE THE BOUNDS, so editing them
   * may have unexpected side-effects. Always
   * call bounds.min.clone() before editing
   *
   * @return {object|undefined} - If bounds are not defined, this
   *                      returns undefined, else it returns the bounds
   *                      for these buckets. This object has two props,
   *                      min and max. Each property will be a moment()
   *                      object
   *
   */
  getBounds(): TimeRangeBounds | undefined {
    if (!this.hasBounds()) return;
    return {
      min: this._lb,
      max: this._ub,
    };
  }

  /**
   * Update the interval at which buckets should be
   * generated.
   *
   * Input can be one of the following:
   *  - Any object from src/legacy/ui/agg_types.js
   *  - "auto"
   *  - Pass a valid moment unit
   *
   * @param {object|string|moment.duration} input - see desc
   */
  setInterval(input: null | string | Record<string, any>) {
    this._originalInterval = null;
    this._i = isObject(input) ? input.val : input;

    if (!this._i || this._i === autoInterval) {
      this._i = autoInterval;
      return;
    }

    if (isString(this._i)) {
      const parsedInterval = parseInterval(this._i);

      if (isDurationInterval(parsedInterval)) {
        this._originalInterval = this._i;
        this._i = parsedInterval;
      }
    }

    if (!isDurationInterval(this._i)) {
      throw new TypeError('"' + this._i + '" is not a valid interval.');
    }
  }

  /**
   * Get the interval for the buckets. If the
   * number of buckets created by the interval set
   * is larger than config:histogram:maxBars then the
   * interval will be scaled up. If the number of buckets
   * created is less than one, the interval is scaled back.
   *
   * The interval object returned is a moment.duration
   * object that has been decorated with the following
   * properties.
   *
   * interval.description: a text description of the interval.
   *   designed to be used list "field per {{ desc }}".
   *     - "minute"
   *     - "10 days"
   *     - "3 years"
   *
   * interval.expression: the elasticsearch expression that creates this
   *   interval. If the interval does not properly form an elasticsearch
   *   expression it will be forced into one.
   *
   * interval.scaled: the interval was adjusted to
   *   accommodate the maxBars setting.
   *
   * interval.scale: the number that y-values should be
   *   multiplied by
   */
  getInterval(useNormalizedEsInterval = true): TimeBucketsInterval {
    const duration = this.getDuration();
    const parsedInterval = isDurationInterval(this._i)
      ? this._i
      : calcAutoIntervalNear(this._timeBucketConfig['histogram:barTarget'], Number(duration));

    // check to see if the interval should be scaled, and scale it if so
    const maybeScaleInterval = (interval: moment.Duration) => {
      if (!this.hasBounds() || !duration) {
        return interval;
      }

      const maxLength: number = this._timeBucketConfig['histogram:maxBars'];
      const minInterval = calcAutoIntervalLessThan(maxLength, Number(duration));

      let scaled;

      if (interval < minInterval) {
        scaled = minInterval;
      } else {
        return interval;
      }

      interval = decorateInterval(interval);
      return Object.assign(scaled, {
        preScaled: interval,
        scale: Number(interval) / Number(scaled),
        scaled: true,
      });
    };

    // append some TimeBuckets specific props to the interval
    const decorateInterval = (
      interval: Assign<moment.Duration, { scaled?: boolean }>
    ): TimeBucketsInterval => {
      let originalUnit: Unit | undefined;

      if (!interval.scaled && this._originalInterval) {
        originalUnit = splitStringInterval(this._originalInterval!)?.unit;
      }

      const esInterval =
        useNormalizedEsInterval || !this._originalInterval
          ? convertDurationToNormalizedEsInterval(interval, originalUnit)
          : convertIntervalToEsInterval(this._originalInterval);

      const prettyUnits = moment.normalizeUnits(esInterval.unit) as moment.unitOfTime.Base;
      const durationDescription = getPreciseDurationDescription(esInterval.value, prettyUnits);

      return Object.assign(interval, {
        description: durationDescription,
        esValue: esInterval.value,
        esUnit: esInterval.unit,
        expression: esInterval.expression,
      });
    };
    return decorateInterval(
      useNormalizedEsInterval ? maybeScaleInterval(parsedInterval) : parsedInterval
    );
  }

  /**
   * Get a date format string that will represent dates that
   * progress at our interval.
   *
   * Since our interval can be as small as 1ms, the default
   * date format is usually way too much. with `dateFormat:scaled`
   * users can modify how dates are formatted within series
   * produced by TimeBuckets
   *
   * @return {string}
   */
  getScaledDateFormat() {
    const interval = this.getInterval();
    const rules = this._timeBucketConfig['dateFormat:scaled'];

    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (!rule[0] || (interval && interval >= moment.duration(rule[0]))) {
        return rule[1];
      }
    }

    return this._timeBucketConfig.dateFormat;
  }
}
