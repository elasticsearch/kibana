/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isWholeValueTemplateExpression } from '@kbn/workflows';
import { WorkflowTemplatingEngine } from './templating_engine';

/**
 * `withTemplateStringSupport` in @kbn/workflows widens array-typed connector params to also
 * accept a template string, gating on `isWholeValueTemplateExpression`. That gate is only
 * sound if every form it accepts really does resolve back to an array here — otherwise the
 * YAML validates, is persisted, and then hands the connector a string at execution time.
 *
 * These tests pin that invariant across the package boundary so the two sides cannot drift.
 */
describe('whole-value template expressions resolve to their native type', () => {
  const engine = new WorkflowTemplatingEngine();
  const context = { workflow: { inputs: { recipients: ['a@b.com', 'c@d.com'] } } };

  const ACCEPTED = [
    '${{ workflow.inputs.recipients }}',
    '${{workflow.inputs.recipients}}',
    '${{ workflow.inputs.recipients | reverse }}',
  ];

  it.each(ACCEPTED)('%s is accepted by the schema gate', (template) => {
    expect(isWholeValueTemplateExpression(template)).toBe(true);
  });

  it.each(ACCEPTED)('%s renders to an array, not a string', (template) => {
    const rendered = engine.render(template, context);
    expect(Array.isArray(rendered)).toBe(true);
  });

  it('preserves the array contents rather than stringifying them', () => {
    expect(engine.render('${{ workflow.inputs.recipients }}', context)).toEqual([
      'a@b.com',
      'c@d.com',
    ]);
  });

  // The engine accepts a superset of the gate: these forms are rejected by the schema
  // precisely because they lose the array here. Each case documents why the gate is narrow.
  describe('forms the schema rejects because the runtime cannot preserve the type', () => {
    it('renders a bare {{ expr }} to a string', () => {
      const template = '{{ workflow.inputs.recipients }}';
      expect(isWholeValueTemplateExpression(template)).toBe(false);
      expect(typeof engine.render(template, context)).toBe('string');
    });

    it('renders a padded ${{ expr }} to a string, because the runtime check does not trim', () => {
      const template = '  ${{ workflow.inputs.recipients }}';
      expect(isWholeValueTemplateExpression(template)).toBe(false);
      expect(typeof engine.render(template, context)).toBe('string');
    });

    it('throws on two concatenated ${{ }} expressions', () => {
      const template = '${{ workflow.inputs.recipients }}-${{ workflow.inputs.recipients }}';
      expect(isWholeValueTemplateExpression(template)).toBe(false);
      expect(() => engine.render(template, context)).toThrow('The provided expression is invalid');
    });
  });
});
