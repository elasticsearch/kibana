/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pins the pack uploader's current behavior: an uploaded pack JSON injects each
 * query's `interval` from the file (or the hardcoded '3600' default). The
 * serializer in `use_pack_query_form` is the downstream defense that strips
 * `interval` for `schedule_type: 'rrule'` packs — exercised separately.
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { ExperimentalFeaturesService } from '../../common/experimental_features_service';
import { allowedExperimentalValues } from '../../../common/experimental_features';

// ---------------------------------------------------------------------------
// Stubs for heavy child components
// ---------------------------------------------------------------------------

jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      application: {
        capabilities: {
          osquery: {
            writeSavedQueries: true,
            readSavedQueries: true,
            writeLiveQueries: true,
            runSavedQueries: true,
          },
        },
      },
    },
  }),
}));

// QueriesField transitively pulls in QueryFlyout / PackQueriesTable via lazy
// children — stub them out so we only render the uploader + field-array shell.
jest.mock('../queries/query_flyout', () => ({
  QueryFlyout: () => <div data-test-subj="query-flyout-stub" />,
}));

jest.mock('../pack_queries_table', () => ({
  PackQueriesTable: ({ data }: { data: unknown[] }) => (
    <div data-test-subj="pack-queries-table">{`rows: ${data.length}`}</div>
  ),
}));

// Capture the onChange callback from OsqueryPackUploader so we can trigger
// an upload from the test without filesystem interaction.
let capturedUploaderOnChange: ((content: Record<string, unknown>, name: string) => void) | null =
  null;

jest.mock('./pack_uploader', () => ({
  OsqueryPackUploader: ({
    onChange,
  }: {
    onChange: (content: Record<string, unknown>, name: string) => void;
  }) => {
    capturedUploaderOnChange = onChange;

    return <div data-test-subj="osquery-pack-uploader">Upload</div>;
  },
}));

jest.mock('../pack_queries_table', () => ({
  PackQueriesTable: () => <div data-test-subj="pack-queries-table">Table</div>,
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { QueriesField } from './queries_field';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  ExperimentalFeaturesService.init({
    experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
  });
});

// Probe that surfaces the live `queries` form-array state out of the provider
// so the test can assert what the uploader actually wrote into RHF — not the
// input literal it was handed.
interface UploadedQueryState {
  id?: string;
  interval?: string | number;
  timeout?: number;
  query?: string;
}
let capturedQueriesState: UploadedQueryState[] = [];
const FormStateProbe: React.FC = () => {
  const queries = useWatch({ name: 'queries' }) as UploadedQueryState[] | undefined;
  capturedQueriesState = queries ?? [];

  return null;
};

// Wrapper that provides FormProvider with a fresh useForm instance matching
// the shape QueriesField reads via useWatch().
const FormWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const methods = useForm<Record<string, unknown>>({
    defaultValues: {
      name: '',
      queries: [],
      schedule_type: undefined,
      interval: undefined,
      rrule_schedule: undefined,
    },
  });

  return (
    <FormProvider {...methods}>
      {children}
      <FormStateProbe />
    </FormProvider>
  );
};

const renderQueriesField = () =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">
        <FormWrapper>
          <QueriesField euiFieldProps={{}} />
        </FormWrapper>
      </IntlProvider>
    </EuiProvider>
  );

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

describe('QueriesField', () => {
  beforeEach(() => {
    capturedUploaderOnChange = null;
    capturedQueriesState = [];
    jest.clearAllMocks();
  });

  describe('pack uploader', () => {
    it('D1: should inject interval onto each uploaded query in RHF form state (serializer is the downstream defense)', () => {
      // The uploader callback (handlePackUpload in queries_field.tsx) maps
      //   `interval: newQuery.interval ?? parsedContent.interval ?? '3600'`
      // onto each query and writes the result into the `queries` form array.
      // The serializer in use_pack_query_form.tsx is the downstream defense
      // that strips `interval` when a query inherits an rrule pack schedule.
      //
      // This asserts the RESULTING RHF state after upload (not the input
      // literal), so it fails if the uploader stops injecting interval.
      renderQueriesField();

      expect(capturedUploaderOnChange).not.toBeNull();

      // Upload a pack JSON with a string interval (survives the uploader's
      // `pickBy(!isEmpty)` filter) and one query with NO interval (must get the
      // hardcoded '3600' fallback). Assert the RHF form array the uploader wrote.
      act(() => {
        capturedUploaderOnChange!(
          {
            queries: {
              'uptime-check': { query: 'select * from uptime;', interval: '120' },
              'fallback-query': { query: 'select 1;' },
            },
          },
          'test-pack'
        );
      });

      const byId = Object.fromEntries(capturedQueriesState.map((q) => [q.id, q]));
      expect(capturedQueriesState).toHaveLength(2);

      // Explicit interval is carried through to form state verbatim.
      expect(byId['uptime-check'].interval).toBe('120');

      // No per-query / pack-level interval → the uploader's '3600' fallback is
      // injected. This is the assertion that fails if the uploader stops
      // injecting interval (the regression we're guarding).
      expect(byId['fallback-query'].interval).toBe('3600');

      // Both uploaded queries preserved their SQL — confirms the array was
      // populated from the uploaded content, not left empty.
      expect(byId['uptime-check'].query).toBe('select * from uptime;');
      expect(byId['fallback-query'].query).toBe('select 1;');
    });
  });
});
