/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import { collectAllConnectorIds } from './collect_all_connector_ids';

describe('collectAllConnectorIds', () => {
  it('should return empty array for default steps', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: default_step
    type: console
    with:
      message: "Hello, world!"
  `;
    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const result = collectAllConnectorIds(yamlDocument, lineCounter);
    expect(result).toHaveLength(0);
  });

  it('should collect all connector ids from steps', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: default_step
    type: slack
    connector-id: slacky
    with:
      message: "Hello, world!"
  `;
    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const result = collectAllConnectorIds(yamlDocument, lineCounter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/slacky-\d+-\d+-\d+-\d+/);
    expect(result[0].key).toBe('slacky');
    expect(result[0].connectorType).toBe('slack');
  });

  it('should collect all connector ids from steps with multiple nested steps', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: default_step
    type: slack
    connector-id: slacky
  - name: loop
    type: foreach
    foreach: steps.default_step.output
    steps:
      - name: default_step
        type: slack
        connector-id: slacky2
        with:
          message: "Hello from loop"
  `;
    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const result = collectAllConnectorIds(yamlDocument, lineCounter);
    expect(result).toHaveLength(2);
    expect(result[0].id).toMatch(/slacky-\d+-\d+-\d+-\d+/);
    expect(result[0].key).toBe('slacky');
    expect(result[0].connectorType).toBe('slack');
    expect(result[1].id).toMatch(/slacky2-\d+-\d+-\d+-\d+/);
    expect(result[1].key).toBe('slacky2');
    expect(result[1].connectorType).toBe('slack');
  });

  it('should collect connector ids with different connector types', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: slack_step
    type: slack
    connector-id: slack-connector
    with:
      message: "Hello from Slack"
  - name: ai_step
    type: inference.unified_completion
    connector-id: openai
    with:
      input: "What is Elastic?"
  `;
    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const result = collectAllConnectorIds(yamlDocument, lineCounter);
    expect(result).toHaveLength(2);
    expect(result[0].id).toMatch(/slack-connector-\d+-\d+-\d+-\d+/);
    expect(result[0].key).toBe('slack-connector');
    expect(result[0].connectorType).toBe('slack');
    expect(result[1].id).toMatch(/openai-\d+-\d+-\d+-\d+/);
    expect(result[1].key).toBe('openai');
    expect(result[1].connectorType).toBe('inference.unified_completion');
  });

  it('should resolve connector type for waitForApproval notification channel connector-id', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: request-approval
    type: waitForApproval
    with:
      channels:
        slack:
          connector-id: my-slack
        slack_api:
          connector-id: my-slack-api
          channels: ["C0123"]
`;
    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const result = collectAllConnectorIds(yamlDocument, lineCounter);

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('my-slack');
    expect(result[0].connectorType).toBe('slack');
    expect(result[1].key).toBe('my-slack-api');
    expect(result[1].connectorType).toBe('slack_api');
  });
});
