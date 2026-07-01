/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiCallOut, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { CodeEditor } from '@kbn/code-editor';
import type { SignificantEventsTuningConfig } from '@kbn/streams-schema';
import { validateSignificantEventsTuningConfig } from '@kbn/streams-schema';

/**
 * Converts a SignificantEventsTuningConfig to an annotated YAML string with section headers
 * and field descriptions. Comments are regenerated on every render so they are never lost.
 */
export function configToAnnotatedYaml(config: SignificantEventsTuningConfig): string {
  return [
    '# Significant Events Tuning',
    '# Changes take effect on the next feature identification run or query search.',
    '',
    '# ── Feature Discovery ──',
    '',
    '# Number of documents sampled from ES per iteration (1-100)',
    `sample_size: ${config.sample_size}`,
    '',
    '# Maximum LLM iterations per extraction task (1-20)',
    `max_iterations: ${config.max_iterations}`,
    '',
    '# Days before an identified feature expires (min 1)',
    `feature_ttl_days: ${config.feature_ttl_days}`,
    '',
    '# Proportion of entity-filtered samples (0.0-1.0)',
    '# Combined with diverse_ratio, remainder is random sampling',
    `entity_filtered_ratio: ${config.entity_filtered_ratio}`,
    '',
    '# Proportion of diverse (unfiltered) samples (0.0-1.0)',
    `diverse_ratio: ${config.diverse_ratio}`,
    '',
    '# Max dismissed features in LLM prompt for deduplication (0-50)',
    `max_excluded_features_in_prompt: ${config.max_excluded_features_in_prompt}`,
    '',
    '# Max must_not entity filters during sampling (1-50)',
    `max_entity_filters: ${config.max_entity_filters}`,
    '',
    '# ── Search & Relevance ──',
    '',
    '# Minimum ELSER score for semantic search results (0-1)',
    `semantic_min_score: ${config.semantic_min_score}`,
    '',
    '# RRF rank constant for hybrid search (1-100, ES default=60)',
    `rrf_rank_constant: ${config.rrf_rank_constant}`,
  ].join('\n');
}

/**
 * Parses a simple YAML string of key: value pairs (numbers only).
 * Ignores comment lines (# ...) and blank lines.
 */
function parseSimpleYaml(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    if (!key || rawValue === '') continue;
    const num = Number(rawValue);
    result[key] = isNaN(num) ? rawValue : num;
  }
  return result;
}

export interface SignificantEventsTuningConfigEditorProps {
  value: string;
  onChange: (yaml: string, parsed: SignificantEventsTuningConfig | null) => void;
  isReadOnly?: boolean;
}

export function SignificantEventsTuningConfigEditor({
  value,
  onChange,
  isReadOnly = false,
}: SignificantEventsTuningConfigEditorProps) {
  const handleChange = useCallback(
    (yaml: string) => {
      let parsed: SignificantEventsTuningConfig | null = null;
      try {
        const rawParsed = parseSimpleYaml(yaml);
        const errors = validateSignificantEventsTuningConfig(rawParsed);
        if (errors.length === 0) {
          parsed = rawParsed as unknown as SignificantEventsTuningConfig;
        }
      } catch {
        // parse error -- parsed stays null
      }
      onChange(yaml, parsed);
    },
    [onChange]
  );

  const errors = (() => {
    try {
      return validateSignificantEventsTuningConfig(parseSimpleYaml(value));
    } catch (e) {
      return [
        i18n.translate('xpack.streams.settings.sigEventsTuningConfig.yamlParseError', {
          defaultMessage: 'Invalid YAML: {message}',
          values: { message: e instanceof Error ? e.message : String(e) },
        }),
      ];
    }
  })();

  return (
    <>
      <CodeEditor
        languageId="yaml"
        value={value}
        onChange={handleChange}
        height={350}
        options={{
          readOnly: isReadOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
        }}
      />
      {errors.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            announceOnMount
            size="s"
            color="danger"
            iconType="error"
            title={i18n.translate('xpack.streams.settings.sigEventsTuningConfig.validationErrors', {
              defaultMessage: 'Configuration errors',
            })}
          >
            <ul>
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </EuiCallOut>
        </>
      )}
    </>
  );
}
