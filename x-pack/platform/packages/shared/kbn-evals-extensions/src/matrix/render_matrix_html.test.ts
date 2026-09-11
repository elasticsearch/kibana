/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderMatrixHtml } from './render_matrix_html';
import type { Matrix } from './build_matrix';
import type { MatrixConfig } from './load_matrix_config';
import type { MatrixTraceData } from './trace_types';

const mockConfig: MatrixConfig = {
  title: 'Test Matrix',
  branch: 'main',
  lookbackDays: 30,
  defaultScale: 10,
  decimals: 2,
  notRecommendedBelow: 0,
  toolCallWarnAbove: 0,
  minCoverage: 0,
  notRecommendedLabel: 'Not recommended',
  notRecommendedCountsAsZeroInOverall: true,
  excludeEvaluators: [],
  overall: { label: 'Overall', mode: 'weighted', excludeSaturatedEvaluators: false },
  showOverall: true,
  columns: [
    {
      id: 'alert',
      label: 'Alert Analysis',
      group: 'Agent Builder',
      suites: ['suite-1'],
      weight: 1,
    },
    {
      id: 'threat',
      label: 'Threat Hunting',
      group: 'Agent Builder',
      suites: ['suite-2'],
      weight: 1,
    },
  ],
  composites: [],
  models: [{ id: 'test-model', label: 'Test Model', openSource: false }],
};

const mockMatrix: Matrix = {
  columns: [
    { id: 'alert', label: 'Alert Analysis', group: 'Agent Builder' },
    { id: 'threat', label: 'Threat Hunting', group: 'Agent Builder' },
  ],
  composites: [],
  displayColumns: [
    { id: 'alert', label: 'Alert Analysis', kind: 'base' },
    { id: 'threat', label: 'Threat Hunting', kind: 'base' },
    { id: '__overall__', label: 'Overall', kind: 'overall' },
  ],
  overallLabel: 'Overall',
  evaluatorSaturation: [],
  proprietary: [
    {
      modelId: 'test-model',
      modelLabel: 'Test Model',
      openSource: false,
      cells: {
        alert: { kind: 'score', value: 8.5 },
        threat: { kind: 'score', value: 7.4 },
      },
      overall: { kind: 'score', value: 7.95 },
      coverage: { covered: 2, total: 2 },
    },
  ],
  openSource: [],
};

describe('renderMatrixHtml', () => {
  it('renders a self-contained HTML document', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<style>');
    expect(html).toContain('Test Matrix');
    expect(html).toContain('Test Model');
    expect(html).toContain('8.5');
  });

  it('renders a token-cost table when matrix.tokenCost is populated', () => {
    const matrixWithCost: Matrix = {
      ...mockMatrix,
      tokenCost: {
        models: [
          {
            modelId: 'test-model',
            modelLabel: 'Test Model',
            openSource: false,
            cells: [
              {
                columnId: 'alert',
                inputTokens: { mean: 1200, min: 1000, max: 1400, count: 3 },
                outputTokens: { mean: 300, min: 250, max: 350, count: 3 },
                totalMean: 1500,
              },
              { columnId: 'threat', totalMean: 4000 },
            ],
          },
        ],
      },
    };
    const html = renderMatrixHtml(matrixWithCost, mockConfig);
    expect(html).toContain('Token cost per (model, column)');
    expect(html).toContain('tokencost');
    // 1500 -> "2k" (toFixed(0) rounds 1.5 up), 4000 -> "4k", total 5500 -> "5k"/"6k"
    expect(html).toContain('>2k</td>');
    expect(html).toContain('>4k</td>');
    expect(html).toContain('in 1,200 / out 300');
  });

  it('omits the token-cost table when matrix.tokenCost is absent', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig);
    expect(html).not.toContain('Token cost per (model, column)');
  });

  it('renders trace data when provided', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        question: 'What is this alert?',
        toolTrail: ['load_skill', 'security.alerts'],
        answer: '## Analysis\n\nThis is a true positive.',
        steps: [
          { type: 'reasoning', text: 'Loading the alert analysis skill.' },
          { type: 'tool', toolId: 'load_skill', toolParams: '' },
        ],
        stepCount: 2,
        toolCount: 1,
      },
    };

    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    expect(html).toContain('💬');
    expect(html).toContain('What is this alert?');
    expect(html).toContain('load_skill');
    expect(html).toContain('security.alerts');
    expect(html).toContain('Analysis');
    expect(html).toContain('true positive');
    expect(html).toContain('🔍 Step trace');
  });

  describe('untrusted model output in answers', () => {
    const renderAnswer = (answer: string) =>
      renderMatrixHtml(
        mockMatrix,
        mockConfig,
        {},
        {
          'test-model:alert': {
            question: 'q',
            toolTrail: [],
            answer,
            steps: [],
            stepCount: 0,
            toolCount: 0,
          },
        }
      );

    // The answer is output from the evaluated model, and this package also
    // ships redTeamCmd, whose entire purpose is coaxing adversarial output.
    // Assembled at runtime so the linter's `no-script-url` pattern match does
    // not fire on a literal — these are payloads under test, not real links.
    const scheme = (s: string) => `${s}:alert(1)`;

    it.each([
      ['script scheme', `[click](${scheme('javascript')})`],
      ['mixed-case script scheme', `[click](${scheme('JaVaScRiPt')})`],
      ['data: html', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
      ['leading-space bypass', `[x](  ${scheme('javascript')})`],
    ])('strips the href for a %s URL', (_label, answer) => {
      const html = renderAnswer(answer);
      expect(html).not.toMatch(/href="javascript:/i);
      expect(html).not.toMatch(/href="data:/i);
      expect(html).not.toMatch(/href="\s/);
    });

    it('keeps plain http(s) links', () => {
      expect(renderAnswer('[ok](https://example.com/a?b=1)')).toContain(
        '<a href="https://example.com/a?b=1">ok</a>'
      );
    });

    it('does not emit a raw event-handler attribute inside the href', () => {
      const html = renderAnswer('[x](https://e.com onmouseover=alert(1))');
      expect(html).not.toMatch(/href="[^"]*\son[a-z]+=/i);
    });

    it('escapes raw HTML in the answer body', () => {
      const html = renderAnswer('<img src=x onerror=alert(1)>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img');
    });
  });

  it('shows trace unavailable when no traces provided', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig);
    expect(html).toContain('Trace unavailable');
  });

  it('labels scored-but-traceless cells as code-evaluated, not trace-unavailable', () => {
    // Extra-suite columns (rule/dashboard translation, attack discovery) are
    // scored without an agent conversation: the trace entry carries only
    // evaluator scores (no question, no steps). "No final answer captured"
    // reads as a capture failure there; the label must say the suite has no
    // conversational agent.
    const traces: MatrixTraceData = {
      'test-model:alert': {
        stepCount: 0,
        toolCount: 0,
        scores: { 'Translation Result': 1 },
        repetitions: 1,
        repTrails: [[]],
      },
    };
    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    expect(html).toContain(
      'No agent trace — this suite is evaluated without a conversational agent'
    );
  });

  it('renders each variant card with its own per-example score, not the column aggregate', () => {
    const configWithPrefixes: MatrixConfig = {
      ...mockConfig,
      columns: [
        {
          id: 'alert-analysis',
          label: 'Alert Analysis',
          group: 'Agent Builder',
          suites: ['security-persona-matrix'],
          examplePrefixes: ['alert-analysis'],
          weight: 1,
        },
      ],
    };
    const matrixWithAggregate: Matrix = {
      columns: [{ id: 'alert-analysis', label: 'Alert Analysis', group: 'Agent Builder' }],
      composites: [],
      displayColumns: [{ id: 'alert-analysis', label: 'Alert Analysis', kind: 'base' }],
      overallLabel: 'Overall',
      evaluatorSaturation: [],
      proprietary: [
        {
          modelId: 'test-model',
          modelLabel: 'Test Model',
          openSource: false,
          // Category aggregate across variants a/b/c — must not leak onto cards.
          cells: { 'alert-analysis': { kind: 'score', value: 8.48 } },
          overall: { kind: 'missing' },
          coverage: { covered: 1, total: 1 },
        },
      ],
      openSource: [],
    };
    const traces: MatrixTraceData = {
      'test-model:alert-analysis-a': {
        question: 'prompt a',
        stepCount: 22,
        toolCount: 13,
        scores: { ExpectedToolCalled: 0.95, Correctness: 0.9 },
      },
      'test-model:alert-analysis-b': {
        question: 'prompt b',
        stepCount: 27,
        toolCount: 16,
        scores: { ExpectedToolCalled: 0.6, Correctness: 0.62 },
      },
    };

    const html = renderMatrixHtml(matrixWithAggregate, configWithPrefixes, {}, traces);

    // Each variant card shows its own mean (0.925 -> 9.25, 0.61 -> 6.10).
    expect(html).toContain('score 9.25');
    expect(html).toContain('score 6.10');
    // The aggregate still appears exactly once: the summary table cell.
    expect(html).not.toContain('score 8.48');
    expect(html.match(/8\.48/g)).toHaveLength(1);
  });

  it('renders think/skill step tags in a reserved column with inline code chips in the body', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        steps: [
          { type: 'skill', skills: ['alert-analysis'] },
          { type: 'reasoning', text: 'I will load the `alert-analysis` skill first.' },
        ],
        stepCount: 2,
        toolCount: 0,
      },
    };
    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    // Tag lives in its own span, body wrapped in .step-text (flex layout keeps
    // SKILL/THINK from overlapping the paragraph).
    expect(html).toContain('<span class="step-tag">skill</span><span class="step-text">');
    expect(html).toContain('<span class="step-tag">think</span><span class="step-text">');
    // Backticks in reasoning render as inline <code> inside the paragraph.
    expect(html).toContain(
      '<span class="step-text">I will load the <code>alert-analysis</code> skill first.</span>'
    );
    // CSS: text tags get a reserved column; the old fixed 16px width is gone.
    expect(html).toContain('.step.reasoning .step-tag { min-width:44px; }');
    expect(html).not.toContain(
      '.step-tag { flex:none; font-size:10px; text-transform:uppercase; letter-spacing:.05em;\n    color:var(--muted); width:16px; }'
    );
  });

  it('includes provenance when provided', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig, {
      branch: 'feature-branch',
      lookbackDays: 14,
      commitSha: 'abc123',
    });
    expect(html).toContain('feature-branch');
    expect(html).toContain('14-day lookback');
    expect(html).toContain('abc123');
  });

  it('resolves traces via suite ID fallback when column ID does not match', () => {
    // Column ID is 'triage' but traces are keyed by suite ID 'security-alert-triage'
    const configWithSuite: MatrixConfig = {
      ...mockConfig,
      columns: [
        { id: 'triage', label: 'Alert Triage', suites: ['security-alert-triage'], weight: 1 },
      ],
    };
    const matrixWithSuite: Matrix = {
      ...mockMatrix,
      columns: [{ id: 'triage', label: 'Alert Triage' }],
      displayColumns: [
        { id: 'triage', label: 'Alert Triage', kind: 'base' },
        { id: '__overall__', label: 'Overall', kind: 'overall' },
      ],
      proprietary: [
        {
          modelId: 'test-model',
          modelLabel: 'Test Model',
          openSource: false,
          cells: { triage: { kind: 'score', value: 7.2 } },
          overall: { kind: 'score', value: 7.2 },
          coverage: { covered: 1, total: 1 },
        },
      ],
    };
    const traces: MatrixTraceData = {
      'test-model:security-alert-triage': {
        question: 'Triage this alert',
        toolTrail: ['alert.load'],
        stepCount: 1,
        toolCount: 1,
      },
    };

    const html = renderMatrixHtml(matrixWithSuite, configWithSuite, {}, traces);
    // The 'triage' column resolves its trace via the suite ID fallback.
    expect(html).toContain('Triage this alert');
    expect(html).toContain('alert.load');
  });

  it('renders grouped column headers when groups are present', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig);
    expect(html).toContain('colspan="2"');
    expect(html).toContain('Agent Builder');
  });

  it('does not render a grouped header when no groups are present', () => {
    const ungroupedConfig: MatrixConfig = {
      ...mockConfig,
      columns: [{ id: 'alert', label: 'Alert Analysis', suites: ['suite-1'], weight: 1 }],
    };
    const ungroupedMatrix: Matrix = {
      ...mockMatrix,
      columns: [{ id: 'alert', label: 'Alert Analysis' }],
      displayColumns: [
        { id: 'alert', label: 'Alert Analysis', kind: 'base' },
        { id: '__overall__', label: 'Overall', kind: 'overall' },
      ],
    };
    const html = renderMatrixHtml(ungroupedMatrix, ungroupedConfig);
    expect(html).not.toContain('colspan="2"');
    expect(html).not.toContain('Agent Builder');
  });

  it('strips non-http(s) link targets from markdown answers', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        question: 'q',
        toolTrail: [],
        answer:
          'Safe: [elastic](https://elastic.co) and [guide](http://example.com). ' +
          'Bad: [click](javascript:alert(1)) and [x](data:text/html;base64,AAAA).',
        stepCount: 0,
        toolCount: 0,
      },
    };

    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    // Safe links render as anchors.
    expect(html).toContain('<a href="https://elastic.co">elastic</a>');
    expect(html).toContain('<a href="http://example.com">guide</a>');
    // Dangerous schemes are not emitted into href attributes.
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    // The link text is preserved (dropped back to plain text).
    expect(html).toContain('click');
    expect(html).toContain('x');
  });

  it('renders markdown pipe tables as HTML tables, not paragraph soup', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        question: 'q',
        toolTrail: [],
        answer:
          '| Field | Value |\n' +
          '|-------|-------|\n' +
          '| **Process** | `BluetoothService.exe` |\n' +
          '| **User Context** | SYSTEM |\n\n' +
          '### Context\n- item one\n- item two',
        stepCount: 0,
        toolCount: 0,
      },
    };

    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    // The table is recognized and rendered as a real table element.
    expect(html).toContain('<table class="md"><thead><tr>');
    expect(html).toContain('<th>Field</th>');
    expect(html).toContain('<th>Value</th>');
    expect(html).toContain('<td><strong>Process</strong></td>');
    expect(html).toContain('<td><code>BluetoothService.exe</code></td>');
    // Raw pipes must not leak as paragraph text once a table is parsed.
    expect(html).not.toMatch(/<p>\|/);
    // Content after the table still renders normally.
    expect(html).toContain('<h6>Context</h6>');
  });

  it('renders blockquote lines and escapes cell content in tables', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        question: 'q',
        toolTrail: [],
        answer:
          '> quoted note <script>alert(1)</script>\n' +
          '| a | b |\n' +
          '|---|---|\n' +
          '| <img src=x onerror=alert(1)> | plain |',
        stepCount: 0,
        toolCount: 0,
      },
    };

    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    expect(html).toContain('<blockquote>');
    // Untrusted cell/script content is escaped, never emitted as live HTML.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders fenced code blocks verbatim, protecting ES|QL pipes from table parsing', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        question: 'q',
        toolTrail: [],
        answer:
          'Query:\n```\nFROM logs-endpoint.events.library-*\n' +
          '| WHERE event.category == "library" AND dll.name == "log.dll"\n' +
          '| STATS load_count = COUNT(*) BY host.name\n```\nDone.',
        stepCount: 0,
        toolCount: 0,
      },
    };

    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    expect(html).toContain('<pre><code>FROM logs-endpoint.events.library-*');
    // Pipes inside the code block must NOT become a markdown table.
    expect(html).not.toContain('<table class="md"><thead><tr><th>FROM logs');
    expect(html).not.toMatch(/<p>\| WHERE/);
    expect(html).toContain('Done.');
  });

  it('renders bold inside headings and indented sub-bullets as nested lists', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': {
        question: 'q',
        toolTrail: [],
        answer:
          '### **Analysis of the Alert**\n' +
          '- **Technique:** DLL Side-Loading\n' +
          '  * **Host:** `srv-win-defend-01`\n' +
          '  * **User:** SYSTEM\n' +
          '- **Severity:** High\n' +
          '**Is it something you should worry about?** Yes.',
        stepCount: 0,
        toolCount: 0,
      },
    };

    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    // Heading content runs through inline markdown: no literal asterisks.
    expect(html).toContain('<h6><strong>Analysis of the Alert</strong></h6>');
    // Indented '  * item' becomes a nested <ul> inside the previous <li>...
    expect(html).toMatch(/<li><strong>Technique:<\/strong> DLL Side-Loading<ul>/);
    expect(html).toMatch(/<li><strong>Host:<\/strong> <code>srv-win-defend-01<\/code><\/li>/);
    // ...and the nested list closes before the next top-level bullet.
    expect(html).toMatch(/<\/ul><\/li>\s*<li><strong>Severity:<\/strong> High<\/li>/);
    // No literal asterisk-bullet paragraphs remain.
    expect(html).not.toMatch(/<p>\s*\* /);
    expect(html).not.toContain('**');
  });

  it('badges the repetition count on trace cards', () => {
    const traces: MatrixTraceData = {
      'test-model:alert': { question: 'q', stepCount: 3, toolCount: 2, repetitions: 3 },
    };
    const html = renderMatrixHtml(mockMatrix, mockConfig, {}, traces);
    expect(html).toContain('3 reps');
  });

  it('renders the fixture fingerprint in the provenance line', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig, {
      fixtureFingerprint: 'sha256:abc123',
    });
    expect(html).toContain('fixtures `sha256:abc123`');
  });

  it('renders methodology notes as a collapsible block, escaped', () => {
    const html = renderMatrixHtml(mockMatrix, mockConfig, {
      methodologyNotes: [
        'ExpectedToolCalled checks the full declared set',
        'note with <b>html</b>',
      ],
    });
    expect(html).toContain('<details class="methodology">');
    expect(html).toContain('<li>ExpectedToolCalled checks the full declared set</li>');
    expect(html).toContain('&lt;b&gt;html&lt;/b&gt;');
    expect(html).not.toContain('<li>note with <b>');
    // No block at all when notes are absent.
    expect(renderMatrixHtml(mockMatrix, mockConfig)).not.toContain('class="methodology"');
  });
});

describe('renderMatrixHtml tie tiers', () => {
  const tiered = (tier?: number): Matrix => ({
    ...mockMatrix,
    proprietary: [{ ...mockMatrix.proprietary[0], tier }],
  });

  it('labels the Overall score with its tie tier', () => {
    // The tier is the honest unit of ranking: rows in one tier differ by less
    // than the measured run-to-run noise, so publishing the bare number invites
    // a precision the data does not have.
    const html = renderMatrixHtml(tiered(2), mockConfig);

    expect(html).toContain('T2');
    expect(html).toContain('not distinguishable at the measured run-to-run noise level');
  });

  it('omits the tier marker when tiering is not configured', () => {
    const html = renderMatrixHtml(tiered(undefined), mockConfig);

    expect(html).not.toContain('Tie tier');
  });
});

describe('renderMatrixHtml saturation disclosure', () => {
  it('states which evaluators Overall dropped, so the score change is not silent', () => {
    const html = renderMatrixHtml(
      {
        ...mockMatrix,
        evaluatorSaturation: [
          {
            evaluatorName: 'FinalAnswerPresent',
            mean: 0.885,
            stdev: 0.05,
            range: 0.19,
            distinctValues: 12,
            observations: 20,
            saturated: true,
          },
          {
            evaluatorName: 'Factuality',
            mean: 0.355,
            stdev: 0.1,
            range: 0.324,
            distinctValues: 19,
            observations: 20,
            saturated: false,
          },
        ],
      },
      mockConfig
    );

    expect(html).toContain('Overall excludes 1 non-discriminating evaluator(s)');
    expect(html).toContain('FinalAnswerPresent (spread 0.19 across 20 models)');
    // A discriminating evaluator must not be named as excluded.
    expect(html).not.toContain('Factuality (spread');
  });

  it('omits the note entirely when nothing is saturated', () => {
    const html = renderMatrixHtml({ ...mockMatrix, evaluatorSaturation: [] }, mockConfig);
    expect(html).not.toContain('non-discriminating evaluator');
  });
});
