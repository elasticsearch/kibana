/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type Document, parseDocument } from 'yaml';
import { DynamicStepContextSchema } from '@kbn/workflows';
import { getShape } from '@kbn/workflows/common/utils/zod';
import { z } from '@kbn/zod/v4';
import {
  extendContextWithTemplateLocals,
  getContextSchemaWithTemplateLocals,
  mapBlockScalarSourceToValueOffset,
} from './extend_context_with_template_locals';
import { getScalarValueAtOffset } from '../../../../common/lib/yaml/get_scalar_value_at_offset';

jest.mock('../../../../common/lib/yaml/get_scalar_value_at_offset');

describe('extendContextWithTemplateLocals', () => {
  it('extends schema with assign variable name', () => {
    const template = '{% assign myVar = "hello" %} {{ myVar }}';
    const extended = extendContextWithTemplateLocals(
      DynamicStepContextSchema,
      template,
      template.length
    );
    const shape = getShape(extended);
    expect(shape).toHaveProperty('myVar');
  });

  it('infers string type for assign with string literal', () => {
    const template = '{% assign s = "text" %} {{ s }}';
    const extended = extendContextWithTemplateLocals(
      DynamicStepContextSchema,
      template,
      template.length
    );
    const shape = getShape(extended);
    expect(shape.s).toBeDefined();
    expect(shape.s instanceof z.ZodString).toBe(true);
  });

  it('infers string type for capture variables', () => {
    const template = '{% capture cap %}body{% endcapture %} {{ cap }}';
    const extended = extendContextWithTemplateLocals(
      DynamicStepContextSchema,
      template,
      template.length
    );
    const shape = getShape(extended);
    expect(shape.cap).toBeDefined();
    expect(shape.cap instanceof z.ZodString).toBe(true);
  });

  it('infers number type for assign with number literal', () => {
    const template = '{% assign n = 42 %} {{ n }}';
    const extended = extendContextWithTemplateLocals(
      DynamicStepContextSchema,
      template,
      template.length
    );
    const shape = getShape(extended);
    expect(shape.n).toBeDefined();
    expect(shape.n instanceof z.ZodNumber).toBe(true);
  });

  it('extends schema with for-loop variable and forloop', () => {
    const template = '{% for item in items %} {{ item }} {{ forloop.index }} {% endfor %}';
    const bodyStart = template.indexOf(' {{ item }}');
    const offsetInBody = bodyStart + 3;
    const extended = extendContextWithTemplateLocals(
      DynamicStepContextSchema,
      template,
      offsetInBody
    );
    const shape = getShape(extended);
    expect(shape).toHaveProperty('item');
    expect(shape).toHaveProperty('forloop');
  });

  it('returns base schema when no template locals at offset', () => {
    const template = '{{ workflow.id }}';
    const extended = extendContextWithTemplateLocals(DynamicStepContextSchema, template, 0);
    expect(extended).toBe(DynamicStepContextSchema);
  });

  it('inner for-loop variable schema shadows outer when variable names collide', () => {
    const stepContext = DynamicStepContextSchema.extend({
      steps: z.object({
        a: z.object({ output: z.array(z.object({ id: z.string() })) }),
        b: z.object({ output: z.array(z.object({ name: z.string() })) }),
      }),
    });
    const template =
      '{% for item in steps.a.output %}{% for item in steps.b.output %}{{ item.name }}{% endfor %}{% endfor %}';
    const innerBodyOffset = template.indexOf('{{ item.name }}') + 5;
    const extended = extendContextWithTemplateLocals(stepContext, template, innerBodyOffset);
    const itemSchema = getShape(extended).item as z.ZodType;
    expect(itemSchema.safeParse({ name: 'Alice' }).success).toBe(true);
    expect(itemSchema.safeParse({ id: '1' }).success).toBe(false);
  });
});

describe('getContextSchemaWithTemplateLocals', () => {
  const mockGetScalarValueAtOffset = getScalarValueAtOffset as jest.MockedFunction<
    typeof getScalarValueAtOffset
  >;
  const realGetScalarValueAtOffset = jest.requireActual<
    typeof import('../../../../common/lib/yaml/get_scalar_value_at_offset')
  >('../../../../common/lib/yaml/get_scalar_value_at_offset').getScalarValueAtOffset;

  it('returns base schema when scalar at offset is null', () => {
    mockGetScalarValueAtOffset.mockReturnValue(null);
    const doc = {} as Document;
    expect(getContextSchemaWithTemplateLocals(doc, 0, DynamicStepContextSchema)).toBe(
      DynamicStepContextSchema
    );
  });

  it('returns base schema when scalar value is not a string', () => {
    mockGetScalarValueAtOffset.mockReturnValue({ value: 42, range: [0, 2] } as any);
    const doc = {} as Document;
    expect(getContextSchemaWithTemplateLocals(doc, 0, DynamicStepContextSchema)).toBe(
      DynamicStepContextSchema
    );
  });

  it('extends schema when offset is inside a plain scalar (template)', () => {
    const templateString = '{% assign myVar = "hello" %} {{ myVar }}';
    const scalarStart = 50;
    const valueEnd = scalarStart + templateString.length;
    mockGetScalarValueAtOffset.mockReturnValue({
      value: templateString,
      type: 'PLAIN',
      range: [scalarStart, valueEnd, valueEnd],
    } as any);
    const offsetInDoc = scalarStart + templateString.indexOf(' {{ myVar }}') + 1;
    const doc = {} as Document;
    const extended = getContextSchemaWithTemplateLocals(doc, offsetInDoc, DynamicStepContextSchema);
    const shape = getShape(extended);
    expect(shape).toHaveProperty('myVar');
    expect(mockGetScalarValueAtOffset).toHaveBeenCalledWith(doc, offsetInDoc);
  });

  it('adjusts offset for double-quoted scalars', () => {
    const templateString = '{% assign x = 1 %}{{ x }}';
    const scalarStart = 10;
    const valueEnd = scalarStart + 1 + templateString.length;
    const nodeEnd = valueEnd + 1;
    mockGetScalarValueAtOffset.mockReturnValue({
      value: templateString,
      type: 'QUOTE_DOUBLE',
      range: [scalarStart, valueEnd, nodeEnd],
    } as any);
    // Document offset pointing to the {{ x }} region (after quote adjustment)
    const offsetInDoc = scalarStart + 1 + templateString.indexOf('{{ x }}') + 4;
    const doc = {} as Document;
    const extended = getContextSchemaWithTemplateLocals(doc, offsetInDoc, DynamicStepContextSchema);
    const shape = getShape(extended);
    expect(shape).toHaveProperty('x');
  });

  it('adjusts offset for single-quoted scalars', () => {
    const templateString = '{% assign y = 2 %}{{ y }}';
    const scalarStart = 5;
    const valueEnd = scalarStart + 1 + templateString.length;
    const nodeEnd = valueEnd + 1;
    mockGetScalarValueAtOffset.mockReturnValue({
      value: templateString,
      type: 'QUOTE_SINGLE',
      range: [scalarStart, valueEnd, nodeEnd],
    } as any);
    const offsetInDoc = scalarStart + 1 + templateString.indexOf('{{ y }}') + 4;
    const doc = {} as Document;
    const extended = getContextSchemaWithTemplateLocals(doc, offsetInDoc, DynamicStepContextSchema);
    const shape = getShape(extended);
    expect(shape).toHaveProperty('y');
  });

  it('extends schema for block literal scalars', () => {
    const templateString = '{% assign z = 3 %}{{ z }}';
    const yamlSource = `value: |-\n  ${templateString}\n`;
    mockGetScalarValueAtOffset.mockImplementation(realGetScalarValueAtOffset);
    const doc = parseDocument(yamlSource);
    const varYamlOffset = yamlSource.indexOf('{{ z }}');
    const result = getContextSchemaWithTemplateLocals(doc, varYamlOffset, DynamicStepContextSchema);
    const shape = getShape(result);
    expect(shape).toHaveProperty('z');
  });

  it('extends schema for block folded scalars', () => {
    const templateString = '{% assign w = 4 %}{{ w }}';
    const yamlSource = `value: >-\n  ${templateString}\n`;
    mockGetScalarValueAtOffset.mockImplementation(realGetScalarValueAtOffset);
    const doc = parseDocument(yamlSource);
    const varYamlOffset = yamlSource.indexOf('{{ w }}');
    const result = getContextSchemaWithTemplateLocals(doc, varYamlOffset, DynamicStepContextSchema);
    const shape = getShape(result);
    expect(shape).toHaveProperty('w');
  });

  it('returns base schema when offsetInTemplate is out of bounds', () => {
    const templateString = '{{ x }}';
    const scalarStart = 10;
    const valueEnd = scalarStart + 1 + templateString.length;
    const nodeEnd = valueEnd + 1;
    mockGetScalarValueAtOffset.mockReturnValue({
      value: templateString,
      type: 'QUOTE_DOUBLE',
      range: [scalarStart, valueEnd, nodeEnd],
    } as any);
    // Offset at the opening quote itself -- offsetInTemplate would be -1, out of bounds
    const doc = {} as Document;
    const result = getContextSchemaWithTemplateLocals(doc, scalarStart, DynamicStepContextSchema);
    expect(result).toBe(DynamicStepContextSchema);
  });

  it.each([
    '"a | b"',
    "'a | b'",
    "'a | b' | upcase",
    "'a | b' | json_parse | upcase",
    "'a | b' | split: '| '",
  ])('should be resilient to pipe within RHS quoted strings: %s', (expression) => {
    const templateString = `{% assign x = ${expression} %}{{ x }}`;
    const scalarStart = 10;
    // For QUOTE_DOUBLE range[0] is the opening quote; the value starts at scalarStart + 1.
    const valueEnd = scalarStart + 1 + templateString.length;
    const nodeEnd = valueEnd + 1; // closing quote
    mockGetScalarValueAtOffset.mockReturnValue({
      value: templateString,
      type: 'QUOTE_DOUBLE',
      range: [scalarStart, valueEnd, nodeEnd],
    } as any);
    // Place the cursor inside the {{ x }} output tag so offsetInTemplate lands
    // after the assign and the pipe-in-quotes RHS is fully parsed.
    const offsetInContent = templateString.indexOf('{{ x }}') + 3;
    const offsetInDoc = scalarStart + 1 + offsetInContent;
    const doc = {} as Document;
    const result = getContextSchemaWithTemplateLocals(doc, offsetInDoc, DynamicStepContextSchema);
    const shape = getShape(result);
    expect(shape).toHaveProperty('x');
    expect(shape.x).toBeDefined();
    expect(shape.x instanceof z.ZodString).toBe(true);
  });

  describe('block scalar offset mapping via Document.toString()', () => {
    const YAML_PREFIX = 'value: ';

    function buildBlockScalarYaml(header: string, indent: string, contentLines: string[]): string {
      const body = contentLines.map((l) => (l === '' ? '' : `${indent}${l}`)).join('\n');
      return `${YAML_PREFIX}${header}\n${body}\n`;
    }

    beforeEach(() => {
      mockGetScalarValueAtOffset.mockImplementation(realGetScalarValueAtOffset);
    });

    it('excludes assign that appears AFTER variable on the same line', () => {
      const yamlSource = buildBlockScalarYaml('|-', '  ', ['{{ x }}{% assign x = 1 %}']);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).not.toHaveProperty('x');
    });

    it('includes assign that appears BEFORE variable on the same line', () => {
      const templateString = '{% assign x = 1 %}{{ x }}';
      const yamlSource = buildBlockScalarYaml('|-', '  ', [templateString]);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).toHaveProperty('x');
    });

    it('excludes assign after variable even with many preceding lines', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i} content here`);
      const yamlSource = buildBlockScalarYaml('|-', '  ', [...lines, '{{ x }}{% assign x = 1 %}']);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).not.toHaveProperty('x');
    });

    it('includes assign before variable in multi-line block', () => {
      const templateString = ['{% assign x = 1 %}', '{{ x }}'];
      const yamlSource = buildBlockScalarYaml('|-', '  ', templateString);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).toHaveProperty('x');
    });

    it('handles block folded scalars correctly', () => {
      const templateString = '{{ x }}{% assign x = 1 %}';
      const yamlSource = buildBlockScalarYaml('>-', '  ', [templateString]);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).not.toHaveProperty('x');
    });

    it('handles deeply indented block scalars', () => {
      const indent = ' '.repeat(20);
      const templateString = '{{ x }}{% assign x = 1 %}';
      const yamlSource = buildBlockScalarYaml('|-', indent, [templateString]);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).not.toHaveProperty('x');
    });

    it('excludes capture when variable is on a preceding line (multi-line)', () => {
      const templateString = ['{{ cap }}', '{% capture cap %}body{% endcapture %}'];
      const yamlSource = buildBlockScalarYaml('|', '  ', templateString);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ cap }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).not.toHaveProperty('cap');
    });

    it('includes capture when variable is after the capture block (multi-line)', () => {
      const templateString = ['{% capture cap %}body{% endcapture %}', '{{ cap }}'];
      const yamlSource = buildBlockScalarYaml('|', '  ', templateString);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ cap }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).toHaveProperty('cap');
    });

    it('excludes capture on same line when variable precedes the block', () => {
      const templateString = '{{ cap }}{% capture cap %}body{% endcapture %}';
      const yamlSource = buildBlockScalarYaml('|-', '  ', [templateString]);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ cap }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).not.toHaveProperty('cap');
    });

    it('handles assign on first line + capture on second line correctly', () => {
      const templateString = [
        '{% assign a = 1 %}{{ a }}{{ cap }}',
        '{% capture cap %}body{% endcapture %}',
      ];
      const yamlSource = buildBlockScalarYaml('|', '  ', templateString);
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ cap }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      const shape = getShape(result);
      expect(shape).toHaveProperty('a');
      expect(shape).not.toHaveProperty('cap');
    });

    it('extends schema with for-loop variable in block folded scalar', () => {
      const templateLines = [
        '{%- for yy in steps.iterate_items.items %}',
        '- {{ yy.name }}',
        '{%- endfor %}',
      ];
      const yamlSource = `value: >-\n${templateLines.map((l) => `  ${l}`).join('\n')}\n`;
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ yy.name }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema,
        yamlSource
      );
      const shape = getShape(result);
      expect(shape).toHaveProperty('yy');
    });

    it('does not expose for-loop variable in folded scalar when yaml serialization is unavailable', () => {
      const templateLines = [
        '{%- for yy in steps.iterate_items.items %}',
        '- {{ yy.name }}',
        '{%- endfor %}',
      ];
      const yamlSource = `value: >-\n${templateLines.map((l) => `  ${l}`).join('\n')}\n`;
      const doc = parseDocument(yamlSource);
      const varYamlOffset = yamlSource.indexOf('{{ yy.name }}');
      const toStringSpy = jest.spyOn(doc, 'toString').mockReturnValue('x');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        varYamlOffset,
        DynamicStepContextSchema
      );
      toStringSpy.mockRestore();
      expect(getShape(result)).not.toHaveProperty('yy');
    });

    it('folded vs literal parity: literal block exposes yy with yamlSource', () => {
      const templateLines = [
        '{%- for yy in steps.iterate_items.items %}',
        '- {{ yy.name }}',
        '{%- endfor %}',
      ];
      const foldedYaml = `value: >-\n${templateLines.map((l) => `  ${l}`).join('\n')}\n`;
      const literalYaml = `value: |-\n${templateLines.map((l) => `  ${l}`).join('\n')}\n`;
      const foldedOffset = foldedYaml.indexOf('{{ yy.name }}');
      const literalOffset = literalYaml.indexOf('{{ yy.name }}');
      const foldedShape = getShape(
        getContextSchemaWithTemplateLocals(
          parseDocument(foldedYaml),
          foldedOffset,
          DynamicStepContextSchema,
          foldedYaml
        )
      );
      const literalShape = getShape(
        getContextSchemaWithTemplateLocals(
          parseDocument(literalYaml),
          literalOffset,
          DynamicStepContextSchema,
          literalYaml
        )
      );
      expect(foldedShape).toHaveProperty('yy');
      expect(literalShape).toHaveProperty('yy');
    });

    it('resolves block scalar offsets correctly when a preceding long quoted string would trigger line folding', () => {
      const longValue = 'A'.repeat(120);
      const yamlSource = [
        `longkey: "${longValue}"`,
        'template: |-',
        '  {% assign x = 1 %}{{ x }}',
        '',
      ].join('\n');
      const doc = parseDocument(yamlSource);
      const blockScalarOffset = yamlSource.indexOf('{{ x }}');
      const result = getContextSchemaWithTemplateLocals(
        doc,
        blockScalarOffset,
        DynamicStepContextSchema
      );
      expect(getShape(result)).toHaveProperty('x');
    });
  });
});

describe('mapBlockScalarSourceToValueOffset', () => {
  it('returns 0 when offset is within the header line', () => {
    const scalarSource = '|-\n  content\n';
    expect(mapBlockScalarSourceToValueOffset(scalarSource, 1, 8)).toBe(0);
  });

  it('maps first character of first content line correctly', () => {
    const scalarSource = '|-\n  content\n';
    const contentOffset = scalarSource.indexOf('content');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, contentOffset, 8)).toBe(0);
  });

  it('maps character within first content line', () => {
    const scalarSource = '|-\n  content\n';
    const tOffset = scalarSource.indexOf('tent');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, tOffset, 8)).toBe(3);
  });

  it('maps across multiple lines with 2-space indent', () => {
    const scalarSource = '|-\n  line1\n  line2\n  target\n';
    const targetOffset = scalarSource.indexOf('target');
    const value = 'line1\nline2\ntarget';
    const expectedPos = value.indexOf('target');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, targetOffset, value.length)).toBe(
      expectedPos
    );
  });

  it('maps correctly with 4-space indent', () => {
    const scalarSource = '|-\n    line1\n    line2\n    target\n';
    const targetOffset = scalarSource.indexOf('target');
    const value = 'line1\nline2\ntarget';
    const expectedPos = value.indexOf('target');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, targetOffset, value.length)).toBe(
      expectedPos
    );
  });

  it('maps {{ x }} correctly after 10 lines of content', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i} content`);
    const value = [...lines, '{{ x }}{% assign x = 1 %}'].join('\n');
    const indented = [...lines, '{{ x }}{% assign x = 1 %}'].map((l) => `  ${l}`).join('\n');
    const scalarSource = `|-\n${indented}\n`;
    const varOffset = scalarSource.indexOf('{{ x }}');
    const expectedPos = value.indexOf('{{ x }}');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, varOffset, value.length)).toBe(
      expectedPos
    );
  });

  it('maps {{ x }} correctly after 20 lines of content', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i} padding text`);
    const value = [...lines, '{{ x }}{% assign x = 1 %}'].join('\n');
    const indented = [...lines, '{{ x }}{% assign x = 1 %}'].map((l) => `  ${l}`).join('\n');
    const scalarSource = `|-\n${indented}\n`;
    const varOffset = scalarSource.indexOf('{{ x }}');
    const expectedPos = value.indexOf('{{ x }}');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, varOffset, value.length)).toBe(
      expectedPos
    );
  });

  it('clamps result to valueLength', () => {
    const scalarSource = '|-\n  content\n';
    expect(mapBlockScalarSourceToValueOffset(scalarSource, scalarSource.length, 3)).toBe(3);
  });

  it('handles blank lines between content', () => {
    const scalarSource = '|-\n  line1\n\n  line2\n';
    const line2Offset = scalarSource.indexOf('line2');
    const value = 'line1\n\nline2';
    const expectedPos = value.indexOf('line2');
    expect(mapBlockScalarSourceToValueOffset(scalarSource, line2Offset, value.length)).toBe(
      expectedPos
    );
  });

  it('maps block folded scalars with newline-to-space folding', () => {
    const scalarSource = '>-\n  line1\n  line2\n';
    const value = 'line1 line2';
    const line2Offset = scalarSource.indexOf('line2');
    const expectedPos = value.indexOf('line2');
    expect(
      mapBlockScalarSourceToValueOffset(scalarSource, line2Offset, value.length, { folded: true })
    ).toBe(expectedPos);
  });

  it('returns 0 for folded scalar offset within header line', () => {
    const scalarSource = '>-\n  line1\n';
    expect(mapBlockScalarSourceToValueOffset(scalarSource, 1, 6, { folded: true })).toBe(0);
  });

  it('handles all-blank-line content gracefully', () => {
    const scalarSource = '|-\n\n\n\n';
    expect(mapBlockScalarSourceToValueOffset(scalarSource, 5, 3)).toBe(2);
  });
});
