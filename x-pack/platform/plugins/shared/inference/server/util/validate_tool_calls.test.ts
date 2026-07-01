/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolChoiceType, isToolValidationError } from '@kbn/inference-common';
import { validateToolCalls } from './validate_tool_calls';

describe('validateToolCalls', () => {
  it('throws an error if tools were called but toolChoice == none', () => {
    expect(() => {
      validateToolCalls({
        toolCalls: [
          {
            function: {
              name: 'my_function',
              arguments: '{}',
            },
            toolCallId: '1',
          },
        ],

        toolChoice: ToolChoiceType.none,
        tools: {
          my_function: {
            description: 'description',
          },
        },
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"tool_choice was \\"none\\" but my_function was/were called"`
    );
  });

  it('throws an error if an unknown tool was called', () => {
    expect(() =>
      validateToolCalls({
        toolCalls: [
          {
            function: {
              name: 'my_unknown_function',
              arguments: '{}',
            },
            toolCallId: '1',
          },
        ],

        tools: {
          my_function: {
            description: 'description',
          },
        },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"Tool \\"my_unknown_function\\" called but was not available"`
    );
  });

  it('throws an error if invalid JSON was generated', () => {
    expect(() =>
      validateToolCalls({
        toolCalls: [
          {
            function: {
              name: 'my_function',
              arguments: '{[]}',
            },
            toolCallId: '1',
          },
        ],

        tools: {
          my_function: {
            description: 'description',
          },
        },
      })
    ).toThrowErrorMatchingInlineSnapshot(`"Failed parsing arguments for my_function"`);
  });

  it('throws an error if the function call has invalid arguments', () => {
    function validate() {
      validateToolCalls({
        toolCalls: [
          {
            function: {
              name: 'my_function',
              arguments: JSON.stringify({ foo: 'bar' }),
            },
            toolCallId: '1',
          },
        ],

        tools: {
          my_function: {
            description: 'description',
            schema: {
              type: 'object',
              properties: {
                bar: {
                  type: 'string',
                },
              },
              required: ['bar'],
            },
          },
        },
      });
    }
    expect(() => validate()).toThrowErrorMatchingInlineSnapshot(
      `"Tool call arguments for my_function (1) were invalid"`
    );

    try {
      validate();
    } catch (error) {
      if (isToolValidationError(error)) {
        expect(error.meta).toEqual({
          arguments: JSON.stringify({ foo: 'bar' }),
          errorsText: 'bar: Invalid input: expected string, received undefined',
          name: 'my_function',
          toolCalls: [
            {
              function: {
                arguments: JSON.stringify({ foo: 'bar' }),
                name: 'my_function',
              },
              toolCallId: '1',
            },
          ],
        });
      } else {
        fail('Expected toolValidationError');
      }
    }
  });

  it('backfills an empty tool name from a forced single-tool toolChoice', () => {
    const validated = validateToolCalls({
      toolCalls: [
        {
          function: {
            // EIS can stream a single-shot tool call with an empty name.
            name: '',
            arguments: '{ "foo": "bar" }',
          },
          toolCallId: '1',
        },
      ],

      toolChoice: { function: 'analyze' },
      tools: {
        analyze: {
          description: 'description',
          schema: {
            type: 'object',
            properties: {
              foo: {
                type: 'string',
              },
            },
            required: ['foo'],
          },
        },
      },
    });

    expect(validated).toEqual([
      {
        function: {
          name: 'analyze',
          arguments: {
            foo: 'bar',
          },
        },
        toolCallId: '1',
      },
    ]);
  });

  it('successfully validates and parses a valid tool call', () => {
    function runValidation() {
      return validateToolCalls({
        toolCalls: [
          {
            function: {
              name: 'my_function',
              arguments: '{ "foo": "bar" }',
            },
            toolCallId: '1',
          },
        ],

        tools: {
          my_function: {
            description: 'description',
            schema: {
              type: 'object',
              properties: {
                foo: {
                  type: 'string',
                },
              },
              required: ['foo'],
            },
          },
        },
      });
    }
    expect(() => runValidation()).not.toThrowError();

    const validated = runValidation();

    expect(validated).toEqual([
      {
        function: {
          name: 'my_function',
          arguments: {
            foo: 'bar',
          },
        },
        toolCallId: '1',
      },
    ]);
  });
});
