/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { buildSnoozeSummary } from './build_snooze_summary';
import { SNOOZE_DATE_DISPLAY_FORMAT } from '../components/constants';
import {
  INDEFINITELY_MESSAGE,
  getUnsnoozeOnDateMessage,
  getUnsnoozeIfConditionsMessage,
  getUnsnoozeIfConditionsOrOnDateMessage,
} from '../components/translations';

const EXPIRES_AT = '2026-06-10T12:00:00.000Z';
const formattedDate = () => moment(EXPIRES_AT).format(SNOOZE_DATE_DISPLAY_FORMAT);

describe('buildSnoozeSummary', () => {
  describe('indefinitely snoozed', () => {
    it('returns indefinitely message when isMuted is true', () => {
      expect(buildSnoozeSummary({ isMuted: true })).toBe(INDEFINITELY_MESSAGE);
    });

    it('returns indefinitely message when isMuted is true even if expiresAt is set', () => {
      expect(buildSnoozeSummary({ isMuted: true, expiresAt: EXPIRES_AT })).toBe(
        INDEFINITELY_MESSAGE
      );
    });

    it('returns indefinitely message when expiresAt is null and no conditions', () => {
      expect(buildSnoozeSummary({ expiresAt: null })).toBe(INDEFINITELY_MESSAGE);
    });

    it('returns indefinitely message when nothing is provided', () => {
      expect(buildSnoozeSummary({})).toBe(INDEFINITELY_MESSAGE);
    });
  });

  describe('time-based snooze (no conditions)', () => {
    it('returns "will unsnooze on {date}" for a date expiry with no conditions', () => {
      expect(buildSnoozeSummary({ expiresAt: EXPIRES_AT })).toBe(
        getUnsnoozeOnDateMessage(formattedDate())
      );
    });

    it('formats the date using SNOOZE_DATE_DISPLAY_FORMAT', () => {
      const result = buildSnoozeSummary({ expiresAt: EXPIRES_AT });
      expect(result).toContain('Jun 10, 2026 at');
    });
  });

  describe('condition-based snooze (no time expiry)', () => {
    it('returns "will unsnooze if {condition}" for a single severity_change condition', () => {
      expect(buildSnoozeSummary({ conditions: [{ type: 'severity_change' }] })).toBe(
        getUnsnoozeIfConditionsMessage('severity is changed')
      );
    });

    it('returns "will unsnooze if {condition}" for a single field_change condition', () => {
      expect(
        buildSnoozeSummary({ conditions: [{ type: 'field_change', field: 'host.name' }] })
      ).toBe(getUnsnoozeIfConditionsMessage('field "host.name" is changed'));
    });

    it('returns "will unsnooze if {condition}" for a single severity_equals condition', () => {
      expect(
        buildSnoozeSummary({ conditions: [{ type: 'severity_equals', value: 'critical' }] })
      ).toBe(getUnsnoozeIfConditionsMessage('severity equals critical'));
    });

    it('joins multiple conditions with "or" when conditionOperator is "any"', () => {
      expect(
        buildSnoozeSummary({
          conditions: [{ type: 'severity_change' }, { type: 'field_change', field: 'host.name' }],
          conditionOperator: 'any',
        })
      ).toBe(getUnsnoozeIfConditionsMessage('severity is changed or field "host.name" is changed'));
    });

    it('joins multiple conditions with "and" when conditionOperator is "all"', () => {
      expect(
        buildSnoozeSummary({
          conditions: [{ type: 'severity_equals', value: 'critical' }, { type: 'severity_change' }],
          conditionOperator: 'all',
        })
      ).toBe(getUnsnoozeIfConditionsMessage('severity equals critical and severity is changed'));
    });

    it('defaults to "or" connector when conditionOperator is not set', () => {
      expect(
        buildSnoozeSummary({
          conditions: [{ type: 'severity_change' }, { type: 'severity_equals', value: 'high' }],
        })
      ).toBe(getUnsnoozeIfConditionsMessage('severity is changed or severity equals high'));
    });

    it('returns conditions-only message when expiresAt is null but conditions exist', () => {
      expect(
        buildSnoozeSummary({
          expiresAt: null,
          conditions: [{ type: 'severity_change' }],
          conditionOperator: 'any',
        })
      ).toBe(getUnsnoozeIfConditionsMessage('severity is changed'));
    });
  });

  describe('time + condition snooze', () => {
    it('returns "will unsnooze if {conditions}, OR on {date}" with any operator', () => {
      expect(
        buildSnoozeSummary({
          expiresAt: EXPIRES_AT,
          conditions: [{ type: 'severity_change' }],
          conditionOperator: 'any',
        })
      ).toBe(getUnsnoozeIfConditionsOrOnDateMessage('severity is changed', formattedDate()));
    });

    it('returns "will unsnooze if {conditions}, OR on {date}" with all operator', () => {
      expect(
        buildSnoozeSummary({
          expiresAt: EXPIRES_AT,
          conditions: [
            { type: 'field_change', field: 'host.name' },
            { type: 'severity_equals', value: 'critical' },
          ],
          conditionOperator: 'all',
        })
      ).toBe(
        getUnsnoozeIfConditionsOrOnDateMessage(
          'field "host.name" is changed and severity equals critical',
          formattedDate()
        )
      );
    });
  });
});
