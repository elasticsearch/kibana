/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { anonymizeCell, buildAliasMap } from './anonymize_cell';
import type { ReplayCell } from './replay_plan';

const cell = (overrides: Partial<ReplayCell> = {}): ReplayCell => ({
  executionId: 'exec-1',
  exampleId: 'alert-analysis-a',
  modelId: 'anthropic-claude-4.6-sonnet',
  question: 'Take a look at this alert.',
  expected: 'The alert is a true positive.',
  agentResponse: 'This is a true positive.',
  steps: [],
  recordedAt: '2026-08-22T16:24:55.232Z',
  ...overrides,
});

describe('anonymizeCell steps', () => {
  it('scrubs model identity from the tool-call history', () => {
    // steps reach the groundedness judge as `tool_call_history`. Leaving them
    // unscrubbed defeats --blind: the judge can read the model's identity out
    // of the trajectory even though every other field was redacted.
    const c = anonymizeCell(
      cell({
        modelId: 'anthropic-claude-4.6-sonnet',
        steps: [{ type: 'tool_call', note: 'run by anthropic-claude-4.6-sonnet' }],
      }),
      new Map([['anthropic-claude-4.6-sonnet', 'A']])
    );
    expect(JSON.stringify(c.steps)).not.toContain('claude-4.6-sonnet');
  });

  it('leaves a trajectory without steps alone', () => {
    expect(anonymizeCell(cell(), new Map()).steps).toEqual([]);
  });
});

describe('buildAliasMap', () => {
  it('assigns a stable alias per model, ordered by model id', () => {
    // Aliases must not depend on cell order: two runs of the same replay have
    // to produce the same alias for the same model or the blind pass is not
    // reproducible and deltas cannot be attributed.
    const a = buildAliasMap([cell({ modelId: 'openai-gpt-5.2' }), cell({ modelId: 'a-model' })]);
    const b = buildAliasMap([cell({ modelId: 'a-model' }), cell({ modelId: 'openai-gpt-5.2' })]);

    expect(a).toEqual(b);
    expect(a.get('a-model')).toBe('Model A');
    expect(a.get('openai-gpt-5.2')).toBe('Model B');
  });
});

describe('anonymizeCell', () => {
  const aliases = buildAliasMap([cell()]);

  it('strips the model id from the cell', () => {
    const out = anonymizeCell(cell(), aliases);
    expect(out.modelId).toBe('Model A');
  });

  it('scrubs vendor and model names leaking inside the agent response', () => {
    // The judge reads the agent's own words. Models routinely self-identify
    // ("As Claude, ..."), so stripping only the metadata field leaves the
    // identity in the graded text and the blind pass is blind in name only.
    const out = anonymizeCell(
      cell({
        agentResponse:
          'As Claude, an Anthropic model, I reviewed this. GPT-5.2 would agree. -- claude-4.6-sonnet',
      }),
      aliases
    );

    expect(out.agentResponse).not.toMatch(/claude/i);
    expect(out.agentResponse).not.toMatch(/anthropic/i);
    expect(out.agentResponse).not.toMatch(/gpt-5\.2/i);
    expect(out.agentResponse).not.toMatch(/sonnet/i);
  });

  it('scrubs identity from the question and expected answer too', () => {
    const out = anonymizeCell(
      cell({
        question: 'Does Gemini handle this better?',
        expected: 'A Claude-style answer naming Anthropic.',
      }),
      aliases
    );

    expect(out.question).not.toMatch(/gemini/i);
    expect(out.expected).not.toMatch(/claude|anthropic/i);
  });

  it('leaves the substantive content intact', () => {
    // Over-scrubbing would destroy the thing being graded. The security
    // vocabulary that drives the verdict must survive anonymization.
    const out = anonymizeCell(
      cell({
        agentResponse:
          'BluetoothService.exe side-loaded log.dll (MITRE T1574). Host srv-win-def is affected.',
      }),
      aliases
    );

    expect(out.agentResponse).toContain('BluetoothService.exe');
    expect(out.agentResponse).toContain('T1574');
    expect(out.agentResponse).toContain('srv-win-def');
  });

  it('does not mutate the input cell', () => {
    const original = cell({ agentResponse: 'Claude here.' });
    const before = { ...original };
    anonymizeCell(original, aliases);
    expect(original).toEqual(before);
  });
});
