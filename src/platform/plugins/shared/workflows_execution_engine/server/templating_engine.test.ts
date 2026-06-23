/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { WorkflowTemplatingEngine } from './templating_engine';

describe('WorkflowTemplatingEngine', () => {
  let templatingEngine: WorkflowTemplatingEngine;
  const liquidLimitErrorMessage =
    'Liquid template rendering exceeded a workflow limit. Reduce the template size, simplify loops or filters, reduce the rendered output size, or override the limit in workflow settings and try again.';

  beforeEach(() => {
    templatingEngine = new WorkflowTemplatingEngine();
  });

  describe('object rendering', () => {
    it('should render object with string templates', () => {
      const obj = {
        message: 'Hello, {{user.name}}!',
        details: {
          age: '{{user.age}}',
          address: '{{user.address.street}}, {{user.address.city}}',
        },
        tags: ['{{user.tag1}}', '{{user.tag2}}'],
      };

      const context = {
        user: {
          name: 'Alice',
          age: 30,
          address: {
            street: '123 Main St',
            city: 'Wonderland',
          },
          tag1: 'admin',
          tag2: 'editor',
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        message: 'Hello, Alice!',
        details: {
          age: '30',
          address: '123 Main St, Wonderland',
        },
        tags: ['admin', 'editor'],
      });
    });

    it('should handle non-string values without modification', () => {
      const obj = {
        number: 42,
        boolean: true,
        nullValue: null,
        undefinedValue: undefined,
        array: [1, 2, 3],
        nested: {
          value: 3.14,
        },
      };

      const context = {};

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual(obj);
    });
  });

  describe('basic rendering', () => {
    it('should render simple variables', () => {
      const template = 'Hello {{ name }}!';
      const context = { name: 'World' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('Hello World!');
    });

    it('should render multiple variables', () => {
      const template = '{{ greeting }} {{ name }}, you are {{ age }} years old.';
      const context = { greeting: 'Hello', name: 'John', age: 30 };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('Hello John, you are 30 years old.');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello {{ name }}, your status is {{ status }}.';
      const context = { name: 'John' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('Hello John, your status is .');
    });
  });

  describe('extractGlobalVariableSegments', () => {
    it('should collect nested references inside Liquid control-flow tags', () => {
      const extractedSegments = templatingEngine.extractGlobalVariableSegments(
        '{% if inputs.enabled %}{{ steps.fetchData.output.case.title }}{% endif %}'
      );

      expect(extractedSegments).toEqual(
        expect.arrayContaining([
          ['inputs', 'enabled'],
          ['steps', 'fetchData', 'output', 'case', 'title'],
        ])
      );
    });

    it('should return null for dynamic bracket paths', () => {
      const extractedSegments = templatingEngine.extractGlobalVariableSegments(
        '{{ steps.load_comment_sync_state.output._source[steps.note_sync_space_comment.output].id }}'
      );

      expect(extractedSegments).toBeNull();
    });
  });

  describe('built-in filters', () => {
    it('should use built-in json filter for stringification', () => {
      const template = '{{ data | json }}';
      const context = { data: { name: 'John', age: 30 } };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should handle json filter with arrays', () => {
      const template = '{{ items | json }}';
      const context = { items: ['apple', 'banana', 'cherry'] };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('["apple","banana","cherry"]');
    });

    it('should handle json filter with null and undefined', () => {
      const template = '{{ data | json }}';
      const context = { data: { name: 'John', value: null, missing: undefined } };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('{"name":"John","value":null}');
    });
  });

  describe('custom json_parse filter', () => {
    it('should parse valid JSON string to object', () => {
      const template = '{{ jsonString | json_parse | json }}';
      const context = { jsonString: '{"name":"John","age":30}' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should return original value for non-string input', () => {
      const template = '{{ data | json_parse | json }}';
      const context = { data: { name: 'John' } };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('{"name":"John"}');
    });

    it('should return original value for invalid JSON', () => {
      const template = '{{ invalidJson | json_parse }}';
      const context = { invalidJson: 'invalid json string' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('invalid json string');
    });

    it('should handle empty string', () => {
      const template = '{{ emptyString | json_parse }}';
      const context = { emptyString: '' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('');
    });

    it('should handle null and undefined', () => {
      const template = '{{ nullValue | json_parse }}';
      const context = { nullValue: null };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('');
    });
  });

  describe('sha256 filter', () => {
    it('should return the SHA-256 hex digest (Shopify reference vector)', () => {
      const template = '{{ text | sha256 }}';
      const context = { text: 'Polyjuice' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('44ac1d7a2936e30a5de07082fd65d6fe9b1fb658a1a98bfe65bc5959beac5dd0');
    });

    it('should coerce null and undefined to empty string', () => {
      const template = '{{ value | sha256 }}';
      expect(templatingEngine.render(template, { value: null })).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
      expect(templatingEngine.render(template, { value: undefined })).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });
  });

  describe('hmac_sha256 filter', () => {
    it('should return the HMAC-SHA256 hex digest (Shopify reference vector)', () => {
      const template = '{{ text | hmac_sha256: key }}';
      const context = { text: 'Polyjuice', key: 'Polina' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('8e0d5d65cff1242a4af66c8f4a32854fd5fb80edcc8aabe9b302b29c7c71dc20');
    });

    it('should stringify numeric secret keys', () => {
      const template = '{{ text | hmac_sha256: key }}';
      const context = { text: 'test', key: 12345 };
      const result = templatingEngine.render(template, context);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('base64_encode filter', () => {
    it('should base64 encode a plain string', () => {
      const template = '{{ text | base64_encode }}';
      const context = { text: 'Hello World' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe(Buffer.from('Hello World').toString('base64'));
    });

    it('should base64 encode a Buffer without data corruption', () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);
      const template = '${{ data | base64_encode }}';
      const context = { data: binaryData };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toBe(binaryData.toString('base64'));
    });

    it('should produce valid base64 that round-trips back to original bytes', () => {
      const original = Buffer.from([0x00, 0x01, 0x80, 0xff, 0xfe, 0xfd]);
      const template = '${{ data | base64_encode }}';
      const context = { data: original };
      const result = templatingEngine.render({ out: template }, context);
      const decoded = Buffer.from(result.out as string, 'base64');
      expect(decoded).toEqual(original);
    });

    it('should handle empty Buffer', () => {
      const template = '${{ data | base64_encode }}';
      const context = { data: Buffer.alloc(0) };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      const template = '{{ missing | base64_encode }}';
      const result = templatingEngine.render(template, {});
      expect(result).toBe(Buffer.from('').toString('base64'));
    });
  });

  describe('custom entries filter', () => {
    it('should convert an object to an array of {key, value} pairs', () => {
      const template = '${{ data | entries }}';
      const context = { data: { a: 1, b: 2, c: 3 } };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toEqual([
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
        { key: 'c', value: 3 },
      ]);
    });

    it('should handle nested object values', () => {
      const template = '${{ data | entries }}';
      const context = {
        data: {
          'index-001': { settings: { lifecycle: { name: 'old-policy' } } },
          'index-002': { settings: { lifecycle: { name: 'new-policy' } } },
        },
      };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toEqual([
        { key: 'index-001', value: { settings: { lifecycle: { name: 'old-policy' } } } },
        { key: 'index-002', value: { settings: { lifecycle: { name: 'new-policy' } } } },
      ]);
    });

    it('should return arrays as-is', () => {
      const template = '${{ data | entries }}';
      const context = { data: [1, 2, 3] };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toEqual([1, 2, 3]);
    });

    it('should return null as-is', () => {
      const template = '{{ data | entries }}';
      const context = { data: null };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('');
    });

    it('should return non-object primitives as-is', () => {
      const template = '{{ data | entries }}';
      const context = { data: 'hello' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('hello');
    });

    it('should handle empty objects', () => {
      const template = '${{ data | entries }}';
      const context = { data: {} };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toEqual([]);
    });

    it('should work with evaluateExpression for foreach usage', () => {
      const template = '{{ data | entries }}';
      const context = { data: { x: 10, y: 20 } };
      const result = templatingEngine.evaluateExpression(template, context);
      expect(result).toEqual([
        { key: 'x', value: 10 },
        { key: 'y', value: 20 },
      ]);
    });

    it('should chain with other filters', () => {
      const template = '${{ data | entries | first }}';
      const context = { data: { a: 1, b: 2 } };
      const result = templatingEngine.render({ out: template }, context);
      expect(result.out).toEqual({ key: 'a', value: 1 });
    });
  });

  describe('filter chaining', () => {
    it('should chain json and json_parse filters', () => {
      const template = '{{ data | json | json_parse | json }}';
      const context = { data: { name: 'John', age: 30 } };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should chain with other built-in filters', () => {
      const template = '{{ name | upcase | json }}';
      const context = { name: 'john' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('"JOHN"');
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown filter', () => {
      const template = '{{ name | unknownFilter }}';
      const context = { name: 'John' };

      expect(() => {
        templatingEngine.render(template, context);
      }).toThrow();
    });

    it('should contain informative error message', () => {
      const template = '{{ name | unknownFilter }}';
      const context = { name: 'John' };

      try {
        templatingEngine.render(template, context);
        fail('Expected error to be thrown');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toContain('undefined filter: unknownFilter');
      }
    });

    it('should handle complex error scenarios', () => {
      const template = '{{ data | json | unknownFilter | json_parse }}';
      const context = { data: { name: 'John' } };

      expect(() => {
        templatingEngine.render(template, context);
      }).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty template', () => {
      const template = '';
      const context = {};
      const result = templatingEngine.render(template, context);
      expect(result).toBe('');
    });

    it('should handle template with no variables', () => {
      const template = 'Hello World!';
      const context = {};
      const result = templatingEngine.render(template, context);
      expect(result).toBe('Hello World!');
    });

    it('should handle template with only whitespace', () => {
      const template = '   ';
      const context = {};
      const result = templatingEngine.render(template, context);
      expect(result).toBe('   ');
    });

    it('should handle nested objects in context', () => {
      const template = '{{ user.name }} is {{ user.age }} years old';
      const context = { user: { name: 'John', age: 30 } };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('John is 30 years old');
    });

    it('should handle arrays in context', () => {
      const template = '{{ items | json }}';
      const context = { items: [1, 2, 3] };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('[1,2,3]');
    });
  });

  describe('json_parse filter error handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const template = '{{ malformedJson | json_parse }}';
      const context = { malformedJson: '{"name": "John", "age":}' };
      const result = templatingEngine.render(template, context);
      // Should return original value when JSON parsing fails
      expect(result).toBe('{"name": "John", "age":}');
    });

    it('should handle incomplete JSON', () => {
      const template = '{{ incompleteJson | json_parse }}';
      const context = { incompleteJson: '{"name": "John"' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('{"name": "John"');
    });

    it('should handle non-JSON strings', () => {
      const template = '{{ text | json_parse }}';
      const context = { text: 'This is not JSON' };
      const result = templatingEngine.render(template, context);
      expect(result).toBe('This is not JSON');
    });
  });

  describe('evaluateExpression', () => {
    describe('invalid expression', () => {
      it('should throw error for non-output template', () => {
        const template = `{% if true %}foo{% endif %}`;
        expect(() => templatingEngine.evaluateExpression(template, {})).toThrowError(
          'The provided expression is invalid. Got: {% if true %}foo{% endif %}'
        );
      });

      it('should throw error for multi-node template', () => {
        const template = `{{ "foo" }} {{ "bar" }}`;

        expect(() => templatingEngine.evaluateExpression(template, {})).toThrowError(
          'The provided expression is invalid. Got: {{ "foo" }} {{ "bar" }}'
        );
      });
    });

    describe('string manipulation', () => {
      it('should evaluate split filter over string', () => {
        const template = `{{ "foo,bar,dak" | split: "," }}`;
        const actual = templatingEngine.evaluateExpression(template, {});
        expect(actual).toEqual(['foo', 'bar', 'dak']);
      });

      it('should evaluate split filter over variable', () => {
        const template = `{{ my_string | split: "," }}`;
        const actual = templatingEngine.evaluateExpression(template, {
          my_string: 'foo,bar,dak',
        });
        expect(actual).toEqual(['foo', 'bar', 'dak']);
      });

      it('should evaluate split filter with variable separator', () => {
        const template = `{{ my_string | split: separator }}`;
        const actual = templatingEngine.evaluateExpression(template, {
          my_string: 'foo|bar|dak',
          separator: '|',
        });
        expect(actual).toEqual(['foo', 'bar', 'dak']);
      });
    });

    describe('array manipulation', () => {
      it('should evaluate join filter over array', () => {
        const template = `{{ my_array | join: "," }}`;
        const actual = templatingEngine.evaluateExpression(template, {
          my_array: ['foo', 'bar', 'dak'],
        });
        expect(actual).toEqual('foo,bar,dak');
      });

      it('should evaluate join filter with variable separator', () => {
        const template = `{{ my_array | join: separator }}`;
        const actual = templatingEngine.evaluateExpression(template, {
          my_array: ['foo', 'bar', 'dak'],
          separator: '|',
        });
        expect(actual).toEqual('foo|bar|dak');
      });
    });
  });

  describe('raw value evaluation with ${{ }} syntax', () => {
    it('should preserve array structure when using ${{ }} syntax', () => {
      const obj = {
        tags: '${{ inputs.tags }}',
      };
      const context = {
        inputs: {
          tags: ['tag1', 'tag2', 'tag3'],
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        tags: ['tag1', 'tag2', 'tag3'],
      });
      expect(Array.isArray(rendered.tags)).toBe(true);
    });

    it('should preserve object structure when using ${{ }} syntax', () => {
      const obj = {
        metadata: '${{ inputs.metadata }}',
      };
      const context = {
        inputs: {
          metadata: {
            version: '1.0.0',
            author: 'John Doe',
          },
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        metadata: {
          version: '1.0.0',
          author: 'John Doe',
        },
      });
      expect(typeof rendered.metadata).toBe('object');
      expect(Array.isArray(rendered.metadata)).toBe(false);
    });

    it('should preserve boolean values', () => {
      const obj = {
        isActive: '${{ inputs.isActive }}',
      };
      const context = {
        inputs: {
          isActive: true,
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        isActive: true,
      });
      expect(typeof rendered.isActive).toBe('boolean');
    });

    it('should support both ${{ }} and {{ }} syntax in the same object', () => {
      const obj = {
        message: 'Hello {{ user.name }}!',
        tags: '${{ inputs.tags }}',
        count: 'Total: {{ inputs.count }}',
      };
      const context = {
        user: {
          name: 'Alice',
        },
        inputs: {
          tags: ['admin', 'user'],
          count: 5,
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        message: 'Hello Alice!',
        tags: ['admin', 'user'],
        count: 'Total: 5',
      });
    });

    it('should support ${{ }} in nested objects', () => {
      const obj = {
        request: {
          body: {
            tags: '${{ inputs.tags }}',
            message: 'Processing {{ inputs.count }} items',
          },
        },
      };
      const context = {
        inputs: {
          tags: ['urgent', 'important'],
          count: 10,
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        request: {
          body: {
            tags: ['urgent', 'important'],
            message: 'Processing 10 items',
          },
        },
      });
    });

    it('should handle ${{ }} with filters', () => {
      const obj = {
        items: '${{ inputs.items | slice: 0, 2 }}',
      };
      const context = {
        inputs: {
          items: ['a', 'b', 'c', 'd'],
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        items: ['a', 'b'],
      });
      expect(Array.isArray(rendered.items)).toBe(true);
    });

    it('should convert ${{ str | split: "," }} to array', () => {
      const obj = {
        items: '${{ str | split: "," }}',
      };
      const context = {
        str: 'foo,bar,dak',
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        items: ['foo', 'bar', 'dak'],
      });
      expect(Array.isArray(rendered.items)).toBe(true);
    });

    it('should not treat regular {{ }} as ${{ }}', () => {
      const obj = {
        message: '{{ inputs.str | split: "," }}',
      };
      const context = {
        inputs: {
          str: 'foo,bar,dak',
        },
      };
      const rendered = templatingEngine.render(obj, context);
      expect(rendered).toEqual({
        message: 'foobardak',
      });
      expect(typeof rendered.message).toBe('string');
    });

    it('should preserve empty arrays', () => {
      const obj = {
        items: '${{ inputs.items }}',
      };
      const context = {
        inputs: {
          items: [],
        },
      };

      const rendered = templatingEngine.render(obj, context);

      expect(rendered).toEqual({
        items: [],
      });
      expect(Array.isArray(rendered.items)).toBe(true);
    });
  });

  describe('template engine restrictions', () => {
    describe('in-memory filesystem', () => {
      it('should reject file existence for any path', () => {
        const fs = (templatingEngine as any).engine.options.fs;
        expect(fs.existsSync('/any/path')).toBe(false);
        expect(fs.existsSync('relative/path')).toBe(false);
        expect(fs.existsSync('')).toBe(false);
      });

      it('should throw on readFileSync for any path', () => {
        const fs = (templatingEngine as any).engine.options.fs;
        expect(() => fs.readFileSync('/any/path')).toThrow();
      });

      it('should not have a fallback function', () => {
        const fs = (templatingEngine as any).engine.options.fs;
        expect(fs.fallback).toBeUndefined();
      });
    });

    describe('unsupported tags', () => {
      it('should reject {% block %} tag', () => {
        expect(() => {
          templatingEngine.render('{% block foo %}content{% endblock %}', {});
        }).toThrow('not found');
      });

      it('should reject {% tablerow %} tag', () => {
        expect(() => {
          templatingEngine.render('{% tablerow item in items %}{{ item }}{% endtablerow %}', {
            items: [1, 2],
          });
        }).toThrow('not found');
      });

      it('should allow {% assign %} tag', () => {
        const result = templatingEngine.render('{% assign greeting = "hello" %}{{ greeting }}', {});
        expect(result).toBe('hello');
      });

      it('should allow {% capture %} tag', () => {
        const result = templatingEngine.render(
          '{% capture msg %}hello {{ name }}{% endcapture %}{{ msg }}',
          { name: 'world' }
        );
        expect(result).toBe('hello world');
      });

      it('should allow {% case %} tag', () => {
        const result = templatingEngine.render(
          '{% case val %}{% when "a" %}alpha{% when "b" %}beta{% endcase %}',
          { val: 'b' }
        );
        expect(result).toBe('beta');
      });
    });

    describe('unsupported tag patterns', () => {
      it('should reject {% include %} tags', () => {
        expect(() => {
          templatingEngine.render("{% include 'some_file' %}", {});
        }).toThrow('unsupported tags');
      });

      it('should reject {% render %} tags', () => {
        expect(() => {
          templatingEngine.render("{% render 'some_partial' %}", {});
        }).toThrow('unsupported tags');
      });

      it('should reject {% layout %} tags', () => {
        expect(() => {
          templatingEngine.render("{% layout 'base' %}", {});
        }).toThrow('unsupported tags');
      });

      it('should reject include tags with whitespace variations', () => {
        expect(() => {
          templatingEngine.render("{%   include 'some_file' %}", {});
        }).toThrow('unsupported tags');
      });

      it('should reject include tags with Liquid whitespace trim syntax', () => {
        expect(() => {
          templatingEngine.render("{%- include 'some_file' -%}", {});
        }).toThrow('unsupported tags');
      });

      it('should reject include tags embedded in larger templates', () => {
        expect(() => {
          templatingEngine.render("Hello {{ name }}, {% include 'some_file' %} done", {
            name: 'test',
          });
        }).toThrow('unsupported tags');
      });

      it('should reject include tags in nested objects', () => {
        expect(() => {
          templatingEngine.render(
            {
              safe: '{{ name }}',
              unsupported: "{% include 'some_file' %}",
            },
            { name: 'test' }
          );
        }).toThrow('unsupported tags');
      });

      it('should reject include tags in arrays', () => {
        expect(() => {
          templatingEngine.render(['{{ name }}', "{% include 'some_file' %}"], {
            name: 'test',
          });
        }).toThrow('unsupported tags');
      });
    });

    describe('ownPropertyOnly restrictions', () => {
      it('should not expose constructor property', () => {
        const result = templatingEngine.render('{{ obj.constructor }}', {
          obj: { name: 'test' },
        });
        expect(result).toBe('');
      });

      it('should not expose __proto__ property', () => {
        const result = templatingEngine.render('{{ obj.__proto__ }}', {
          obj: { name: 'test' },
        });
        expect(result).toBe('');
      });

      it('should not expose toString from prototype', () => {
        const result = templatingEngine.render('{{ obj.toString }}', {
          obj: { name: 'test' },
        });
        expect(result).toBe('');
      });

      it('should still expose own properties', () => {
        const result = templatingEngine.render('{{ obj.name }}', {
          obj: { name: 'test' },
        });
        expect(result).toBe('test');
      });
    });

    describe('engine limits', () => {
      it('should reject templates exceeding parse limit', () => {
        expect(() => {
          templatingEngine.render('x'.repeat(200_000), {});
        }).toThrow(liquidLimitErrorMessage);
      });

      it('should reject templates that allocate too much memory', () => {
        expect(() => {
          templatingEngine.render('{% for i in (1..20000000) %}{{ i }}{% endfor %}', {});
        }).toThrow(liquidLimitErrorMessage);
      });

      it('should reject templates exceeding render limit', () => {
        const engine = new WorkflowTemplatingEngine({
          liquidSettings: {
            renderLimit: 1,
          },
        });

        expect(() => {
          engine.render('{% for i in (1..1000000) %}{% assign value = i %}{% endfor %}', {});
        }).toThrow(liquidLimitErrorMessage);
      });

      it('should use workflow liquid settings when provided', () => {
        const template = 'x'.repeat(160_000);
        const engine = new WorkflowTemplatingEngine({
          liquidSettings: {
            parseLimit: 200_000,
          },
        });

        expect(engine.render(template, {})).toBe(template);
      });
    });

    describe('safe templates still work', () => {
      it('should allow normal variable interpolation', () => {
        const result = templatingEngine.render('Hello {{ name }}!', { name: 'World' });
        expect(result).toBe('Hello World!');
      });

      it('should allow if/else control flow', () => {
        const result = templatingEngine.render('{% if show %}visible{% else %}hidden{% endif %}', {
          show: true,
        });
        expect(result).toBe('visible');
      });

      it('should allow for loops', () => {
        const result = templatingEngine.render('{% for item in items %}{{ item }} {% endfor %}', {
          items: ['a', 'b', 'c'],
        });
        expect(result).toBe('a b c ');
      });

      it('should allow filters', () => {
        const result = templatingEngine.render('{{ name | upcase }}', { name: 'hello' });
        expect(result).toBe('HELLO');
      });
    });
  });
});
