/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { screen } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { DataView } from '@kbn/data-views-plugin/public';
import React from 'react';
import { DocViewerObsTracesGenAi } from '.';
import { useGenAiData } from './use_genai_data';

jest.mock('./use_genai_data', () => ({
  useGenAiData: jest.fn(),
}));

jest.mock('@kbn/apm-ui-shared', () => ({
  GenAiTab: () => <div data-test-subj="mockGenAiTab" />,
}));

jest.mock('./genai_details_table', () => ({
  GenAiDetailsTable: () => <div data-test-subj="mockGenAiDetailsTable" />,
  hasGenAiDetailFields: () => false,
}));

const HINT = 'unifiedDocViewerObsTracesGenAiMetadataHint';
const INDEX_PATTERN = 'traces-apm*,traces-*.otel-*';

const emptyConversation = {
  inputMessages: [],
  outputMessages: [],
  systemInstructions: undefined,
  requestParams: {},
  response: {},
};

function buildHit({ _id, _index }: { _id?: string; _index?: string }): DataTableRecord {
  return {
    id: _id ?? 'row-1',
    raw: { _id, _index },
    flattened: {},
  } as unknown as DataTableRecord;
}

function buildDataView(indexPattern = INDEX_PATTERN): DataView {
  return { getIndexPattern: () => indexPattern } as unknown as DataView;
}

function renderTab({
  hit,
  textBasedHits,
  genAi = emptyConversation,
  unrecoverableLongFields = false,
  dataView = buildDataView(),
}: {
  hit: DataTableRecord;
  textBasedHits?: DataTableRecord[];
  genAi?: unknown;
  unrecoverableLongFields?: boolean;
  dataView?: DataView;
}) {
  (useGenAiData as jest.Mock).mockReturnValue({
    genAi,
    isGenAiSpan: true,
    loading: false,
    unrecoverableLongFields,
  });

  return renderWithI18n(
    <DocViewerObsTracesGenAi
      hit={hit}
      dataView={dataView}
      textBasedHits={textBasedHits}
      columns={[]}
    />
  );
}

describe('DocViewerObsTracesGenAi', () => {
  beforeEach(() => {
    (useGenAiData as jest.Mock).mockReset();
  });

  it('passes isEsqlMode to the hook when textBasedHits is an array', () => {
    const hit = buildHit({});
    renderTab({ hit, textBasedHits: [] });

    expect(useGenAiData).toHaveBeenCalledWith({
      hit,
      isEsqlMode: true,
      indexPattern: INDEX_PATTERN,
    });
  });

  it('passes isEsqlMode false to the hook in DSL mode', () => {
    const hit = buildHit({ _id: 'doc-1', _index: 'traces-otel' });
    renderTab({ hit });

    expect(useGenAiData).toHaveBeenCalledWith({
      hit,
      isEsqlMode: false,
      indexPattern: INDEX_PATTERN,
    });
  });

  it('hints at METADATA when long fields cannot be recovered and no conversation rendered', () => {
    renderTab({ hit: buildHit({}), textBasedHits: [], unrecoverableLongFields: true });

    expect(screen.getByTestId(HINT)).toBeInTheDocument();
  });

  it('does not hint when the long fields are recoverable', () => {
    renderTab({
      hit: buildHit({ _id: 'doc-1', _index: 'traces-otel' }),
      textBasedHits: [],
      unrecoverableLongFields: false,
    });

    expect(screen.queryByTestId(HINT)).not.toBeInTheDocument();
  });

  it('keeps the tab rendered while long messages are being recovered', () => {
    // Recovery only affects the conversation, so replacing the whole tab with a
    // skeleton would hide metadata that is already available.
    (useGenAiData as jest.Mock).mockReturnValue({
      genAi: emptyConversation,
      isGenAiSpan: true,
      loading: true,
      unrecoverableLongFields: false,
    });

    renderWithI18n(
      <DocViewerObsTracesGenAi
        hit={buildHit({ _id: 'doc-1', _index: 'traces-otel' })}
        dataView={buildDataView()}
        columns={[]}
      />
    );

    expect(screen.getByTestId('unifiedDocViewerObsTracesGenAiLoading')).toBeInTheDocument();
    expect(screen.getByTestId('unifiedDocViewerObsTracesGenAi')).toBeInTheDocument();
    expect(screen.getByTestId('mockGenAiTab')).toBeInTheDocument();
  });

  it('renders nothing for a document without gen_ai data', () => {
    (useGenAiData as jest.Mock).mockReturnValue({
      genAi: undefined,
      isGenAiSpan: false,
      loading: false,
    });

    renderWithI18n(
      <DocViewerObsTracesGenAi
        hit={buildHit({ _id: 'doc-1', _index: 'traces-otel' })}
        dataView={buildDataView()}
        columns={[]}
      />
    );

    expect(screen.queryByTestId('unifiedDocViewerObsTracesGenAi')).not.toBeInTheDocument();
    expect(screen.queryByTestId(HINT)).not.toBeInTheDocument();
  });

  it('still hints when a partial conversation rendered', () => {
    // `ignore_above` drops individual array elements, so a conversation can
    // render and still be truncated. Suppressing the hint here would leave the
    // user with silently incomplete content.
    renderTab({
      hit: buildHit({}),
      textBasedHits: [],
      unrecoverableLongFields: true,
      genAi: {
        ...emptyConversation,
        inputMessages: [{ role: 'system', content: 'be brief' }],
      },
    });

    expect(screen.getByTestId(HINT)).toBeInTheDocument();
  });
});
