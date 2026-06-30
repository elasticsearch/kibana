/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildInvestigatorInput } from './build_agent_input';

describe('buildInvestigatorInput', () => {
  it('emits the exact headings the prompt expects, with compact JSON', () => {
    const input = buildInvestigatorInput({
      episodeSuffix: 'a1b2c3d4',
      detections: [{ rule_uuid: 'r1' }],
    });

    expect(input).toBe('## New episode suffix\na1b2c3d4\n\n## Active batch\n[{"rule_uuid":"r1"}]');
    expect(input).not.toContain('\n  '); // not pretty-printed
  });

  it('omits the Continuation Candidates section when there are none', () => {
    const input = buildInvestigatorInput({ episodeSuffix: 's', detections: [] });
    expect(input).not.toContain('Continuation Candidates');
  });

  it('includes the Continuation Candidates section when provided', () => {
    const input = buildInvestigatorInput({
      episodeSuffix: 's',
      detections: [{ rule_uuid: 'r1' }],
      continuationCandidates: [{ discovery_slug: 'svc__x-s' }],
    });
    expect(input).toContain('## Continuation Candidates\n[{"discovery_slug":"svc__x-s"}]');
  });
});
