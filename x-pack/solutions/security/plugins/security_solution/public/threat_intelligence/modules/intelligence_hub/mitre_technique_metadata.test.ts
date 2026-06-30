/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getMitreTechniqueMetadata } from './mitre_technique_metadata';

describe('getMitreTechniqueMetadata', () => {
  it('resolves a parent technique with tactic and reference', () => {
    expect(getMitreTechniqueMetadata('T1195')).toEqual({
      technique_id: 'T1195',
      name: 'Supply Chain Compromise',
      reference: 'https://attack.mitre.org/techniques/T1195/',
      tactic_name: 'Initial Access',
    });
  });

  it('resolves a sub-technique', () => {
    expect(getMitreTechniqueMetadata('T1195.002')).toEqual({
      technique_id: 'T1195.002',
      name: 'Compromise Software Supply Chain',
      reference: 'https://attack.mitre.org/techniques/T1195/002/',
      tactic_name: 'Initial Access',
    });
  });

  it('falls back to the raw id for unknown techniques', () => {
    expect(getMitreTechniqueMetadata('T9999')).toEqual({
      technique_id: 'T9999',
      name: 'T9999',
    });
  });
});
