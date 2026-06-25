/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatQuerySchedule } from './format_query_schedule';

describe('formatQuerySchedule', () => {
  describe('interval mode', () => {
    it('should render "{n}s" for an interval schedule', () => {
      expect(formatQuerySchedule({ schedule_type: 'interval', interval: 3600 })).toBe('3600s');
    });

    it('should render the row interval when no schedule_type is set (legacy inherit)', () => {
      expect(formatQuerySchedule({ interval: 60 })).toBe('60s');
    });

    it('should render "0s" when no interval is available', () => {
      expect(formatQuerySchedule({})).toBe('0s');
    });
  });

  describe('rrule mode', () => {
    const startDate = '2024-01-01T00:00:00.000Z';

    it('should render "Daily" for a daily rrule', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          rrule_schedule: { rrule: 'FREQ=DAILY', start_date: startDate },
        })
      ).toBe('Daily');
    });

    it('should render "Every week on ..." for a custom weekly rrule with interval 1', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR',
            start_date: startDate,
          },
        })
      ).toBe('Every week on Sun, Mon, Tue, Wed, Thu, Fri');
    });

    it('should render "Every N weeks on ..." for a custom weekly rrule with interval > 1', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
            start_date: startDate,
          },
        })
      ).toBe('Every 2 weeks on Tue');
    });

    it('should render "Daily" when a weekly rrule omits BYDAY', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          rrule_schedule: { rrule: 'FREQ=WEEKLY;INTERVAL=3', start_date: startDate },
        })
      ).toBe('Daily');
    });

    it('should order weekdays Sunday-first regardless of BYDAY order', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=WEEKLY;BYDAY=FR,MO,SU',
            start_date: startDate,
          },
        })
      ).toBe('Every week on Sun, Mon, Fri');
    });

    it('should fall back to interval text on a missing rrule string', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          interval: 120,
          // @ts-expect-error intentionally missing rrule
          rrule_schedule: { start_date: startDate },
        })
      ).toBe('120s');
    });

    it('should fall back to interval text on an invalid rrule string', () => {
      expect(
        formatQuerySchedule({
          schedule_type: 'rrule',
          interval: 90,
          rrule_schedule: { rrule: 'NOT_A_VALID_RRULE', start_date: startDate },
        })
      ).toBe('90s');
    });
  });
});
