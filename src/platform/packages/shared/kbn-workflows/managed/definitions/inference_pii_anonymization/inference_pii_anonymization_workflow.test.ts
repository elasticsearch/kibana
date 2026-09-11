/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { RE2JS } from 're2js';
import { parse } from 'yaml';
import { INFERENCE_PII_ANONYMIZATION_WORKFLOW } from '.';

describe('INFERENCE_PII_ANONYMIZATION_WORKFLOW', () => {
  const workflow = parse(INFERENCE_PII_ANONYMIZATION_WORKFLOW.yaml) as Record<string, unknown>;

  it('ships disabled with its output contract', () => {
    expect(workflow.enabled).toBe(false);
    expect(workflow.outputs).toEqual([{ name: 'content', type: 'string', required: true }]);
  });

  it('contains the default regex protection rules', () => {
    const steps = workflow.steps as Array<Record<string, unknown>>;
    const anonymizeStep = steps.find(({ type }) => type === 'ai.pii') as {
      with: { rules: Array<{ entityClass: string; enabled: boolean }> };
    };

    expect(anonymizeStep.with.rules).toEqual(
      expect.arrayContaining(
        ['EMAIL', 'IP', 'HOST_NAME', 'USER_NAME'].map((entityClass) =>
          expect.objectContaining({ entityClass, enabled: true })
        )
      )
    );
  });

  it('all regex patterns compile under RE2', () => {
    const steps = workflow.steps as Array<Record<string, unknown>>;
    const anonymizeStep = steps.find(({ type }) => type === 'ai.pii') as {
      with: { rules: Array<{ type: string; pattern?: string }> };
    };
    const regexRules = anonymizeStep.with.rules.filter(({ type }) => type === 'RegExp');
    for (const rule of regexRules) {
      if (rule.pattern) {
        expect(() => RE2JS.compile(rule.pattern!)).not.toThrow();
      }
    }
  });

  it('wraps exactly one inference call and restores its output', () => {
    const steps = workflow.steps as Array<Record<string, unknown>>;

    expect(steps.filter(({ type }) => type === 'call_site.proceed')).toHaveLength(1);
    expect(steps.map(({ type }) => type)).toEqual([
      'ai.pii',
      'call_site.proceed',
      'transform.pii_restore',
      'workflow.output',
    ]);
    expect(workflow.triggers).toEqual([{ type: 'inference.aroundCompletion' }]);
  });
});
