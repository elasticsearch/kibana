/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { monaco } from '@kbn/code-editor';
import type { ConnectorTypeInfo } from '@kbn/workflows';
import { getFakeAutocompleteContextParams } from '../context/build_autocomplete_context.test';
import { getCompletionItemProvider } from '../get_completion_item_provider';

async function getSuggestions(
  yamlContent: string,
  connectorTypes?: Record<string, ConnectorTypeInfo>
): Promise<monaco.languages.CompletionItem[]> {
  const fakeAutocompleteContextParams = getFakeAutocompleteContextParams(
    yamlContent,
    connectorTypes
  );
  const completionProvider = getCompletionItemProvider(
    () => fakeAutocompleteContextParams.editorState
  );

  const result = await completionProvider.provideCompletionItems(
    fakeAutocompleteContextParams.model,
    fakeAutocompleteContextParams.position,
    fakeAutocompleteContextParams.completionContext,
    {
      isCancellationRequested: false,
      onCancellationRequested: () => ({
        dispose: () => {},
      }),
    }
  );

  return result?.suggestions ?? [];
}

describe('getCompletionItemProvider - Variable expressions', () => {
  it('should provide basic completions inside variable expression', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "{{|<-}}"
`.trim();
    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual(
      expect.arrayContaining(['consts', 'event', 'now', 'workflow', 'steps', 'execution', 'inputs'])
    );
  });

  it('should provide completions after @ and quote insertText automatically if cursor is in plain scalar', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: @|<-
`.trim();
    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label).sort()).toEqual(
      [
        'consts',
        'context',
        'event',
        'kibanaUrl',
        'metadata',
        'now',
        'output',
        'workflow',
        'parent',
        'steps',
        'execution',
        'inputs',
        'variables',
      ].sort()
    );
    expect(suggestions.map((s) => s.insertText).sort()).toEqual(
      [
        '"{{ event$0 }}"',
        '"{{ execution$0 }}"',
        '"{{ kibanaUrl$0 }}"',
        '"{{ metadata$0 }}"',
        '"{{ output$0 }}"',
        '"{{ workflow$0 }}"',
        '"{{ inputs$0 }}"',
        '"{{ consts$0 }}"',
        '"{{ context$0 }}"',
        '"{{ now$0 }}"',
        '"{{ parent$0 }}"',
        '"{{ steps$0 }}"',
        '"{{ variables$0 }}"',
      ].sort()
    );
  });

  it('should provide completions after @ and not quote insertText automatically if cursor is in plain scalar but not starting with { or @', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: hey, this is @|<-
`.trim();
    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.insertText).sort()).toEqual(
      [
        '{{ event$0 }}',
        '{{ execution$0 }}',
        '{{ kibanaUrl$0 }}',
        '{{ metadata$0 }}',
        '{{ output$0 }}',
        '{{ workflow$0 }}',
        '{{ inputs$0 }}',
        '{{ consts$0 }}',
        '{{ context$0 }}',
        '{{ now$0 }}',
        '{{ parent$0 }}',
        '{{ steps$0 }}',
        '{{ variables$0 }}',
      ].sort()
    );
  });

  it('should provide basic completions with @ and not quote insertText automatically if cursor is in string', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "@|<-"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual(
      expect.arrayContaining(['consts', 'event', 'now', 'workflow', 'steps', 'execution', 'inputs'])
    );
    expect(suggestions.map((s) => s.insertText)).toEqual(
      expect.arrayContaining([expect.not.stringMatching(/^"[^"]*$/)])
    );
  });

  it('should not quote insertText automatically if cursor is in curly braces already', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  people:
    - Alice
    - Bob
    - Charlie
steps:
  - name: step1
    type: console
    with:
      message: hey {{consts.|<-}}
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.insertText)).toEqual(['people']);
  });

  it('should provide const completion with type', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
  threshold: 100
  templates:
    - name: template1
      template:
        subject: 'Suspicious activity detected'
        body: 'Go look at the activity'
steps:
  - name: step1
    type: console
    with:
      message: "{{consts.|<-}}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.length).toEqual(3);
    expect(suggestions[0].label).toEqual('apiUrl');
    expect(suggestions[0].detail).toEqual('"https://api.example.com"');
    expect(suggestions[1].label).toEqual('threshold');
    expect(suggestions[1].detail).toEqual('100');
    expect(suggestions[2].label).toEqual('templates');
    expect(suggestions[2].detail).toEqual(
      '{ name: "template1"; template: { subject: "Suspicious activity detected"; body: "Go look at the activity" } }[]'
    );
  });

  it('should provide const completion with type in array', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
  threshold: 100
  templates:
    - name: template1
      template:
        subject: 'Suspicious activity detected'
        body: 'Go look at the activity'
steps:
  - name: step1
    type: console
    with:
      message: "{{consts.templates[0].|<-}}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.length).toEqual(2);
    expect(suggestions[0].label).toEqual('name');
    expect(suggestions[0].detail).toEqual('"template1"');
    expect(suggestions[1].label).toEqual('template');
    expect(suggestions[1].detail).toEqual(
      '{ subject: "Suspicious activity detected"; body: "Go look at the activity" }'
    );
  });

  it('should provide previous step completion', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step0
    type: console
    with:
      message: "hello"
  - name: step1
    type: console
    with:
      message: "{{steps.|<-}}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual(expect.arrayContaining(['step0']));
    expect(suggestions.map((s) => s.insertText)).toEqual(expect.arrayContaining(['step0']));
  });

  it('should not provide unreachable step', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: if-step
    type: if
    with:
      condition: "{{steps.step0.output.message == 'hello'}}"
    steps:
      - name: first-true-step
        type: console
        with:
          message: "im true"
      - name: second-true-step
        type: console
        with:
          message: "im true, {{steps.|<-}}"
    else:
      - name: false-step
        type: console
        with:
          message: "im unreachable"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual(
      expect.arrayContaining(['if-step', 'first-true-step'])
    );
  });

  it('should autocomplete incomplete key', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step0
    type: console
    with:
      message: "{{consts.a|<-}}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual(expect.arrayContaining(['apiUrl']));
  });

  it('should autocomplete incomplete key in complete mustache expression', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
  apiKey: "secret-key"
  timeout: 10
  retryCount: 10
steps:
  - name: step0
    type: console
    with:
      message: "{{ consts.a|<- }}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual(['apiUrl', 'apiKey']);
  });

  it('should not give suggestions when path does not exist in schema and path ends with dot', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
  apiKey: "secret-key"
  timeout: 10
  retryCount: 10
steps:
  - name: step0
    type: console
    with:
      message: "{{ consts.docs.|<- }}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual([]);
  });

  it('should not give suggestions when path does not exist in schema', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
  apiKey: "secret-key"
  timeout: 10
  retryCount: 10
steps:
  - name: step0
    type: console
    with:
      message: "{{ consts.docs.a|<- }}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual([]);
  });

  it('should not give completions for valid path with a trailing dot if schema of current path is any', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: httpStep
    type: http
    with:
      url: https://google.com
  - name: step1
    type: console
    with:
      message: "{{steps.httpStep.output.|<-}}"
`.trim();

    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.label)).toEqual([]);
  });

  it('should provide completions with brackets for keys in kebab-case and use single quotes when inside double quoted string', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  api-url: "https://api.example.com"
steps:
  - name: step0
    type: console
    with:
      message: "{{consts.|<-}}"
`.trim();
    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.insertText)).toEqual(expect.arrayContaining(["['api-url']"]));
  });

  it('should provide completions with brackets for keys in kebab-case and use double quotes when inside single quoted string', async () => {
    const yamlContent = `
version: "1"
name: "test"
consts:
  api-url: "https://api.example.com"
steps:
  - name: step0
    type: console
    with:
      message: '{{consts.|<-}}'
      `.trim();
    const suggestions = await getSuggestions(yamlContent);
    expect(suggestions.map((s) => s.insertText)).toEqual(expect.arrayContaining(['["api-url"]']));
  });

  describe('@ completion restriction to value nodes', () => {
    it('should provide @ completions when cursor is in value node (after colon)', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: @|<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining([
          'consts',
          'event',
          'now',
          'workflow',
          'steps',
          'execution',
          'inputs',
        ])
      );
      // Verify that suggestions include curly braces when not already inside braces
      const constsSuggestion = suggestions.find((s) => s.label === 'consts');
      expect(constsSuggestion?.insertText).toContain('{{');
      expect(constsSuggestion?.insertText).toContain('}}');
    });

    it('should provide @ completions in quoted string value', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "@|<-"
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining([
          'consts',
          'event',
          'now',
          'workflow',
          'steps',
          'execution',
          'inputs',
        ])
      );
    });
  });

  describe('@ completion inside existing curly braces', () => {
    it('should NOT add extra curly braces when already inside {{ }}', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "{{ consts.@|<-"
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const apiUrlSuggestion = suggestions.find((s) => s.label === 'apiUrl');
      // Should insert just "apiUrl" without adding {{ }}
      expect(apiUrlSuggestion).toBeDefined();
      expect(apiUrlSuggestion?.insertText).toBe('apiUrl');
      expect(apiUrlSuggestion?.insertText).not.toContain('{{');
      expect(apiUrlSuggestion?.insertText).not.toContain('}}');
    });

    it('should add curly braces when NOT inside existing braces', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: @|<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const constsSuggestion = suggestions.find((s) => s.label === 'consts');
      // Should insert with {{ }}
      expect(constsSuggestion).toBeDefined();
      expect(constsSuggestion?.insertText).toContain('{{');
      expect(constsSuggestion?.insertText).toContain('}}');
    });

    it('should handle nested braces correctly', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "{{ outer {{ consts.@|<-"
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const apiUrlSuggestion = suggestions.find((s) => s.label === 'apiUrl');
      // Should detect we're inside and not add extra braces
      expect(apiUrlSuggestion).toBeDefined();
      expect(apiUrlSuggestion?.insertText).not.toContain('{{');
      expect(apiUrlSuggestion?.insertText).not.toContain('}}');
    });

    it('should handle unclosed braces correctly', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "{{ consts.@|<-"
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const apiUrlSuggestion = suggestions.find((s) => s.label === 'apiUrl');
      // Should detect we're inside unclosed braces and not add extra braces
      expect(apiUrlSuggestion).toBeDefined();
      expect(apiUrlSuggestion?.insertText).not.toContain('{{');
      expect(apiUrlSuggestion?.insertText).not.toContain('}}');
    });

    it('should add braces when @ is used outside of braces in quoted string', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
steps:
  - name: step1
    type: console
    with:
      message: "some text @|<-"
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const constsSuggestion = suggestions.find((s) => s.label === 'consts');
      // Should add braces since we're not inside existing braces
      expect(constsSuggestion).toBeDefined();
      expect(constsSuggestion?.insertText).toContain('{{');
      expect(constsSuggestion?.insertText).toContain('}}');
    });

    it('should support multiple @ completions in the same expression', async () => {
      const yamlContent = `
version: "1"
name: "test"
consts:
  apiUrl: "https://api.example.com"
triggers:
  - type: manual
    inputs:
      - name: threshold
        type: number
steps:
  - name: step1
    type: console
    with:
      message: "{{ consts.@ + inputs.@|<-"
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      // Should show suggestions for inputs (the path before the second @)
      const thresholdSuggestion = suggestions.find((s) => s.label === 'threshold');
      expect(thresholdSuggestion).toBeDefined();
      expect(thresholdSuggestion?.insertText).toBe('threshold');
      expect(thresholdSuggestion?.insertText).not.toContain('{{');
      expect(thresholdSuggestion?.insertText).not.toContain('}}');

      // Should also show other inputs properties
      const inputsSuggestions = suggestions.filter(
        (s) => s.label === 'threshold' || s.label === 'inputs'
      );
      expect(inputsSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('workflow.output with: block autocomplete', () => {
    it('should not suggest output fields when cursor is on the same line as with: (aligned with other steps)', async () => {
      const yamlContent = `
version: "1"
name: "test"
outputs:
  - name: result
    type: string
triggers:
  - type: manual
steps:
  - name: emit
    type: workflow.output
    with:  |<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const labels = suggestions.map((s) => s.label);
      // No output key suggestions on the "with:" line (same as console/custom property behavior)
      expect(labels).not.toContain('result');
    });

    it('should not suggest output keys when cursor is in a value position (after key:)', async () => {
      const yamlContent = `
version: "1"
name: "test"
outputs:
  - name: result
    type: string
  - name: count
    type: number
triggers:
  - type: manual
steps:
  - name: emit
    type: workflow.output
    with:
      a: |<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const labels = suggestions.map((s) => s.label);
      expect(labels).not.toContain('result');
      expect(labels).not.toContain('count');
    });

    it('should suggest declared output fields inside workflow.output with: block', async () => {
      const yamlContent = `
version: "1"
name: "test"
outputs:
  - name: result
    type: string
  - name: count
    type: number
triggers:
  - type: manual
steps:
  - name: emit
    type: workflow.output
    with:
      |<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const labels = suggestions.map((s) => s.label);
      expect(labels).toContain('result');
      expect(labels).toContain('count');
    });

    it('should not suggest already provided output keys', async () => {
      const yamlContent = `
version: "1"
name: "test"
outputs:
  - name: result
    type: string
  - name: count
    type: number
triggers:
  - type: manual
steps:
  - name: emit
    type: workflow.output
    with:
      result: "hello"
      |<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const labels = suggestions.map((s) => s.label);
      expect(labels).not.toContain('result');
      expect(labels).toContain('count');
    });

    it('should not suggest output fields when none are declared', async () => {
      const yamlContent = `
version: "1"
name: "test"
outputs:
  - name: result
    type: string
triggers:
  - type: manual
steps:
  - name: emit
    type: workflow.output
    with:
      result: "done"
      |<-
`.trim();
      const suggestions = await getSuggestions(yamlContent);
      const labels = suggestions.map((s) => s.label);
      // When all outputs are already provided, no more output field suggestions
      expect(labels).not.toContain('result');
    });
  });
});
