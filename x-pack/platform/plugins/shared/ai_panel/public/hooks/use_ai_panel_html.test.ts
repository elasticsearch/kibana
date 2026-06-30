/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// DOMPurify requires a real DOM — pass-through in Jest
jest.mock('dompurify', () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

jest.mock('../services');
jest.mock('../utils/fetch_esql_data');
jest.mock('../utils/stream_generate');

import { getServices } from '../services';
import { fetchEsqlData } from '../utils/fetch_esql_data';
import { streamGenerate } from '../utils/stream_generate';
import { useAiPanelHtml } from './use_ai_panel_html';
import { TEMPLATE_SENTINEL } from '../utils/template_fill';

const mockHttp = {} as any;
const mockSearch = {} as any;

beforeEach(() => {
  jest.clearAllMocks();
  (getServices as jest.Mock).mockReturnValue({ search: mockSearch, core: { http: mockHttp } });
  (fetchEsqlData as jest.Mock).mockResolvedValue({ columns: [], values: [] });
  (streamGenerate as jest.Mock).mockResolvedValue(undefined);
});

const baseParams = {
  embeddableId: 'panel-1',
  prompt: 'Show revenue by category',
  esqlQuery: undefined,
  timeRange: undefined,
  generationVersion: 0,
  savedTemplate: undefined,
  colorMode: 'LIGHT' as const,
  onTemplateChange: jest.fn(),
};

const VALID_TEMPLATE = `${TEMPLATE_SENTINEL}\n<html><body><p>hello</p></body></html>`;

describe('useAiPanelHtml', () => {
  describe('empty prompt', () => {
    it('clears isLoading immediately when prompt is empty', () => {
      const { result } = renderHook(() => useAiPanelHtml({ ...baseParams, prompt: '' }));
      expect(result.current.isLoading).toBe(false);
      expect(fetchEsqlData).not.toHaveBeenCalled();
      expect(streamGenerate).not.toHaveBeenCalled();
    });
  });

  describe('fast path — static panel with stored template', () => {
    it('renders the stored HTML immediately with no server calls', async () => {
      const { result } = renderHook(() =>
        useAiPanelHtml({ ...baseParams, savedTemplate: VALID_TEMPLATE })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.html).toContain('hello');
      expect(fetchEsqlData).not.toHaveBeenCalled();
      expect(streamGenerate).not.toHaveBeenCalled();
    });
  });

  describe('fast path — esqlQuery panel with stored template', () => {
    it('calls fetchEsqlData only, not streamGenerate', async () => {
      (fetchEsqlData as jest.Mock).mockResolvedValue({
        columns: [{ name: 'count', type: 'long' }],
        values: [[42]],
      });
      const template = `${TEMPLATE_SENTINEL}\n<html><body>{{ rows[0].count }}</body></html>`;

      const { result } = renderHook(() =>
        useAiPanelHtml({
          ...baseParams,
          esqlQuery: 'FROM logs | STATS count()',
          savedTemplate: template,
        })
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(fetchEsqlData).toHaveBeenCalledTimes(1);
      expect(streamGenerate).not.toHaveBeenCalled();
      expect(result.current.html).toContain('42');
    });

    it('surfaces data fetch error', async () => {
      (fetchEsqlData as jest.Mock).mockRejectedValue(new Error('ES|QL failed'));

      const { result } = renderHook(() =>
        useAiPanelHtml({
          ...baseParams,
          esqlQuery: 'FROM logs | STATS count()',
          savedTemplate: VALID_TEMPLATE,
        })
      );

      await waitFor(() => expect(result.current.error).toBe('ES|QL failed'));
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('slow path — no stored template', () => {
    it('calls both fetchEsqlData and streamGenerate in parallel for esqlQuery panels', async () => {
      const onTemplateChange = jest.fn();
      const template = `${TEMPLATE_SENTINEL}\n<html><body>{{ rows[0].total }}</body></html>`;

      (streamGenerate as jest.Mock).mockImplementation(
        (_http: unknown, _params: unknown, onToken: (t: string) => void) => {
          onToken(template);
          return Promise.resolve();
        }
      );
      (fetchEsqlData as jest.Mock).mockResolvedValue({
        columns: [{ name: 'total', type: 'long' }],
        values: [[99]],
      });

      const { result } = renderHook(() =>
        useAiPanelHtml({
          ...baseParams,
          esqlQuery: 'FROM logs | STATS total = COUNT(*)',
          onTemplateChange,
        })
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(fetchEsqlData).toHaveBeenCalledTimes(1);
      expect(streamGenerate).toHaveBeenCalledTimes(1);
      expect(onTemplateChange).toHaveBeenCalledWith(template);
      expect(result.current.html).toContain('99');
    });

    it('surfaces LLM error', async () => {
      (streamGenerate as jest.Mock).mockRejectedValue(new Error('LLM unavailable'));

      const { result } = renderHook(() =>
        useAiPanelHtml({ ...baseParams, esqlQuery: 'FROM logs | STATS count()' })
      );

      await waitFor(() => expect(result.current.error).toBe('LLM unavailable'));
      expect(result.current.isLoading).toBe(false);
    });

    it('shows invalid-template error when LLM returns non-HTML', async () => {
      (streamGenerate as jest.Mock).mockImplementation(
        (_http: unknown, _params: unknown, onToken: (t: string) => void) => {
          // Only emits the sentinel — no actual HTML elements
          onToken(TEMPLATE_SENTINEL);
          return Promise.resolve();
        }
      );

      const { result } = renderHook(() =>
        useAiPanelHtml({ ...baseParams, esqlQuery: 'FROM logs | STATS count()' })
      );

      await waitFor(() => expect(result.current.error).toMatch(/invalid template/i));
    });
  });

  describe('abort on unmount', () => {
    it('aborts the inflight request when the hook unmounts', async () => {
      let capturedSignal: AbortSignal | undefined;
      (fetchEsqlData as jest.Mock).mockImplementation(
        (_s: unknown, _h: unknown, _q: unknown, _t: unknown, signal: AbortSignal) => {
          capturedSignal = signal;
          return new Promise(() => {}); // never resolves
        }
      );

      const { unmount } = renderHook(() =>
        useAiPanelHtml({
          ...baseParams,
          esqlQuery: 'FROM logs | STATS count()',
          savedTemplate: VALID_TEMPLATE,
        })
      );

      await act(async () => {});
      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('re-render on generationVersion change', () => {
    it('re-fetches when generationVersion increments', async () => {
      (fetchEsqlData as jest.Mock).mockResolvedValue({ columns: [], values: [] });

      const { rerender } = renderHook(
        ({ version }: { version: number }) =>
          useAiPanelHtml({
            ...baseParams,
            esqlQuery: 'FROM logs | STATS count()',
            savedTemplate: VALID_TEMPLATE,
            generationVersion: version,
          }),
        { initialProps: { version: 0 } }
      );

      await waitFor(() => expect(fetchEsqlData).toHaveBeenCalledTimes(1));

      rerender({ version: 1 });
      await waitFor(() => expect(fetchEsqlData).toHaveBeenCalledTimes(2));
    });
  });
});
