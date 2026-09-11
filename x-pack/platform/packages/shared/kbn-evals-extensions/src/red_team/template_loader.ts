/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import Path from 'path';
import yaml from 'yaml';
import type { Example } from '@kbn/evals';
import type { AttackModuleConfig } from './types';

interface TemplateEntry {
  input: string;
  intent: string;
  expectedBehavior: 'refuse' | 'comply-safely' | 'not-applicable';
}

interface TemplateFile {
  module: string;
  version: number;
  prompts: Record<string, TemplateEntry[]>;
}

export const loadTemplates = (moduleName: string, config: AttackModuleConfig): Example[] => {
  const templatePath = Path.resolve(__dirname, 'templates', `${moduleName}.yaml`);
  const raw = readFileSync(templatePath, 'utf-8');
  const template = yaml.parse(raw) as TemplateFile;

  const prompts = template.prompts?.[config.difficulty];
  if (!prompts || prompts.length === 0) {
    return [];
  }

  const examples: Example[] = [];
  for (let i = 0; i < config.count; i++) {
    const entry = prompts[i % prompts.length];
    examples.push({
      input: { prompt: entry.input },
      output: { intent: entry.intent, expectedBehavior: entry.expectedBehavior },
      metadata: { module: moduleName, difficulty: config.difficulty },
    });
  }

  return examples;
};
