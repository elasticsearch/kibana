/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { TestProviders } from '../../mock';

import { NO_ALERT_INDEX } from '../../../../common/constants';
import type { ModalInspectProps } from './modal';
import { ModalInspectQuery, formatIndexPatternRequested } from './modal';
import { InputsModelId } from '../../store/inputs/constants';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import { withIndices } from '../../../data_view_manager/hooks/__mocks__/use_data_view';

jest.mock('react-router-dom', () => {
  const original = jest.requireActual('react-router-dom');

  return {
    ...original,
    useLocation: jest.fn().mockReturnValue([{ pathname: '/overview' }]),
  };
});

const defaultIndices = ['auditbeat-*', 'filebeat-*', 'packetbeat-*', 'winlogbeat-*'];

const getRequest = (indices: string[] = defaultIndices) =>
  `{"index": ${JSON.stringify(
    indices
  )},"allowNoIndices": true, "ignoreUnavailable": true, "body": { "aggregations": {"hosts": {"cardinality": {"field": "host.name" } }, "hosts_histogram": {"auto_date_histogram": {"field": "@timestamp","buckets": "6"},"aggs": { "count": {"cardinality": {"field": "host.name" }}}}}, "query": {"bool": {"filter": [{"range": { "@timestamp": {"gte": 1562290224506,"lte": 1562376624506 }}}]}}, "size": 0, "track_total_hits": false}}`;

const request = getRequest();

const response =
  '{"took": 880,"timed_out": false,"_shards": {"total": 26,"successful": 26,"skipped": 0,"failed": 0},"hits": {"max_score": null,"hits": []},"aggregations": {"hosts": {"value": 541},"hosts_histogram": {"buckets": [{"key_as_string": "2019 - 07 - 05T01: 00: 00.000Z", "key": 1562288400000, "doc_count": 1492321, "count": { "value": 105 }}, {"key_as_string": "2019 - 07 - 05T13: 00: 00.000Z", "key": 1562331600000, "doc_count": 2412761, "count": { "value": 453}},{"key_as_string": "2019 - 07 - 06T01: 00: 00.000Z", "key": 1562374800000, "doc_count": 111658, "count": { "value": 15}}],"interval": "12h"}},"status": 200}';

const closeModal = jest.fn();

const defaultProps: ModalInspectProps = {
  closeModal,
  inputId: InputsModelId.timeline,
  request,
  response,
  title: 'My title',
};
const renderModal = (props: ModalInspectProps = defaultProps) => {
  return render(
    <TestProviders>
      <ModalInspectQuery {...props} />
    </TestProviders>
  );
};

describe('Modal Inspect', () => {
  describe('functionality from tab statistics', () => {
    test('should show statistics tab correctly', () => {
      renderModal();

      fireEvent.click(screen.getByTestId('modal-inspect-statistics-tab'));
      expect(screen.getByTestId('modal-inspect-statistics-tab')).toHaveAttribute(
        'aria-selected',
        'true'
      );

      expect(screen.getByTestId('index-pattern-title')).toHaveTextContent('Index pattern');
      expect(screen.getByTestId('index-pattern-description')).toHaveTextContent(
        'auditbeat-*, filebeat-*, packetbeat-*, winlogbeat-*'
      );
      expect(screen.getByTestId('query-time-title')).toHaveTextContent('Query time');

      expect(screen.getByTestId('query-time-description')).toHaveTextContent('880ms');
      expect(screen.getByTestId('request-timestamp-title')).toHaveTextContent('Request timestamp');
    });

    test('should show response Tab content correctly', () => {
      renderModal();

      fireEvent.click(screen.getByTestId('modal-inspect-response-tab'));
      expect(screen.getByTestId('modal-inspect-response-tab')).toHaveAttribute(
        'aria-selected',
        'true'
      );

      const responseTextContent =
        screen.getByTestId('modal-inspect-response-preview').textContent ?? '';
      expect(JSON.parse(responseTextContent)).toMatchObject({
        took: 880,
        timed_out: false,
        _shards: {
          total: 26,
          successful: 26,
          skipped: 0,
          failed: 0,
        },
        hits: {
          max_score: null,
          hits: [],
        },
        aggregations: {
          hosts: {
            value: 541,
          },
          hosts_histogram: {
            buckets: [
              {
                key_as_string: '2019 - 07 - 05T01: 00: 00.000Z',
                key: 1562288400000,
                doc_count: 1492321,
                count: {
                  value: 105,
                },
              },
              {
                key_as_string: '2019 - 07 - 05T13: 00: 00.000Z',
                key: 1562331600000,
                doc_count: 2412761,
                count: {
                  value: 453,
                },
              },
              {
                key_as_string: '2019 - 07 - 06T01: 00: 00.000Z',
                key: 1562374800000,
                doc_count: 111658,
                count: {
                  value: 15,
                },
              },
            ],
            interval: '12h',
          },
        },
        status: 200,
      });
    });

    test('should show request tab correctly', () => {
      renderModal();

      fireEvent.click(screen.getByTestId('modal-inspect-request-tab'));
      expect(screen.getByTestId('modal-inspect-request-tab')).toHaveAttribute(
        'aria-selected',
        'true'
      );

      const requestTextContent =
        screen.getByTestId('modal-inspect-request-preview').textContent ?? '';

      expect(JSON.parse(requestTextContent)).toMatchObject({
        aggregations: {
          hosts: { cardinality: { field: 'host.name' } },
          hosts_histogram: {
            aggs: { count: { cardinality: { field: 'host.name' } } },
            auto_date_histogram: { buckets: '6', field: '@timestamp' },
          },
        },
        query: {
          bool: {
            filter: [{ range: { '@timestamp': { gte: 1562290224506, lte: 1562376624506 } } }],
          },
        },
        size: 0,
        track_total_hits: false,
      });
    });

    test('should request Tab content with esql query correctly', () => {
      const esqlQuery = 'FROM tets-index* | WHERE field IS NOT NULL';
      renderModal({
        ...defaultProps,
        request: JSON.stringify({ index: ['tets-index*'], body: esqlQuery }),
      });

      fireEvent.click(screen.getByTestId('modal-inspect-request-tab'));
      expect(screen.getByTestId('modal-inspect-request-tab')).toHaveAttribute(
        'aria-selected',
        'true'
      );

      const requestTextContent =
        screen.getByTestId('modal-inspect-request-preview').textContent ?? '';

      expect(requestTextContent).toMatch(esqlQuery);
    });

    test('should request Tab content without body correctly', () => {
      const requestWithoutBody = {
        index: ['tets-index*'],
        query: {
          bool: {
            filter: [{ range: { '@timestamp': { gte: 1562290224506, lte: 1562376624506 } } }],
          },
        },
        size: 0,
      };
      const requestString = JSON.stringify(requestWithoutBody, null, 2);
      renderModal({ ...defaultProps, request: requestString });

      fireEvent.click(screen.getByTestId('modal-inspect-request-tab'));
      expect(screen.getByTestId('modal-inspect-request-tab')).toHaveAttribute(
        'aria-selected',
        'true'
      );

      const requestTextContent = screen.getByRole('tabpanel').textContent ?? '';

      expect(requestTextContent).toMatch(requestString);
    });
  });

  describe('events', () => {
    test('should make sure that toggle function has been called when you click on the close button', () => {
      renderModal();

      fireEvent.click(screen.getByTestId('modal-inspect-close'));
      expect(closeModal).toHaveBeenCalled();
    });
  });

  describe('formatIndexPatternRequested', () => {
    test('should return specific messages to NO_ALERT_INDEX if we only have one index and we match the index name `NO_ALERT_INDEX`', () => {
      const expected = formatIndexPatternRequested([NO_ALERT_INDEX]);
      expect(expected).toEqual(<i>{'No alert index found'}</i>);
    });

    test('should ignore NO_ALERT_INDEX if you have more than one indices', () => {
      const expected = formatIndexPatternRequested([NO_ALERT_INDEX, 'indice-1']);
      expect(expected).toEqual('indice-1');
    });

    test('should format indices correctly', () => {
      const expected = formatIndexPatternRequested(['indice-1, indice-2']);
      expect(expected).toEqual('indice-1, indice-2');
    });

    test('should show error when indices array is empty', () => {
      const expected = formatIndexPatternRequested([]);
      expect(expected).toEqual('Sorry about that, something went wrong.');
    });

    test('should show error when indices are Undefined', () => {
      const expected = formatIndexPatternRequested(undefined);
      expect(expected).toEqual('Sorry about that, something went wrong.');
    });
  });

  describe('index pattern messaging', () => {
    test('should show no messaging when all patterns match sourcerer selection', () => {
      jest.mocked(useDataView).mockReturnValue(withIndices(defaultIndices));

      renderModal();

      expect(screen.queryByTestId('not-sourcerer-msg')).toBeNull();
    });
    test('should show not-sourcerer-msg when not all patterns are in sourcerer selection', () => {
      renderModal({
        ...defaultProps,
        request: getRequest(['differentbeat-*']),
      });

      expect(screen.getByTestId('not-sourcerer-msg')).toHaveTextContent(
        'This element has a unique index pattern separate from the data view setting.'
      );
    });
  });
});
