/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getModelDefinition } from './known_models';

describe('getModelDefinition', () => {
  it('returns the expected models for common openAI full model names', () => {
    expect(getModelDefinition('gpt-4o')!.id).toBe('gpt-4o');
    expect(getModelDefinition('gpt-4o-mini')!.id).toBe('gpt-4o-mini');
    expect(getModelDefinition('gpt-4.1')!.id).toBe('gpt-4.1');
  });

  it('returns the expected models for common Claude full model names', () => {
    expect(getModelDefinition('anthropic.claude-3-opus-20240229-v1:0')!.id).toBe('claude-3-opus');
    expect(getModelDefinition('anthropic.claude-3-5-sonnet-20241022-v2:0')!.id).toBe(
      'claude-3.5-sonnet'
    );
    expect(getModelDefinition('us.anthropic.claude-3-7-sonnet-20250219-v1:0')!.id).toBe(
      'claude-3.7-sonnet'
    );
  });

  it('returns the expected models for Claude 4+ Bedrock model ids (role-then-version)', () => {
    // Real AWS Bedrock model ids for Claude 4 and later use `<role>-<version>`
    // (e.g. `claude-opus-4-…`, `claude-sonnet-4-5-…`, `claude-haiku-4-5-…`).
    expect(getModelDefinition('anthropic.claude-opus-4-20250514-v1:0')!.id).toBe('claude-opus-4');
    expect(getModelDefinition('anthropic.claude-sonnet-4-20250514-v1:0')!.id).toBe(
      'claude-sonnet-4'
    );
    expect(getModelDefinition('us.anthropic.claude-sonnet-4-5-20250929-v1:0')!.id).toBe(
      'claude-sonnet-4.5'
    );
    expect(getModelDefinition('us.anthropic.claude-haiku-4-5-20251001-v1:0')!.id).toBe(
      'claude-haiku-4.5'
    );
    expect(getModelDefinition('us.anthropic.claude-opus-4-6-v1')!.id).toBe('claude-opus-4.6');
    expect(getModelDefinition('us.anthropic.claude-opus-4-7')!.id).toBe('claude-opus-4.7');
  });

  it('resolves Claude 4+ ids to their most specific match (not the base version)', () => {
    // Regression guard: substring lookup must not let `claude-opus-4` swallow
    // `claude-opus-4-7`, and `claude-sonnet-4` must not swallow `claude-sonnet-4-5`.
    expect(getModelDefinition('us.anthropic.claude-opus-4-7')!.id).not.toBe('claude-opus-4');
    expect(getModelDefinition('us.anthropic.claude-opus-4-6-v1')!.id).not.toBe('claude-opus-4');
    expect(getModelDefinition('us.anthropic.claude-sonnet-4-5-20250929-v1:0')!.id).not.toBe(
      'claude-sonnet-4'
    );
  });

  it('returns the expected models for common google full model names', () => {
    expect(getModelDefinition('gemini-1.5-pro-preview-0409')!.id).toBe('gemini-1.5-pro');
    expect(getModelDefinition('gemini-2.0-flash-001')!.id).toBe('gemini-2.0-flash');
    expect(getModelDefinition('gemini-2.5-pro-001')!.id).toBe('gemini-2.5-pro');
  });
});
