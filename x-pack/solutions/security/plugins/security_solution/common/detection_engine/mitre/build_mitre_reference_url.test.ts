/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildMitreReferenceUrl } from './build_mitre_reference_url';

describe('buildMitreReferenceUrl', () => {
  it('builds a tactic URL for TAxxxx ids', () => {
    expect(buildMitreReferenceUrl('TA0005')).toBe('https://attack.mitre.org/tactics/TA0005/');
  });

  it('builds a technique URL for Txxxx ids', () => {
    expect(buildMitreReferenceUrl('T1548')).toBe('https://attack.mitre.org/techniques/T1548/');
  });

  it('builds a subtechnique URL for Txxxx.yyy ids', () => {
    expect(buildMitreReferenceUrl('T1548.002')).toBe(
      'https://attack.mitre.org/techniques/T1548/002/'
    );
  });

  it('returns undefined for an empty id', () => {
    expect(buildMitreReferenceUrl('')).toBeUndefined();
  });

  it('returns undefined for ids that do not match a known prefix', () => {
    expect(buildMitreReferenceUrl('X1234')).toBeUndefined();
    expect(buildMitreReferenceUrl('FAKE-001')).toBeUndefined();
  });
});
