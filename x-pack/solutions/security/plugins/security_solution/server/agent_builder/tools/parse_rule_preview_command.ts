/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Argv as YargsArgv } from 'yargs';
import yargs from 'yargs';

// ── Public types ───────────────────────────────────────────────────────────────

export type ParsedPreviewCommand =
  | { kind: 'help'; text: string }
  | {
      kind: 'preview';
      rule: Record<string, unknown>;
      interval: string;
      timeframeStart: string;
      timeframeEnd: string;
    }
  | { kind: 'error'; message: string };

// ── Tokenizer ──────────────────────────────────────────────────────────────────

/**
 * Splits a CLI command string into tokens, respecting quoted segments.
 * Quote characters are stripped from the output.
 *
 * Needed because yargs takes string[], not a raw string.
 *
 * e.g.  'esql --query "FROM logs-* | LIMIT 10"'
 *   =>  ['esql', '--query', 'FROM logs-* | LIMIT 10']
 */
export const tokenizeCommand = (command: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  const chars = Array.from(command);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Inside a quoted string, a backslash escapes the matching quote char or another backslash.
    // `handled` is set when we consume the escape sequence so normal char processing is skipped.
    let handled = false;
    if (ch === '\\' && i + 1 < chars.length) {
      const next = chars[i + 1];
      if (
        (inDouble && (next === '"' || next === '\\')) ||
        (inSingle && (next === "'" || next === '\\'))
      ) {
        current += next;
        i++;
        handled = true;
      }
    }

    if (!handled) {
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
      } else if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if ((ch === ' ' || ch === '\t' || ch === '\n') && !inDouble && !inSingle) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
};

// ── Shared option groups ───────────────────────────────────────────────────────

const SCHEDULE_OPTIONS = {
  interval: { type: 'string' as const, default: '1h', desc: 'Rule run frequency, e.g. "5m", "1h"' },
  'timeframe-start': {
    type: 'string' as const,
    default: 'now-1h',
    desc: 'Preview window start as datemath, e.g. "now-24h"',
  },
  'timeframe-end': {
    type: 'string' as const,
    default: 'now',
    desc: 'Preview window end as datemath',
  },
};

const INDEX_OPTIONS = {
  index: {
    type: 'string' as const,
    array: true as const,
    desc: 'Index pattern (repeat for multiple)',
  },
  'data-view-id': { type: 'string' as const, desc: 'Kibana data view ID (alternative to --index)' },
};

const QUERY_LANGUAGE_OPTIONS = {
  language: {
    type: 'string' as const,
    choices: ['kuery', 'lucene'] as const,
    default: 'kuery',
    desc: 'Query language: "kuery" (KQL, default) or "lucene"',
  },
};

// ── Helper ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerArgv = Record<string, any>;

const toPreview = (rule: Record<string, unknown>, argv: HandlerArgv): ParsedPreviewCommand => ({
  kind: 'preview',
  rule,
  interval: argv.interval,
  timeframeStart: argv['timeframe-start'],
  timeframeEnd: argv['timeframe-end'],
});

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parses a CLI-style command string into a discriminated union:
 * - `kind: 'help'`    — caller asked for help; `text` contains the help output
 * - `kind: 'preview'` — fully validated rule ready to preview
 * - `kind: 'error'`   — invalid command; `message` explains what went wrong
 */
export const parseRulePreviewCommand = (command: string): ParsedPreviewCommand => {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    return { kind: 'error', message: 'No command provided. Run --help to see usage.' };
  }

  let result: ParsedPreviewCommand | undefined;

  yargs(tokens)
    .options(SCHEDULE_OPTIONS)

    .command(
      'esql',
      'Preview an ES|QL detection rule',
      (y: YargsArgv) =>
        y
          .option('query', { type: 'string', demandOption: true, desc: 'ES|QL query string' })
          .example('$0 esql --query "FROM logs-* | LIMIT 10"', '')
          .example(
            '$0 esql --query "FROM logs-* | STATS count() BY host.name" --timeframe-start now-24h',
            ''
          ),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview({ type: 'esql', query: argv.query, language: 'esql' }, argv);
      }
    )

    .command(
      'eql',
      'Preview an EQL (event query language) detection rule',
      (y: YargsArgv) =>
        y
          .option('query', { type: 'string', demandOption: true, desc: 'EQL query string' })
          .options(INDEX_OPTIONS)
          .example('$0 eql --query "process where process.name == \\"cmd.exe\\""', ''),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'eql',
            query: argv.query,
            language: 'eql',
            ...(argv.index?.length && { index: argv.index }),
            ...(argv.dataViewId && { data_view_id: argv.dataViewId }),
          },
          argv
        );
      }
    )

    .command(
      'query',
      'Preview a custom query detection rule (KQL / Lucene)',
      (y: YargsArgv) =>
        y
          .option('query', {
            type: 'string',
            desc: 'KQL / Lucene query (omit to match all documents)',
          })
          .options(QUERY_LANGUAGE_OPTIONS)
          .options(INDEX_OPTIONS)
          .example(
            '$0 query --query "event.category:authentication AND event.outcome:failure"',
            ''
          ),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'query',
            ...(argv.query && { query: argv.query }),
            language: argv.language,
            ...(argv.index?.length && { index: argv.index }),
            ...(argv.dataViewId && { data_view_id: argv.dataViewId }),
          },
          argv
        );
      }
    )

    .command(
      'saved_query',
      'Preview a saved query detection rule',
      (y: YargsArgv) =>
        y
          .option('saved-id', {
            type: 'string',
            demandOption: true,
            desc: 'Saved query ID (Kibana saved object)',
          })
          .option('query', { type: 'string', desc: 'KQL / Lucene query override' })
          .options(QUERY_LANGUAGE_OPTIONS)
          .options(INDEX_OPTIONS)
          .example('$0 saved_query --saved-id my-saved-query-id', ''),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'saved_query',
            saved_id: argv.savedId,
            ...(argv.query && { query: argv.query }),
            language: argv.language,
            ...(argv.index?.length && { index: argv.index }),
            ...(argv.dataViewId && { data_view_id: argv.dataViewId }),
          },
          argv
        );
      }
    )

    .command(
      'threshold',
      'Preview a threshold-based detection rule',
      (y: YargsArgv) =>
        y
          .option('query', { type: 'string', demandOption: true, desc: 'KQL / Lucene query' })
          .option('threshold-value', {
            type: 'number',
            demandOption: true,
            desc: 'Minimum event count to alert (integer ≥ 1)',
          })
          .coerce('threshold-value', (v: number) => {
            if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1)
              throw new Error(`--threshold-value must be a positive integer, got "${v}"`);
            return v;
          })
          .option('threshold-field', {
            type: 'string',
            array: true,
            desc: 'Group-by field(s) (repeat for multiple, omit for no grouping)',
          })
          .options(QUERY_LANGUAGE_OPTIONS)
          .options(INDEX_OPTIONS)
          .example(
            '$0 threshold --query "event.category:auth" --threshold-value 10 --threshold-field host.name',
            ''
          ),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'threshold',
            query: argv.query,
            threshold: { field: argv.thresholdField ?? [], value: argv.thresholdValue },
            language: argv.language,
            ...(argv.index?.length && { index: argv.index }),
            ...(argv.dataViewId && { data_view_id: argv.dataViewId }),
          },
          argv
        );
      }
    )

    .command(
      'threat_match',
      'Preview a threat indicator match detection rule',
      (y: YargsArgv) =>
        y
          .option('query', { type: 'string', demandOption: true, desc: 'Source events query' })
          .option('threat-query', {
            type: 'string',
            demandOption: true,
            desc: 'Query against the threat index',
          })
          .option('threat-index', {
            type: 'string',
            array: true,
            demandOption: true,
            desc: 'Threat intelligence index pattern (repeat for multiple)',
          })
          .option('threat-mapping', {
            type: 'string',
            demandOption: true,
            desc: 'JSON array of field-mapping entries: \'[{"entries":[{"field":"src.ip","type":"mapping","value":"dst.ip"}]}]\'',
          })
          .coerce('threat-mapping', (v: string) => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(v);
            } catch {
              throw new Error(`--threat-mapping: invalid JSON — ${v}`);
            }
            if (!Array.isArray(parsed)) throw new Error('--threat-mapping must be a JSON array');
            return parsed;
          })
          .option('threat-filters', {
            type: 'string',
            desc: 'Additional threat index filters (JSON array)',
          })
          .coerce('threat-filters', (v: string) => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(v);
            } catch {
              throw new Error(`--threat-filters: invalid JSON — ${v}`);
            }
            return parsed;
          })
          .option('threat-indicator-path', {
            type: 'string',
            desc: 'Nested path to indicator object (default: "threat.indicator")',
          })
          .options(QUERY_LANGUAGE_OPTIONS)
          .options(INDEX_OPTIONS)
          .example(
            '$0 threat_match --query "*:*" --threat-query "*:*" --threat-index logs-ti_* --threat-mapping \'[{"entries":[{"field":"source.ip","type":"mapping","value":"threat.indicator.ip"}]}]\'',
            ''
          ),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'threat_match',
            query: argv.query,
            threat_query: argv.threatQuery,
            threat_index: argv.threatIndex,
            threat_mapping: argv.threatMapping,
            ...(argv.threatFilters !== undefined && { threat_filters: argv.threatFilters }),
            ...(argv.threatIndicatorPath && { threat_indicator_path: argv.threatIndicatorPath }),
            language: argv.language,
            ...(argv.index?.length && { index: argv.index }),
            ...(argv.dataViewId && { data_view_id: argv.dataViewId }),
          },
          argv
        );
      }
    )

    .command(
      'machine_learning',
      'Preview a machine learning anomaly detection rule',
      (y: YargsArgv) =>
        y
          .option('job-id', {
            type: 'string',
            array: true,
            demandOption: true,
            desc: 'ML job ID (repeat for multiple jobs)',
          })
          .option('anomaly-threshold', {
            type: 'number',
            demandOption: true,
            desc: 'Minimum anomaly score to alert (0–100)',
          })
          .example('$0 machine_learning --job-id my-ml-job --anomaly-threshold 75', '')
          .example('$0 machine_learning --job-id job-a --job-id job-b --anomaly-threshold 50', ''),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'machine_learning',
            machine_learning_job_id: argv.jobId.length === 1 ? argv.jobId[0] : argv.jobId,
            anomaly_threshold: argv.anomalyThreshold,
          },
          argv
        );
      }
    )

    .command(
      'new_terms',
      'Preview a new terms detection rule',
      (y: YargsArgv) =>
        y
          .option('query', {
            type: 'string',
            demandOption: true,
            desc: 'KQL / Lucene query for events to analyse',
          })
          .option('new-terms-fields', {
            type: 'string',
            array: true,
            demandOption: true,
            desc: 'Field(s) to monitor for new values (repeat for multiple, max 3)',
          })
          .coerce('new-terms-fields', (v: string[]) => {
            if (v.length > 3)
              throw new Error(`--new-terms-fields accepts at most 3 fields, got ${v.length}`);
            return v;
          })
          .option('history-window-start', {
            type: 'string',
            demandOption: true,
            desc: 'Start of the baseline window as datemath, e.g. "now-30d"',
          })
          .options(QUERY_LANGUAGE_OPTIONS)
          .options(INDEX_OPTIONS)
          .example(
            '$0 new_terms --query "*:*" --new-terms-fields source.ip --history-window-start now-30d',
            ''
          ),
      (argv: HandlerArgv) => {
        if (result) return;
        result = toPreview(
          {
            type: 'new_terms',
            query: argv.query,
            new_terms_fields: argv.newTermsFields,
            history_window_start: argv.historyWindowStart,
            language: argv.language,
            ...(argv.index?.length && { index: argv.index }),
            ...(argv.dataViewId && { data_view_id: argv.dataViewId }),
          },
          argv
        );
      }
    )

    .demandCommand(1, 'Specify a rule type. Run --help to see all types and examples.')
    .alias('h', 'help')
    .scriptName('')
    .strict()
    .exitProcess(false)
    .version(false)
    .wrap(null)
    .fail((msg: string | null) => {
      result = { kind: 'error', message: msg ?? 'Parse error. Run --help to see usage.' };
    })
    .parse(tokens, {}, (_err: Error | undefined, _argv: HandlerArgv, output: string) => {
      if (!result && output) result = { kind: 'help', text: output };
    });

  return result ?? { kind: 'error', message: 'Unexpected parse state. Run --help to see usage.' };
};
