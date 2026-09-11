/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, waitFor } from '@testing-library/react';
import { GEN_AI_LONG_MESSAGE_FIELDS } from '@kbn/apm-ui-shared';
import type { DataTableRecord } from '@kbn/discover-utils';
import { of } from 'rxjs';
import { useGenAiData } from './use_genai_data';
import { getUnifiedDocViewerServices } from '../../../../plugin';

jest.mock('../../../../plugin', () => ({
  getUnifiedDocViewerServices: jest.fn(),
}));

const INPUT_MESSAGES_FIELD = 'attributes.gen_ai.input.messages';
const mockSearch = jest.fn();

(getUnifiedDocViewerServices as jest.Mock).mockReturnValue({
  data: {
    search: {
      search: mockSearch,
    },
  },
});

const OUTPUT_MESSAGES_FIELD = 'attributes.gen_ai.output.messages';

function buildHit({
  flattened = {},
  _source,
  _ignored,
  _id = 'doc-1',
  _index = 'traces-otel',
}: {
  flattened?: Record<string, unknown>;
  _source?: Record<string, unknown>;
  // Loose on purpose: ES|QL returns `_ignored` as a bare string or null.
  _ignored?: string[] | string | null;
  // `null` omits the field; `undefined` would hit the default above.
  _id?: string | null;
  _index?: string | null;
}): DataTableRecord {
  return {
    id: _id,
    raw: {
      _id: _id ?? undefined,
      _index: _index ?? undefined,
      _source,
      // Spread so an omitted `_ignored` leaves the key absent: ES|QL rows only
      // carry it when the query asked for it, and the hook checks `in`.
      ...(_ignored === undefined ? {} : { _ignored }),
    },
    flattened,
  } as unknown as DataTableRecord;
}

describe('useGenAiData', () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it('returns no GenAI data for a document without gen_ai fields', () => {
    const { result } = renderHook(() =>
      useGenAiData({ hit: buildHit({ flattened: { 'service.name': ['my-svc'] } }) })
    );

    expect(result.current.isGenAiSpan).toBe(false);
    expect(result.current.genAi).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('handles null-valued gen_ai fields without crashing or fetching (DSL null-padded records)', () => {
    // Regression for the doc viewer crash: Discover records carry null for
    // absent fields; message parsing must not throw and no _source fetch
    // should be triggered. In DSL mode `_ignored` is authoritative (ES always
    // returns it on the hit), so its absence proves nothing was dropped.
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            [INPUT_MESSAGES_FIELD]: null,
            'attributes.gen_ai.output.messages': null,
            'attributes.gen_ai.system_instructions': null,
            'attributes.gen_ai.operation.name': ['chat'],
            'attributes.gen_ai.request.model': ['gpt-4o'],
            'attributes.gen_ai.usage.input_tokens': [1100],
            'attributes.gen_ai.usage.output_tokens': [420],
          },
        }),
      })
    );

    expect(result.current.isGenAiSpan).toBe(true);
    expect(result.current.genAi?.inputMessages).toEqual([]);
    expect(result.current.genAi?.outputMessages).toEqual([]);
    expect(result.current.genAi?.inputTokens).toBe(1100);
    expect(result.current.loading).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns no GenAI data when all gen_ai keys are null-valued', () => {
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { [INPUT_MESSAGES_FIELD]: null, 'attributes.gen_ai.request.model': null },
        }),
      })
    );

    expect(result.current.isGenAiSpan).toBe(false);
    expect(result.current.genAi).toBeUndefined();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('derives fields from flattened values without fetching when nothing was ignored', () => {
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: ['{"role":"user","content":"hi"}'],
          },
        }),
      })
    );

    expect(result.current.isGenAiSpan).toBe(true);
    expect(result.current.genAi?.requestModel).toBe('gpt-4o');
    expect(result.current.genAi?.inputMessages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(result.current.loading).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('merges an ignored long message from raw._source without fetching', () => {
    const longMessage = '{"role":"user","content":"' + 'x'.repeat(2000) + '"}';
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: [INPUT_MESSAGES_FIELD],
          _source: { attributes: { 'gen_ai.input.messages': [longMessage] } },
        }),
      })
    );

    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
    expect(result.current.loading).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('fetches _source for ignored messages when the record has no _source', async () => {
    const longMessage = '{"role":"user","content":"' + 'y'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: {
            hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }],
          },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: [INPUT_MESSAGES_FIELD],
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });

  it('renders gracefully when the ignored message cannot be recovered', async () => {
    mockSearch.mockReturnValue(of({ rawResponse: { hits: { hits: [] } } }));

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: [INPUT_MESSAGES_FIELD],
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isGenAiSpan).toBe(true);
    expect(result.current.genAi?.requestModel).toBe('gpt-4o');
    expect(result.current.genAi?.inputMessages).toEqual([]);
  });

  it('recovers a partially indexed multi-valued message array', async () => {
    // ignore_above drops only the over-long elements, so the indexed value is a
    // non-null partial array that the `== null` check cannot catch.
    const shortMessage = '{"role":"system","content":"be brief"}';
    const longMessage = '{"role":"user","content":"' + 'z'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: {
            hits: [
              { _source: { attributes: { 'gen_ai.input.messages': [shortMessage, longMessage] } } },
            ],
          },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: [shortMessage],
          },
          _ignored: [INPUT_MESSAGES_FIELD],
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages).toHaveLength(2);
    expect(result.current.genAi?.inputMessages[1].content).toHaveLength(2000);
  });

  it('recovers when _ignored names the container instead of the leaf field', async () => {
    const longMessage = '{"role":"user","content":"' + 'c'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: { hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }] },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: ['attributes'],
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });

  it('does not throw when _ignored arrives as a bare string (ES|QL shape)', async () => {
    // Without castArray the prefix `.some()` check would throw on a string.
    const longMessage = '{"role":"user","content":"' + 's'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: { hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }] },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: INPUT_MESSAGES_FIELD,
        }),
        isEsqlMode: true,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });

  it('treats a null _ignored as empty rather than [null]', () => {
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: ['{"role":"user","content":"hi"}'],
          },
          _ignored: null,
        }),
      })
    );

    expect(result.current.genAi?.inputMessages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('fetches in ES|QL mode when messages are absent and _ignored was not requested', async () => {
    const longMessage = '{"role":"user","content":"' + 'e'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: { hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }] },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: null,
            [OUTPUT_MESSAGES_FIELD]: null,
          },
        }),
        isEsqlMode: true,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });

  it('recovers a partial array in ES|QL mode when _ignored was not requested', async () => {
    // A present-but-partial array cannot be assumed complete without
    // `_ignored`, so it must still be refetched and replaced wholesale.
    const shortMessage = '{"role":"system","content":"be brief"}';
    const longMessage = '{"role":"user","content":"' + 'q'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: {
            hits: [
              { _source: { attributes: { 'gen_ai.input.messages': [shortMessage, longMessage] } } },
            ],
          },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: [shortMessage],
          },
        }),
        isEsqlMode: true,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages).toHaveLength(2);
    expect(result.current.genAi?.inputMessages[1].content).toHaveLength(2000);
  });

  it('flags a partial array as unrecoverable when the row has no _id/_index and no span.id', () => {
    // Reproduces `FROM traces-* | WHERE ... | SORT ... | KEEP @timestamp, ...`
    // with span.id projected away: the short message renders, the long one is
    // gone, and nothing can be fetched.
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: ['{"role":"system","content":"be brief"}'],
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
      })
    );

    expect(result.current.genAi?.inputMessages).toHaveLength(1);
    expect(result.current.unrecoverableLongFields).toBe(true);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('does not fetch in ES|QL mode when _ignored was requested and is empty', () => {
    // `METADATA _ignored` present with no entries proves nothing was dropped,
    // so an absent message field is genuinely absent.
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: ['{"role":"user","content":"hi"}'],
            [OUTPUT_MESSAGES_FIELD]: null,
          },
          _ignored: [],
        }),
        isEsqlMode: true,
      })
    );

    expect(result.current.genAi?.inputMessages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(result.current.unrecoverableLongFields).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('does not fetch in ES|QL mode when the row has no _id/_index and no span.id', () => {
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: null,
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
      })
    );

    expect(result.current.isGenAiSpan).toBe(true);
    expect(result.current.genAi?.requestModel).toBe('gpt-4o');
    expect(result.current.genAi?.inputMessages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('does not fetch when _source is present but the field is genuinely absent', () => {
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _source: { attributes: { 'gen_ai.request.model': 'gpt-4o' } },
        }),
      })
    );

    expect(result.current.isGenAiSpan).toBe(true);
    expect(result.current.genAi?.inputMessages).toEqual([]);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('recovers all three long fields from a single fetch', async () => {
    const inputMessage = '{"role":"user","content":"' + 'i'.repeat(1500) + '"}';
    const outputMessage = '{"role":"assistant","content":"' + 'o'.repeat(1500) + '"}';
    const systemInstructions = 'k'.repeat(1500);
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: {
            hits: [
              {
                _source: {
                  attributes: {
                    'gen_ai.input.messages': [inputMessage],
                    'gen_ai.output.messages': [outputMessage],
                    'gen_ai.system_instructions': systemInstructions,
                  },
                },
              },
            ],
          },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: ['attributes'],
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(1500);
    expect(result.current.genAi?.outputMessages[0].content).toHaveLength(1500);
    expect(result.current.genAi?.systemInstructions).toHaveLength(1500);
  });

  it('does not re-fetch when re-rendered with an equivalent hit', async () => {
    const longMessage = '{"role":"user","content":"' + 'r'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: { hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }] },
        },
      })
    );

    // Discover hands over a fresh `hit` each render, so the fetch must key off
    // primitives rather than object identity.
    const { result, rerender } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: [INPUT_MESSAGES_FIELD],
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSearch).toHaveBeenCalledTimes(1);

    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });

  it('requests the document by id/index and asks only for the long fields', async () => {
    mockSearch.mockReturnValue(of({ rawResponse: { hits: { hits: [] } } }));

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: { 'attributes.gen_ai.request.model': ['gpt-4o'] },
          _ignored: [INPUT_MESSAGES_FIELD],
          _id: 'span-42',
          _index: '.ds-traces-otel-default-000001',
        }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledWith(
      {
        params: {
          index: '.ds-traces-otel-default-000001',
          size: 1,
          track_total_hits: false,
          query: { bool: { filter: [{ ids: { values: ['span-42'] } }] } },
          // Asserted against the constant so adding a long field here does not
          // break this test.
          _source: [...GEN_AI_LONG_MESSAGE_FIELDS],
        },
      },
      expect.objectContaining({ abortSignal: expect.anything() })
    );
  });

  // ---------------------------------------------------------------------------
  // span.id fallback: ES|QL without METADATA _id, _index
  // ---------------------------------------------------------------------------

  it('fetches by span.id when _id and _index are absent but span.id + indexPattern are available', async () => {
    const longMessage = '{"role":"user","content":"' + 'f'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: { hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }] },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: null,
            'span.id': 'a1b2c3d4e5f60718',
            'trace.id': 'trace-xyz',
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
        indexPattern: 'traces-apm*,traces-*.otel-*',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.unrecoverableLongFields).toBe(false);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });

  it('requests the document by span.id + trace.id and asks only for the long fields', async () => {
    mockSearch.mockReturnValue(of({ rawResponse: { hits: { hits: [] } } }));

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: null,
            'span.id': 'abc123def456',
            'trace.id': 'trace-abc',
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
        indexPattern: 'traces-apm*,traces-*.otel-*',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledWith(
      {
        params: {
          index: 'traces-apm*,traces-*.otel-*',
          size: 1,
          track_total_hits: false,
          query: {
            bool: {
              filter: [
                { term: { 'span.id': 'abc123def456' } },
                { term: { 'trace.id': 'trace-abc' } },
              ],
            },
          },
          _source: [...GEN_AI_LONG_MESSAGE_FIELDS],
        },
      },
      expect.objectContaining({ abortSignal: expect.anything() })
    );
  });

  it('recovers a partial array via span.id in ES|QL mode', async () => {
    const shortMessage = '{"role":"system","content":"be brief"}';
    const longMessage = '{"role":"user","content":"' + 'g'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: {
            hits: [
              { _source: { attributes: { 'gen_ai.input.messages': [shortMessage, longMessage] } } },
            ],
          },
        },
      })
    );

    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: [shortMessage],
            'span.id': 'partial-span',
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
        indexPattern: 'traces-apm*',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.unrecoverableLongFields).toBe(false);
    expect(result.current.genAi?.inputMessages).toHaveLength(2);
    expect(result.current.genAi?.inputMessages[1].content).toHaveLength(2000);
  });

  it('remains unrecoverable when no span.id and no _id are available', () => {
    // e.g. the query projected span.id away with `| KEEP @timestamp, service.name`
    const { result } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: null,
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
        indexPattern: 'traces-apm*',
      })
    );

    expect(result.current.unrecoverableLongFields).toBe(true);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('does not re-fetch when re-rendered through the span.id path', async () => {
    const longMessage = '{"role":"user","content":"' + 's'.repeat(2000) + '"}';
    mockSearch.mockReturnValue(
      of({
        rawResponse: {
          hits: { hits: [{ _source: { attributes: { 'gen_ai.input.messages': [longMessage] } } }] },
        },
      })
    );

    const { result, rerender } = renderHook(() =>
      useGenAiData({
        hit: buildHit({
          flattened: {
            'attributes.gen_ai.request.model': ['gpt-4o'],
            [INPUT_MESSAGES_FIELD]: null,
            'span.id': 'stable-span',
          },
          _id: null,
          _index: null,
        }),
        isEsqlMode: true,
        indexPattern: 'traces-apm*',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSearch).toHaveBeenCalledTimes(1);

    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The cacheKey stayed the same, so no second fetch should have fired.
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.current.genAi?.inputMessages[0].content).toHaveLength(2000);
  });
});
