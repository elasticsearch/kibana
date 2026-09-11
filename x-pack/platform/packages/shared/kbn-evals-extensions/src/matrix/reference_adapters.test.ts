/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  attackDiscoveryAdapter,
  automaticMigrationsAdapter,
  personaMatrixAdapter,
  buildStructuredReferences,
  collectExamples,
  selectAdapter,
  type DatasetExample,
} from './reference_adapters';

describe('reference adapters', () => {
  describe('persona-matrix', () => {
    const examples: DatasetExample[] = [
      { id: 'alert-analysis-a', output: { reference: 'Explain the alert.' } },
      { id: 'no-ref', output: {} },
    ];

    it('keys prose references by example id', () => {
      const refs = personaMatrixAdapter.build(examples);
      expect(refs.get('alert-analysis-a')).toBe('Explain the alert.');
    });

    it('omits examples without a reference rather than inventing one', () => {
      expect(personaMatrixAdapter.build(examples).has('no-ref')).toBe(false);
    });
  });

  describe('attack-discovery', () => {
    const examples: DatasetExample[] = [
      {
        output: {
          criteria: ['Insights mention encoded PowerShell.', 'Insights reference wks-alice-01.'],
          attackDiscoveries: [
            {
              title: 'Encoded PowerShell on wks-alice-01',
              summaryMarkdown: 'Office spawned encoded PowerShell.',
              mitreAttackTactics: ['Execution', 'Persistence'],
            },
          ],
        },
        metadata: { scenarioKey: 'encoded-powershell' },
      },
      { output: { criteria: ['Insights reference web-prod-07.'] } },
    ];

    // Verified against 351 golden docs (2026-09-08): attack-discovery writes
    // example.id = '0' on every document across 9 distinct scenario datasets, so
    // a positional join matches one scenario and mis-grades the rest. The
    // scenario key is the field golden actually varies.
    it('joins by scenario key when the dataset supplies one', () => {
      const refs = attackDiscoveryAdapter.build(examples);
      expect([...refs.keys()]).toEqual(['encoded-powershell', '1']);
    });

    it('renders every criterion into the reference text', () => {
      const ref = attackDiscoveryAdapter.build(examples).get('encoded-powershell')!;
      expect(ref).toContain('Insights mention encoded PowerShell.');
      expect(ref).toContain('Insights reference wks-alice-01.');
    });

    it('includes expected discovery detail and tactics', () => {
      const ref = attackDiscoveryAdapter.build(examples).get('encoded-powershell')!;
      expect(ref).toContain('Encoded PowerShell on wks-alice-01');
      expect(ref).toContain('Execution, Persistence');
    });

    // The header is what tells the judge criteria are conjunctive, not a menu.
    it('instructs the judge that all criteria must hold', () => {
      const ref = attackDiscoveryAdapter.build(examples).get('encoded-powershell')!;
      expect(ref).toContain('must satisfy all of the following');
    });

    it('drops examples with no ground truth at all', () => {
      const refs = attackDiscoveryAdapter.build([{ output: {} }]);
      expect(refs.size).toBe(0);
    });
  });

  describe('automatic-migrations', () => {
    const examples: DatasetExample[] = [
      {
        id: 'splunk-simple-001',
        output: {
          translation_result: 'full',
          esql_query: 'FROM logs | WHERE user == "root"',
          index_pattern: 'logs-*',
          has_lookup_join: false,
          is_unsupported: false,
        },
      },
      {
        id: 'qradar-unsupported-001',
        output: { translation_result: 'untranslatable', esql_query: null, is_unsupported: true },
      },
    ];

    it('joins by real example id', () => {
      const refs = automaticMigrationsAdapter.build(examples);
      expect([...refs.keys()]).toEqual(['splunk-simple-001', 'qradar-unsupported-001']);
    });

    it('states the expected translation outcome in words', () => {
      const ref = automaticMigrationsAdapter.build(examples).get('splunk-simple-001')!;
      expect(ref).toContain('fully translated');
      expect(ref).toContain('FROM logs | WHERE user == "root"');
    });

    // A null esql_query is an expectation ("none"), not a missing field.
    it('distinguishes an expected-absent query from an unchecked one', () => {
      const ref = automaticMigrationsAdapter.build(examples).get('qradar-unsupported-001')!;
      expect(ref).toContain('No ES|QL query is expected');
      expect(ref).toContain('unsupported pattern');
    });
  });

  describe('module collection and selection', () => {
    it('collects examples split across several exports', () => {
      const mod = {
        splunkRules: [{ id: 's1', output: { translation_result: 'full' } }],
        qradarRules: [{ id: 'q1', output: { translation_result: 'partial' } }],
      };
      expect(collectExamples(mod)).toHaveLength(2);
    });

    // Regression: the agent-builder AD suite exports `goldenPathExamples`, which
    // was absent from the adapter's export list, so rejudging the AD column
    // failed with "does not export an examples array" -- the one suite the
    // command most needed to reach.
    it('collects the agent-builder attack-discovery fixtures', () => {
      const mod = {
        goldenPathExamples: [
          { output: { criteria: ['a'] }, metadata: { fixture: 'provided-alerts' } },
          { output: { criteria: ['b'] }, metadata: { fixture: 'live-retrieval' } },
        ],
      };
      expect(collectExamples(mod)).toHaveLength(2);
      expect(selectAdapter(collectExamples(mod))?.name).toBe('attack-discovery');
    });

    it('unwraps a dataset object exposing an examples array', () => {
      const mod = { dataset: { examples: [{ id: 'a', output: { reference: 'x' } }] } };
      expect(collectExamples(mod)).toHaveLength(1);
    });

    it('selects the adapter matching the example shape', () => {
      expect(selectAdapter([{ output: { criteria: ['x'] } }])?.name).toBe('attack-discovery');
      expect(selectAdapter([{ id: 'a', output: { translation_result: 'full' } }])?.name).toBe(
        'automatic-migrations'
      );
      expect(selectAdapter([{ id: 'a', output: { reference: 'x' } }])?.name).toBe('persona-matrix');
    });

    it('returns no adapter for an unrecognised suite shape', () => {
      expect(selectAdapter([{ id: 'a', output: { somethingElse: 1 } }])).toBeUndefined();
    });
  });

  describe('attack-discovery join key', () => {
    // Golden writes example.id = '0' on EVERY attack-discovery document because
    // each scenario is registered as its own single-example dataset. Keying the
    // references positionally therefore matches one scenario and grades the
    // other eight against scenario 0's ground truth.
    const scenarioExamples = [
      {
        metadata: { scenarioKey: 'encoded-powershell' },
        output: { criteria: ['powershell criterion'] },
      },
      { metadata: { scenarioKey: 'wmi-lateral' }, output: { criteria: ['wmi criterion'] } },
      { metadata: { scenarioKey: 'linux-curl' }, output: { criteria: ['curl criterion'] } },
    ];

    it('declares example.metadata.scenarioKey as its join field', () => {
      expect(attackDiscoveryAdapter.joinField).toBe('example.metadata.scenarioKey');
    });

    it('keys references by scenario key, not array index', () => {
      const refs = attackDiscoveryAdapter.build(scenarioExamples);

      expect([...refs.keys()].sort()).toEqual(['encoded-powershell', 'linux-curl', 'wmi-lateral']);
      // The positional contract would have produced '0', '1', '2'.
      expect(refs.has('0')).toBe(false);
    });

    it('binds each scenario to its OWN criteria', () => {
      const refs = attackDiscoveryAdapter.build(scenarioExamples);

      expect(refs.get('wmi-lateral')).toContain('wmi criterion');
      expect(refs.get('wmi-lateral')).not.toContain('powershell criterion');
      expect(refs.get('linux-curl')).toContain('curl criterion');
    });

    it('falls back to id then index when a scenario key is absent', () => {
      const refs = attackDiscoveryAdapter.build([
        { id: 'explicit-id', output: { criteria: ['a'] } },
        { output: { criteria: ['b'] } },
      ]);

      expect(refs.has('explicit-id')).toBe(true);
      expect(refs.has('1')).toBe(true);
    });

    it('keys structured ground truth identically to the prose references', () => {
      // A jury looks up prose and structured truth with ONE key. If the two maps
      // derive keys differently, every structured lookup returns undefined and a
      // jury that requires structured truth reports the cell as ungradable --
      // which reads as missing model output rather than as a key mismatch.
      const prose = attackDiscoveryAdapter.build(scenarioExamples);
      const structured = buildStructuredReferences(scenarioExamples);

      expect([...structured.keys()].sort()).toEqual([...prose.keys()].sort());
      expect(structured.get('wmi-lateral')).toBe(scenarioExamples[1].output);
    });
  });
});
