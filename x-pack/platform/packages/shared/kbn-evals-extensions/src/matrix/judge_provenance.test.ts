/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  auditJudges,
  checkJudge,
  classifyFamily,
  describeJudge,
  isEisBacked,
  deriveJudgeProvenance,
} from './judge_provenance';
import type { AggregatedModelScores } from './query_matrix_scores';

describe('classifyFamily', () => {
  it.each([
    ['eis-anthropic-claude-4.6-sonnet', 'anthropic'],
    ['anthropic-claude-4.6-sonnet-chat_completion', 'anthropic'],
    ['eis-openai-gpt-5-4', 'openai'],
    ['google-gemini-3.1-pro', 'google'],
    ['Qwen/Qwen3-Coder-30B-A3B-Instruct', 'qwen'],
    ['mistralai/Mistral-Small-24B-Instruct-2501', 'mistral'],
    ['LiteLLM gpt-oss-20b', 'openai'],
  ])('classifies %s as %s', (id, expected) => {
    expect(classifyFamily(id)).toBe(expected);
  });

  it('attributes a Nous finetune of a Llama base to nous, not meta', () => {
    // The id names both vendors; misattributing it to meta would overstate
    // how much cross-family coverage a panel actually has.
    expect(classifyFamily('NousResearch/Hermes-3-Llama-3.1-70B')).toBe('nous');
  });

  it('returns unknown for an unrecognised or empty id', () => {
    expect(classifyFamily('some-internal-endpoint')).toBe('unknown');
    expect(classifyFamily('')).toBe('unknown');
    expect(classifyFamily(undefined)).toBe('unknown');
  });
});

describe('isEisBacked', () => {
  it('accepts eis-prefixed connectors', () => {
    expect(isEisBacked('eis-anthropic-claude-4.5-haiku')).toBe(true);
    expect(isEisBacked('eis-google-gemini-3-1-pro')).toBe(true);
  });

  it('accepts vendor-canonical ids without a repo path', () => {
    expect(isEisBacked('anthropic-claude-4.6-sonnet')).toBe(true);
  });

  it.each([
    ['Qwen/Qwen3-Coder-30B-A3B-Instruct'],
    ['LiteLLM Qwen3-Coder-30B-A3B-Instruct-AWQ'],
    ['NousResearch/Hermes-3-Llama-3.1-70B'],
    ['cyankiwi/Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit'],
    ['gghfez/Mistral-Small-3.2-24B-Instruct-hf-AWQ'],
  ])('rejects self-hosted endpoint %s', (id) => {
    expect(isEisBacked(id)).toBe(false);
  });

  it('rejects empty and whitespace ids', () => {
    expect(isEisBacked('')).toBe(false);
    expect(isEisBacked('   ')).toBe(false);
    expect(isEisBacked(undefined)).toBe(false);
  });
});

describe('describeJudge', () => {
  it('flags a model grading itself', () => {
    const p = describeJudge('eis-anthropic-claude-4.6-sonnet', 'eis-anthropic-claude-4.6-sonnet');
    expect(p.selfJudged).toBe(true);
    expect(p.sameFamily).toBe(true);
  });

  it('treats case and padding differences as the same model', () => {
    const p = describeJudge(' EIS-Anthropic-Claude-4.6-Sonnet ', 'eis-anthropic-claude-4.6-sonnet');
    expect(p.selfJudged).toBe(true);
  });

  it('separates same-family from self-judged', () => {
    const p = describeJudge('eis-anthropic-claude-4.6-sonnet', 'eis-anthropic-claude-4.8-opus');
    expect(p.selfJudged).toBe(false);
    expect(p.sameFamily).toBe(true);
  });

  it('does not call two unknown-family models the same family', () => {
    // Both classify as `unknown`; treating that as a family match would
    // fabricate a same-family violation between unrelated endpoints.
    const p = describeJudge('mystery-endpoint-a', 'mystery-endpoint-b');
    expect(p.sameFamily).toBe(false);
  });
});

describe('checkJudge', () => {
  it('reports a non-EIS judge by default', () => {
    const v = checkJudge('Qwen/Qwen3-Coder-30B-A3B-Instruct', 'eis-openai-gpt-5-4');
    expect(v.map((x) => x.kind)).toEqual(['non-eis-judge']);
  });

  it('reports self-judging by default', () => {
    const v = checkJudge('eis-anthropic-claude-4.6-sonnet', 'eis-anthropic-claude-4.6-sonnet');
    expect(v.map((x) => x.kind)).toEqual(['self-judged']);
  });

  it('does NOT report same-family unless explicitly enabled', () => {
    // Measured same-family bias was not significant, so this must stay opt-in.
    const v = checkJudge('eis-anthropic-claude-4.6-sonnet', 'eis-anthropic-claude-4.8-opus');
    expect(v).toEqual([]);
  });

  it('reports same-family when the policy asks for it', () => {
    const v = checkJudge('eis-anthropic-claude-4.6-sonnet', 'eis-anthropic-claude-4.8-opus', {
      forbidSameFamily: true,
    });
    expect(v.map((x) => x.kind)).toEqual(['same-family']);
  });

  it('passes a clean cross-family EIS pairing', () => {
    expect(checkJudge('eis-google-gemini-3-1-pro', 'eis-anthropic-claude-4.8-opus')).toEqual([]);
  });

  it('can report several violations for one pairing', () => {
    const v = checkJudge('Qwen/Qwen3-Coder-30B-A3B-Instruct', 'Qwen/Qwen3-Coder-30B-A3B-Instruct', {
      forbidSameFamily: true,
    });
    expect(v.map((x) => x.kind).sort()).toEqual(['non-eis-judge', 'same-family', 'self-judged']);
  });
});

describe('auditJudges', () => {
  it('weights counts by docCount, not by row', () => {
    const summary = auditJudges([
      {
        judgeId: 'eis-anthropic-claude-4.6-sonnet',
        taskModelId: 'eis-openai-gpt-5-4',
        docCount: 1000,
      },
      {
        judgeId: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
        taskModelId: 'eis-openai-gpt-5-4',
        docCount: 50,
      },
    ]);
    expect(summary.totalDocs).toBe(1050);
    expect(summary.nonEisDocs).toBe(50);
  });

  it('defaults docCount to 1', () => {
    const summary = auditJudges([
      { judgeId: 'eis-anthropic-claude-4.6-sonnet', taskModelId: 'eis-openai-gpt-5-4' },
    ]);
    expect(summary.totalDocs).toBe(1);
  });

  it('deduplicates violations per judge/candidate pairing', () => {
    const rows = Array.from({ length: 5 }, () => ({
      judgeId: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
      taskModelId: 'eis-openai-gpt-5-4',
      docCount: 10,
    }));
    const summary = auditJudges(rows);
    expect(summary.violations).toHaveLength(1);
    expect(summary.nonEisDocs).toBe(50);
  });

  it('counts self-judged docs separately from non-EIS docs', () => {
    const summary = auditJudges([
      {
        judgeId: 'anthropic-claude-4.6-sonnet',
        taskModelId: 'anthropic-claude-4.6-sonnet',
        docCount: 30,
      },
    ]);
    expect(summary.selfJudgedDocs).toBe(30);
    expect(summary.nonEisDocs).toBe(0);
  });

  it('lists the distinct judge families present', () => {
    const summary = auditJudges([
      { judgeId: 'eis-anthropic-claude-4.6-sonnet', taskModelId: 'eis-openai-gpt-5-4' },
      { judgeId: 'eis-google-gemini-3-1-pro', taskModelId: 'eis-openai-gpt-5-4' },
      { judgeId: 'eis-anthropic-claude-4.5-haiku', taskModelId: 'eis-openai-gpt-5-4' },
    ]);
    expect(summary.judgeFamilies).toEqual(['anthropic', 'google']);
  });

  it('handles an empty audit', () => {
    const summary = auditJudges([]);
    expect(summary).toMatchObject({ totalDocs: 0, nonEisDocs: 0, violations: [] });
  });
});

const model = (modelId: string, judges: Array<string | undefined>): AggregatedModelScores =>
  ({
    modelId,
    suites: judges.map((judgeModelId, i) => ({
      suiteId: `suite-${i}`,
      judgeModelId,
      datasets: [],
    })),
  } as unknown as AggregatedModelScores);

describe('deriveJudgeProvenance', () => {
  it('reports the bare id only when every admitted run shares one judge', () => {
    const result = deriveJudgeProvenance([
      model('openai-gpt-5.5', ['google-gemini-3.1-pro']),
      model('anthropic-claude-5-sonnet', ['google-gemini-3.1-pro']),
    ]);

    expect(result.judgeModelId).toBe('google-gemini-3.1-pro');
    expect(result.judgeBreakdown).toEqual([
      { judgeModelId: 'google-gemini-3.1-pro', suites: 2, share: 100 },
    ]);
  });

  it('refuses to name a single judge when the board is actually mixed', () => {
    // The regression that motivated this: the artifact declared a unified
    // gemini judge while the golden rows were mostly haiku-graded. A mixed
    // board must never render as a bare id.
    const result = deriveJudgeProvenance([
      model('a', ['anthropic-claude-4.5-haiku']),
      model('b', ['anthropic-claude-4.5-haiku']),
      model('c', ['anthropic-claude-4.5-haiku']),
      model('d', ['google-gemini-3.1-pro']),
    ]);

    expect(result.judgeModelId).not.toBe('google-gemini-3.1-pro');
    expect(result.judgeModelId).toMatch(/^mixed: /);
    expect(result.judgeModelId).toContain('anthropic-claude-4.5-haiku 75.0%');
    expect(result.judgeModelId).toContain('google-gemini-3.1-pro 25.0%');
  });

  // Regression: attack-discovery runs each slice as its own experiment, so a
  // suite can carry several judges. Counting only the single-judge field made
  // those runs vanish from the breakdown -- the mixed column disappeared from
  // the figure whose whole job is to expose it.
  it('counts every judge on a suite whose columns ran as separate experiments', () => {
    const mixed: AggregatedModelScores[] = [
      {
        modelId: 'a',
        suites: [
          {
            suiteId: 'attack-discovery-agent-builder',
            judgeModelIds: ['anthropic-claude-4.6-sonnet', 'google-gemini-3.1-pro'],
            datasets: [],
          },
        ],
      } as unknown as AggregatedModelScores,
    ];

    const result = deriveJudgeProvenance(mixed);

    expect(result.judgeBreakdown.map((j) => j.judgeModelId).sort()).toEqual([
      'anthropic-claude-4.6-sonnet',
      'google-gemini-3.1-pro',
    ]);
    expect(result.judgeModelId).toMatch(/^mixed: /);
  });

  it('orders the breakdown by how much of the board each judge graded', () => {
    const result = deriveJudgeProvenance([
      model('a', ['gemini', 'haiku', 'haiku']),
      model('b', ['haiku']),
    ]);

    expect(result.judgeBreakdown.map((j) => j.judgeModelId)).toEqual(['haiku', 'gemini']);
    expect(result.judgeBreakdown[0]).toEqual({ judgeModelId: 'haiku', suites: 3, share: 75 });
    expect(result.judgeBreakdown[1]).toEqual({ judgeModelId: 'gemini', suites: 1, share: 25 });
  });

  it('says the judge is unknown rather than implying one when none is recorded', () => {
    const result = deriveJudgeProvenance([model('a', [undefined]), model('b', [undefined])]);

    expect(result.judgeModelId).toMatch(/^unknown/);
    expect(result.judgeBreakdown).toEqual([]);
  });

  it('ignores runs with no judge instead of counting them as a judge', () => {
    const result = deriveJudgeProvenance([model('a', ['gemini', undefined, undefined])]);

    expect(result.judgeModelId).toBe('gemini');
    expect(result.judgeBreakdown).toEqual([{ judgeModelId: 'gemini', suites: 1, share: 100 }]);
  });

  it('handles a model that contributed no suites at all', () => {
    const result = deriveJudgeProvenance([model('a', ['gemini']), model('b', [])]);

    expect(result.judgeModelId).toBe('gemini');
  });
});
