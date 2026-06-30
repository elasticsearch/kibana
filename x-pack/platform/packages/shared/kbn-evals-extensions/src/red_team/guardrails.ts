/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GuardrailRule, GuardrailViolation } from './types';

export const DEFAULT_GUARDRAIL_RULES: GuardrailRule[] = [
  {
    name: 'system-prompt-leak',
    pattern: /system prompt|your instructions|you are an AI/i,
    action: 'block',
    severity: 'critical',
    owaspCategory: 'LLM01',
    description: 'Detects system prompt leakage in model output',
  },
  {
    name: 'tool-schema-leak',
    pattern: /function_call|tool_use|<tool>|api_key/i,
    action: 'block',
    severity: 'high',
    owaspCategory: 'LLM07',
    description: 'Detects tool schema or API key leakage in model output',
  },
  {
    name: 'injection-echo',
    pattern: /ignore previous|disregard above|new instructions/i,
    action: 'warn',
    severity: 'medium',
    owaspCategory: 'LLM01',
    description: 'Detects echoed injection prompts in model output',
  },
  {
    name: 'pii-patterns',
    pattern: /\b\d{3}-\d{2}-\d{4}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    action: 'warn',
    severity: 'high',
    description: 'Detects PII patterns (SSN, email) in model output',
  },
];

/**
 * Scans output text against guardrail rules. When `inputPrompt` is provided,
 * it is stripped from the output before scanning to avoid false positives
 * caused by the model echoing the adversarial prompt in its response.
 */
export const scanWithGuardrails = (
  output: unknown,
  rules: GuardrailRule[],
  inputPrompt?: string
): GuardrailViolation[] => {
  let text = typeof output === 'string' ? output : JSON.stringify(output) ?? '';

  // Strip the original input prompt to avoid false positives from echo. Use
  // split/join to remove EVERY occurrence — a model that quotes the adversarial
  // prompt more than once (e.g. echoes it, then refuses) would otherwise leave a
  // surviving copy that trips injection-echo / system-prompt-leak rules.
  if (inputPrompt) {
    text = text.split(inputPrompt).join('');
  }

  const violations: GuardrailViolation[] = [];

  for (const rule of rules) {
    // Reset lastIndex for safety with global regexes
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match) {
      violations.push({
        rule: rule.name,
        action: rule.action,
        severity: rule.severity,
        matchedPattern: rule.pattern.source,
        location: text.substring(
          Math.max(0, match.index - 20),
          Math.min(text.length, match.index + match[0].length + 20)
        ),
      });
    }
  }

  return violations;
};

export const mergeGuardrailRules = (
  defaults: GuardrailRule[],
  overrides?: GuardrailRule[]
): GuardrailRule[] => {
  if (!overrides || overrides.length === 0) {
    return defaults;
  }

  const overrideNames = new Set(overrides.map((r) => r.name));
  const merged = defaults.filter((r) => !overrideNames.has(r.name));
  return [...merged, ...overrides];
};
