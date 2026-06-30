/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';
import { getServices } from '../services';
import { streamGenerate } from '../utils/stream_generate';
import { fetchEsqlData } from '../utils/fetch_esql_data';
import type { EsqlDataResult } from '../utils/fetch_esql_data';
import {
  fillTemplate,
  sanitizeTemplate,
  isValidTemplate,
  prepareHtml,
} from '../utils/template_fill';

export interface UseAiPanelHtmlParams {
  embeddableId: string;
  prompt: string;
  esqlQuery: string | undefined;
  timeRange: { from: string; to: string } | undefined;
  generationVersion: number;
  savedTemplate: string | undefined;
  colorMode: 'LIGHT' | 'DARK';
  onTemplateChange: (template: string) => void;
}

export interface UseAiPanelHtmlResult {
  html: string;
  isLoading: boolean;
  error: string | undefined;
  isAiUnavailable: boolean;
}

export function useAiPanelHtml({
  embeddableId,
  prompt,
  esqlQuery,
  timeRange,
  generationVersion,
  savedTemplate,
  colorMode,
  onTemplateChange,
}: UseAiPanelHtmlParams): UseAiPanelHtmlResult {
  const [html, setHtml] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(prompt));
  const [error, setError] = useState<string | undefined>();
  const [isAiUnavailable, setIsAiUnavailable] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const accRef = useRef('');
  const htmlRef = useRef('');
  htmlRef.current = html;

  const savedTemplateRef = useRef(savedTemplate);
  savedTemplateRef.current = savedTemplate;

  const onTemplateChangeRef = useRef(onTemplateChange);
  useEffect(() => {
    onTemplateChangeRef.current = onTemplateChange;
  }, [onTemplateChange]);

  useEffect(() => {
    if (!prompt) {
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    accRef.current = '';

    const template = savedTemplateRef.current;

    // Fast path — static panel with stored HTML.
    if (template && !esqlQuery) {
      setHtml(prepareHtml(template));
      setIsLoading(false);
      setError(undefined);
      return;
    }

    setIsLoading(true);
    setError(undefined);

    const { search, core } = getServices();

    // Fast path — esqlQuery panel with stored template: run query only, no LLM.
    if (template && esqlQuery) {
      fetchEsqlData(search, core.http, esqlQuery, timeRange, controller.signal)
        .then(({ columns, values }) => {
          if (controller.signal.aborted) return;
          setHtml(fillTemplate(template, columns, values ?? []));
          setIsLoading(false);
        })
        .catch((err: Error) => {
          if (controller.signal.aborted || err.name === 'AbortError') return;
          setError(err.message || 'Failed to fetch data');
          setIsLoading(false);
        });

      return () => controller.abort();
    }

    // Slow path — LLM generates template; for esqlQuery panels data fetch runs in parallel.
    let esqlData: EsqlDataResult | null = null;
    let templateDone = false;
    let dataDone = !esqlQuery;
    let hasFailed = false;

    let intervalRef: ReturnType<typeof setInterval> | undefined;
    const stopInterval = () => {
      if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = undefined;
      }
    };

    // Stream partial HTML into the iframe for static panels.
    if (!htmlRef.current && !esqlQuery) {
      intervalRef = setInterval(() => {
        if (accRef.current) setHtml(prepareHtml(accRef.current));
      }, 300);
    }

    const tryFinish = () => {
      if (!templateDone || !dataDone || hasFailed || controller.signal.aborted) return;
      stopInterval();

      let rendered: string;

      if (esqlQuery && esqlData) {
        const cleaned = sanitizeTemplate(accRef.current);
        if (!isValidTemplate(cleaned)) {
          setError('Failed to generate panel: LLM returned invalid template');
          setIsLoading(false);
          return;
        }
        rendered = fillTemplate(cleaned, esqlData.columns, esqlData.values ?? []);
        onTemplateChangeRef.current(cleaned);
      } else if (!esqlQuery) {
        rendered = prepareHtml(accRef.current);
        onTemplateChangeRef.current(rendered);
      } else {
        return;
      }

      setHtml(rendered);
      setIsLoading(false);
    };

    if (esqlQuery) {
      fetchEsqlData(search, core.http, esqlQuery, timeRange, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          esqlData = data;
          dataDone = true;
          tryFinish();
        })
        .catch((err: Error) => {
          if (controller.signal.aborted || err.name === 'AbortError') return;
          hasFailed = true;
          setError(err.message || 'Failed to fetch data');
          setIsLoading(false);
        });
    }

    streamGenerate(
      core.http,
      { prompt, esqlQuery, timeRange, colorMode },
      (token) => {
        accRef.current += token;
      },
      controller.signal
    )
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          hasFailed = true;
          stopInterval();
          if (err.message.toLowerCase().includes('no inference connector')) {
            setIsAiUnavailable(true);
            setIsLoading(false);
          } else {
            setError(err instanceof Error ? err.message : String(err));
            setIsLoading(false);
          }
        }
      })
      .finally(() => {
        if (hasFailed || controller.signal.aborted) return;
        templateDone = true;
        tryFinish();
      });

    return () => {
      stopInterval();
      controller.abort();
    };
  }, [embeddableId, prompt, esqlQuery, timeRange, generationVersion, colorMode]);

  return { html, isLoading, error, isAiUnavailable };
}
