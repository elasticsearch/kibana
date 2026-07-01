/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Threats } from '@kbn/securitysolution-io-ts-alerting-types';
import { findInvalidMitreIds, isKnownMitreId } from './find_invalid_mitre_ids';

const MITRE_FRAMEWORK = 'MITRE ATT&CK';

// Valid IDs sampled from the bundled mitre_tactics_techniques.ts
const VALID_TACTIC_ID = 'TA0005'; // Defense Evasion
const VALID_TECHNIQUE_ID = 'T1548'; // Abuse Elevation Control Mechanism
const VALID_SUBTECHNIQUE_ID = 'T1548.002'; // Bypass User Account Control

const makeThreat = (overrides?: Partial<Threats[number]>): Threats[number] => ({
  framework: MITRE_FRAMEWORK,
  tactic: {
    id: VALID_TACTIC_ID,
    name: 'Defense Evasion',
    reference: 'https://attack.mitre.org/tactics/TA0005/',
  },
  technique: [],
  ...overrides,
});

describe('findInvalidMitreIds', () => {
  it('returns empty array for undefined threats', () => {
    expect(findInvalidMitreIds(undefined)).toEqual([]);
  });

  it('returns empty array for empty threats array', () => {
    expect(findInvalidMitreIds([])).toEqual([]);
  });

  it('returns empty array when all IDs are valid', () => {
    const threats: Threats = [
      makeThreat({
        technique: [
          {
            id: VALID_TECHNIQUE_ID,
            name: 'Abuse Elevation Control Mechanism',
            reference: 'https://attack.mitre.org/techniques/T1548/',
            subtechnique: [
              {
                id: VALID_SUBTECHNIQUE_ID,
                name: 'Bypass User Account Control',
                reference: 'https://attack.mitre.org/techniques/T1548/002/',
              },
            ],
          },
        ],
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual([]);
  });

  it('reports an unknown tactic ID', () => {
    const threats: Threats = [
      makeThreat({
        tactic: {
          id: 'TA9999',
          name: 'Fake Tactic',
          reference: 'https://attack.mitre.org/tactics/TA9999/',
        },
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual(['TA9999']);
  });

  it('reports an unknown technique ID', () => {
    const threats: Threats = [
      makeThreat({
        technique: [
          {
            id: 'T9999',
            name: 'Fake Technique',
            reference: 'https://attack.mitre.org/techniques/T9999/',
          },
        ],
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual(['T9999']);
  });

  it('reports an unknown subtechnique ID', () => {
    const threats: Threats = [
      makeThreat({
        technique: [
          {
            id: VALID_TECHNIQUE_ID,
            name: 'Abuse Elevation Control Mechanism',
            reference: 'https://attack.mitre.org/techniques/T1548/',
            subtechnique: [
              {
                id: 'T1548.999',
                name: 'Fake Subtechnique',
                reference: 'https://attack.mitre.org/techniques/T1548/999/',
              },
            ],
          },
        ],
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual(['T1548.999']);
  });

  it('reports all invalid IDs from mixed valid+invalid entries in traversal order', () => {
    const threats: Threats = [
      makeThreat({
        technique: [
          {
            id: VALID_TECHNIQUE_ID,
            name: 'Abuse Elevation Control Mechanism',
            reference: 'https://attack.mitre.org/techniques/T1548/',
            subtechnique: [
              {
                id: VALID_SUBTECHNIQUE_ID,
                name: 'Bypass User Account Control',
                reference: 'https://attack.mitre.org/techniques/T1548/002/',
              },
              {
                id: 'T1548.999',
                name: 'Fake Subtechnique',
                reference: 'https://attack.mitre.org/techniques/T1548/999/',
              },
            ],
          },
          {
            id: 'T9999',
            name: 'Fake Technique',
            reference: 'https://attack.mitre.org/techniques/T9999/',
          },
        ],
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual(['T1548.999', 'T9999']);
  });

  it('skips non-MITRE ATT&CK framework entries', () => {
    const threats: Threats = [
      {
        framework: 'Some Other Framework',
        tactic: { id: 'FAKE-001', name: 'Fake', reference: 'https://example.com' },
        technique: [],
      },
    ];
    expect(findInvalidMitreIds(threats)).toEqual([]);
  });

  it('handles threat entries with no techniques', () => {
    const threats: Threats = [makeThreat({ technique: [] })];
    expect(findInvalidMitreIds(threats)).toEqual([]);
  });

  it('handles threat entries with no subtechniques', () => {
    const threats: Threats = [
      makeThreat({
        technique: [
          {
            id: VALID_TECHNIQUE_ID,
            name: 'Abuse Elevation Control Mechanism',
            reference: 'https://attack.mitre.org/techniques/T1548/',
          },
        ],
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual([]);
  });

  it('reports invalid IDs across multiple threat items', () => {
    const threats: Threats = [
      makeThreat({
        tactic: { id: 'TA9998', name: 'Fake Tactic 1', reference: 'https://example.com' },
      }),
      makeThreat({
        tactic: { id: 'TA9999', name: 'Fake Tactic 2', reference: 'https://example.com' },
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual(['TA9998', 'TA9999']);
  });

  it('deduplicates invalid IDs that appear multiple times across threats', () => {
    const threats: Threats = [
      makeThreat({
        tactic: { id: 'TA9999', name: 'Fake Tactic', reference: 'https://example.com' },
        technique: [
          {
            id: 'T9999',
            name: 'Fake Technique',
            reference: 'https://example.com',
            subtechnique: [
              { id: 'T9999.001', name: 'Fake Sub', reference: 'https://example.com' },
              { id: 'T9999.001', name: 'Fake Sub Dup', reference: 'https://example.com' },
            ],
          },
        ],
      }),
      makeThreat({
        tactic: { id: 'TA9999', name: 'Fake Tactic Again', reference: 'https://example.com' },
        technique: [
          {
            id: 'T9999',
            name: 'Fake Technique Again',
            reference: 'https://example.com',
          },
        ],
      }),
    ];
    expect(findInvalidMitreIds(threats)).toEqual(['TA9999', 'T9999', 'T9999.001']);
  });
});

describe('isKnownMitreId', () => {
  it('returns true for known tactic IDs', () => {
    expect(isKnownMitreId('tactic', VALID_TACTIC_ID)).toBe(true);
  });

  it('returns true for known technique IDs', () => {
    expect(isKnownMitreId('technique', VALID_TECHNIQUE_ID)).toBe(true);
  });

  it('returns true for known subtechnique IDs', () => {
    expect(isKnownMitreId('subtechnique', VALID_SUBTECHNIQUE_ID)).toBe(true);
  });

  it('returns false for unknown tactic IDs', () => {
    expect(isKnownMitreId('tactic', 'TA9999')).toBe(false);
  });

  it('returns false for unknown technique IDs', () => {
    expect(isKnownMitreId('technique', 'T9999')).toBe(false);
  });

  it('returns false for unknown subtechnique IDs', () => {
    expect(isKnownMitreId('subtechnique', 'T1548.999')).toBe(false);
  });
});
