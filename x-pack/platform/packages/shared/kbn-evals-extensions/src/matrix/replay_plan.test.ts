/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument } from '@kbn/evals-common';
import {
  agentSteps,
  lastAgentMessage,
  planReplay,
  replayExecutionId,
  summarizePlan,
} from './replay_plan';

/**
 * Shaped after a real golden document (run sweep-1788679175-gj): the judge
 * inputs live on example.input.question, example.output.expected and
 * task.output.messages[].message.
 */
/** Dataset reference lookup, standing in for the suite's prompts file. */
const refs = (exampleId: string) =>
  ((
    {
      'persona-001': 'host-42',
      'persona-002': 'A2',
      'persona-003': 'ref-3',
      'persona-broken': 'e',
      p2: 'e',
    } as Record<string, string>
  )[exampleId]);

function doc(overrides: Record<string, any> = {}): EvaluationScoreDocument {
  const base: any = {
    '@timestamp': '2026-09-06T09:00:00.000Z',
    experiment_id: 'exp-1',
    example: {
      id: 'persona-001',
      input: { question: 'Which host triggered the alert?' },
      output: {},
    },
    task: {
      model: { id: 'eis-openai-gpt-5-4-nano' },
      output: {
        messages: [
          { message: { content: 'Looking into it' } },
          { message: { content: 'host-42 triggered the alert.' } },
        ],
      },
    },
    evaluator: { name: 'Factuality', kind: 'llm' },
    metadata: {
      execution_id: 'sweep-1788679175-gj-s1of3::security-persona-matrix::nano',
      total_repetitions: 1,
    },
  };
  return { ...base, ...overrides } as EvaluationScoreDocument;
}

describe('lastAgentMessage', () => {
  it('reads the final message content', () => {
    expect(lastAgentMessage(doc().task!.output)).toBe('host-42 triggered the alert.');
  });

  it('accepts a plain string message', () => {
    expect(lastAgentMessage({ messages: [{ message: 'plain' }] })).toBe('plain');
  });

  it('returns undefined rather than inventing an empty answer', () => {
    // Grading "" would produce a confident MAJOR_INACCURACIES verdict for a
    // cell whose trajectory simply failed to load.
    expect(lastAgentMessage({ messages: [] })).toBeUndefined();
    expect(lastAgentMessage(undefined)).toBeUndefined();
    expect(lastAgentMessage({})).toBeUndefined();
  });
});

describe('agentSteps', () => {
  it('returns the tool-call history the groundedness judge grades against', () => {
    const steps = [{ type: 'tool_call', name: 'search' }, { type: 'relevant_skills' }];
    expect(agentSteps({ messages: [], steps })).toEqual(steps);
  });

  it('returns an empty array when a trajectory recorded no steps', () => {
    expect(agentSteps({ messages: [] })).toEqual([]);
    expect(agentSteps(undefined)).toEqual([]);
    expect(agentSteps({ steps: 'not-an-array' })).toEqual([]);
  });
});

describe('planReplay', () => {
  it('builds one cell carrying the judge inputs', () => {
    const plan = planReplay([doc()], refs);
    expect(plan.skipped).toEqual([]);
    expect(plan.cells).toHaveLength(1);
    expect(plan.cells[0]).toEqual(
      expect.objectContaining({
        exampleId: 'persona-001',
        question: 'Which host triggered the alert?',
        expected: 'host-42',
        agentResponse: 'host-42 triggered the alert.',
        modelId: 'eis-openai-gpt-5-4-nano',
      })
    );
  });

  it('carries the tool-call history so grounding is graded against evidence', () => {
    // The groundedness judge reads output.steps as `tool_call_history` and
    // verifies each claim against it. Dropping steps on replay left that
    // history empty, so a row the judge had scored 0.86 grounded came back
    // 0.25 with 17/21 cells labelled MAJOR_HALLUCINATIONS -- a harness
    // artifact that reads exactly like a model regression.
    const steps = [{ type: 'tool_call', name: 'search', result: 'host-42' }];
    const plan = planReplay(
      [
        doc({
          task: {
            model: { id: 'eis-openai-gpt-5-4-nano' },
            output: {
              messages: [{ message: { content: 'host-42 triggered the alert.' } }],
              steps,
            },
          },
        }),
      ],
      refs
    );
    expect(plan.cells[0].steps).toEqual(steps);
  });

  it('dedupes the evaluator documents that share one trajectory', () => {
    // A cell emits ~7 evaluator docs. Without dedupe a re-judge would call the
    // judge 7x per cell and write conflicting analyses for the same trajectory.
    const docs = ['Factuality', 'Relevance', 'Groundedness', 'Latency'].map((name) =>
      doc({ evaluator: { name, kind: 'llm' } })
    );
    const plan = planReplay(docs, refs);
    expect(plan.cells).toHaveLength(1);
  });

  it('grades one deterministic trajectory per cell', () => {
    // Evaluator documents for a cell all carry the same trajectory, but a
    // partial re-export can leave a differing copy. Without an explicit
    // first-wins rule the graded answer depends on document arrival order,
    // so the same golden data could yield two different verdicts.
    const first = doc();
    const later = doc({
      task: {
        model: { id: 'eis-openai-gpt-5-4-nano' },
        output: { messages: [{ message: { content: 'a different answer' } }] },
      },
    });
    expect(planReplay([first, later], refs).cells[0].agentResponse).toBe(
      'host-42 triggered the alert.'
    );
    expect(planReplay([first, later], refs).cells).toHaveLength(1);
  });

  it('skips a cell whose example is absent from the dataset', () => {
    // Golden documents carry no reference answer (example.output is empty on
    // every stored document). If a replay silently graded against undefined,
    // every answer would score inaccurate and the matrix would look like a
    // model collapse rather than a missing join.
    const unknown = doc({
      example: { id: 'not-in-dataset', input: { question: 'q' }, output: {} },
    });
    const plan = planReplay([unknown], refs);
    expect(plan.cells).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain('dataset reference');
  });

  it('takes the reference from the dataset, not the document', () => {
    const misleading = doc({
      example: {
        id: 'persona-001',
        input: { question: 'Which host triggered the alert?' },
        output: { expected: 'WRONG-from-doc' },
      },
    });
    expect(planReplay([misleading], refs).cells[0].expected).toBe('host-42');
  });

  it('keeps distinct examples and distinct executions apart', () => {
    const other = doc({
      example: {
        id: 'persona-002',
        input: { question: 'Q2' },
        output: { expected: 'A2' },
      },
    });
    const otherRun = doc({
      metadata: { execution_id: 'sweep-other::suite::model', total_repetitions: 1 },
    });
    expect(planReplay([doc(), other, otherRun], refs).cells).toHaveLength(3);
  });

  it('skips ungradeable cells instead of grading empty strings', () => {
    const noAnswer = doc({ task: { model: { id: 'm' }, output: { messages: [] } } });
    const plan = planReplay([noAnswer], refs);
    expect(plan.cells).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toContain('agent response');
  });

  it('reports every missing judge input by name', () => {
    const bare = doc({
      // Id absent from the dataset, so all three judge inputs are missing.
      example: { id: 'not-in-dataset', input: {}, output: {} },
      task: { model: { id: 'm' }, output: { messages: [] } },
    });
    const plan = planReplay([bare], refs);
    expect(plan.skipped[0].reason).toBe('missing question, dataset reference, agent response');
  });

  it('reports an unreplayable cell once, not once per evaluator', () => {
    const broken = () => doc({ task: { model: { id: 'm' }, output: { messages: [] } } });
    expect(planReplay([broken(), broken(), broken()], refs).skipped).toHaveLength(1);
  });

  it('does not both replay and skip the same cell', () => {
    // Evaluator documents for one cell arrive in no guaranteed order. If the
    // incomplete one is seen first, the cell must still count as replayable
    // exactly once -- never as a cell AND a skip, which would double-count it.
    const incomplete = doc({ task: { model: { id: 'm' }, output: { messages: [] } } });
    const forward = planReplay([incomplete, doc()], refs);
    const reverse = planReplay([doc(), incomplete], refs);
    expect(forward.cells).toHaveLength(1);
    expect(forward.skipped).toHaveLength(0);
    expect(forward).toEqual(reverse);
  });

  it('returns an empty plan for no input', () => {
    expect(planReplay([], refs)).toEqual({ cells: [], skipped: [] });
  });
});

describe('replayExecutionId', () => {
  it('namespaces re-judged scores under their judge', () => {
    // Two judges must never merge into one execution: the matrix aggregates by
    // execution, so a mixed execution silently averages disagreeing verdicts.
    expect(replayExecutionId('sweep-1::suite::model', 'haiku')).toBe(
      'sweep-1::suite::model::rejudge-haiku'
    );
    expect(replayExecutionId('sweep-1::suite::model', 'gemini')).not.toBe(
      replayExecutionId('sweep-1::suite::model', 'haiku')
    );
  });

  it('refuses an empty judge tag', () => {
    expect(() => replayExecutionId('sweep-1', '')).toThrow(/judge tag/);
  });
});

describe('summarizePlan', () => {
  it('counts cells, models and executions', () => {
    const plan = planReplay(
      [doc(), doc({ example: { id: 'p2', input: { question: 'q' }, output: { expected: 'e' } } })],
      refs
    );
    expect(summarizePlan(plan)).toBe('2 cell(s) across 1 model(s), 1 execution(s)');
  });

  it('surfaces unreplayable cells in the summary', () => {
    const broken = doc({
      example: { id: 'persona-broken', input: { question: 'q' }, output: { expected: 'e' } },
      task: { model: { id: 'm' }, output: { messages: [] } },
    });
    expect(summarizePlan(planReplay([doc(), broken], refs))).toContain('1 unreplayable');
  });
});

describe('planReplay with a suite jury', () => {
  /** Minimal AD-shaped jury: grades `output.insights`, ignores the transcript. */
  const adJury = {
    name: 'attack-discovery',
    suiteIds: ['attack-discovery-agent-builder'],
    evaluatorNames: ['Criteria', 'Rubric'],
    toArgs: (cell: any) =>
      Array.isArray(cell.taskOutput?.insights) && cell.taskOutput.insights.length > 0
        ? { input: {}, output: {}, expected: {}, metadata: {} }
        : null,
  };

  /** An AD cell: structured insights, but no final agent message. */
  const adDoc = doc({
    example: { id: '0', input: { question: 'Run attack discovery' }, output: {} },
    metadata: { execution_id: 'exec-ad', suite_id: 'attack-discovery-agent-builder' },
    task: {
      model: { id: 'm' },
      output: { messages: [], insights: [{ title: 'Suspicious curl' }] },
    },
  });

  it('replays a cell the persona contract would have skipped', () => {
    // Without a jury this cell is "missing agent response" -- the defect that
    // made 433 of 800 AD cells look unreplayable.
    expect(planReplay([adDoc], refs).cells).toHaveLength(0);

    const plan = planReplay([adDoc], refs, { jury: adJury as any });
    expect(plan.cells).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it('carries the raw task output and suite id onto the cell', () => {
    const [cell] = planReplay([adDoc], refs, { jury: adJury as any }).cells;
    expect((cell.taskOutput as any).insights).toHaveLength(1);
    expect(cell.suiteId).toBe('attack-discovery-agent-builder');
  });

  it('skips a cell the jury cannot grade, naming the jury', () => {
    const empty = doc({
      example: { id: '0', input: { question: 'q' }, output: {} },
      metadata: { execution_id: 'exec-ad', suite_id: 'attack-discovery-agent-builder' },
      task: { model: { id: 'm' }, output: { messages: [], insights: [] } },
    });
    const plan = planReplay([empty], refs, { jury: adJury as any });
    expect(plan.cells).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain('attack-discovery');
  });

  it('passes structured references through to the cell', () => {
    const [cell] = planReplay([adDoc], refs, {
      jury: adJury as any,
      structuredReferenceFor: () => ({ criteria: ['c1'] }),
    }).cells;
    expect(cell.expectedStructured).toEqual({ criteria: ['c1'] });
  });

  describe('join field', () => {
    // Every attack-discovery document carries example.id = '0'. Keying cells on
    // the id therefore collapses nine distinct scenarios into a single cell and
    // grades eight of them against the wrong scenario's ground truth.
    const scenarioDocs = ['wmi-lateral', 'linux-curl', 'encoded-powershell'].map((key) =>
      doc({
        example: {
          id: '0',
          metadata: { scenarioKey: key },
          input: { question: `q-${key}` },
          output: {},
        },
        metadata: { execution_id: 'exec-ad', suite_id: 'attack-discovery-agent-builder' },
        task: { model: { id: 'm' }, output: { insights: [{ title: key }] } },
      })
    );

    it('collapses distinct scenarios into one cell when keyed on example.id', () => {
      const plan = planReplay(scenarioDocs, () => 'ref', { jury: adJury as any });

      // The defect this guards against: three scenarios, one surviving cell.
      expect(plan.cells).toHaveLength(1);
    });

    it('keeps one cell per scenario when keyed on the scenario key', () => {
      const plan = planReplay(scenarioDocs, () => 'ref', {
        jury: adJury as any,
        joinField: 'example.metadata.scenarioKey',
      });

      expect(plan.cells).toHaveLength(3);
      expect(plan.cells.map((c) => c.exampleId).sort()).toEqual([
        'encoded-powershell',
        'linux-curl',
        'wmi-lateral',
      ]);
    });

    it('looks up each scenario reference by its own key', () => {
      const seen: string[] = [];
      planReplay(
        scenarioDocs,
        (id) => {
          seen.push(id);
          return `ref-${id}`;
        },
        { jury: adJury as any, joinField: 'example.metadata.scenarioKey' }
      );

      expect(seen.sort()).toEqual(['encoded-powershell', 'linux-curl', 'wmi-lateral']);
    });
  });
});
