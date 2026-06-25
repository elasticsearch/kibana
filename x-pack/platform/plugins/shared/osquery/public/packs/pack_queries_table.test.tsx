/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';

import { PackQueriesTable } from './pack_queries_table';
import type { PackQueryFormData } from './queries/use_pack_query_form';
import { ExperimentalFeaturesService } from '../common/experimental_features_service';
import { allowedExperimentalValues } from '../../common/experimental_features';

const setFlag = (rruleScheduling: boolean) =>
  ExperimentalFeaturesService.init({
    experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling },
  });

const baseQuery = (overrides: Partial<PackQueryFormData> = {}): PackQueryFormData => ({
  id: 'query-1',
  query: 'select * from uptime;',
  interval: 3600,
  ecs_mapping: {},
  ...overrides,
});

const renderTable = (props: Partial<React.ComponentProps<typeof PackQueriesTable>>) =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">
        <PackQueriesTable data={[]} isReadOnly {...props} />
      </IntlProvider>
    </EuiProvider>
  );

describe('PackQueriesTable', () => {
  describe('flag off (legacy interval column)', () => {
    beforeEach(() => setFlag(false));

    it('renders the "Interval (s)" column with the raw interval value', () => {
      renderTable({ data: [baseQuery({ interval: 3600 })] });

      expect(screen.getByText('Interval (s)')).toBeInTheDocument();
      expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
      expect(screen.getByText('3600')).toBeInTheDocument();
    });
  });

  describe('flag on (Schedule column)', () => {
    beforeEach(() => setFlag(true));
    afterEach(() => setFlag(false));

    it('renders the "Schedule" column header', () => {
      renderTable({ data: [baseQuery()] });

      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.queryByText('Interval (s)')).not.toBeInTheDocument();
    });

    it('renders interval text for an interval-mode override', () => {
      renderTable({
        data: [baseQuery({ schedule_type: 'interval', interval: 1800 })],
      });

      expect(screen.getByText('1800s')).toBeInTheDocument();
    });

    it('renders "Daily" for a daily rrule override', () => {
      renderTable({
        data: [
          baseQuery({
            schedule_type: 'rrule',
            rrule_schedule: {
              rrule: 'FREQ=DAILY',
              start_date: '2024-01-01T00:00:00.000Z',
            },
          }),
        ],
      });

      expect(screen.getByText('Daily')).toBeInTheDocument();
    });

    it('renders custom weekly text for a weekly rrule override', () => {
      renderTable({
        data: [
          baseQuery({
            schedule_type: 'rrule',
            rrule_schedule: {
              rrule: 'FREQ=WEEKLY;BYDAY=TU',
              start_date: '2024-01-01T00:00:00.000Z',
            },
          }),
        ],
      });

      expect(screen.getByText('Every week on Tue')).toBeInTheDocument();
    });

    it('renders the inherited pack schedule for a row without an override', () => {
      renderTable({
        data: [baseQuery({ interval: 3600 })],
        packSchedule: {
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=DAILY',
            start_date: '2024-01-01T00:00:00.000Z',
          },
        },
      });

      expect(screen.getByText('Daily')).toBeInTheDocument();
    });
  });
});
