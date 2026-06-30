/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Mustache from 'mustache';
import type { Discovery } from '@kbn/significant-events-schema';
import judgeUserPrompt from './user_prompt.text';

export interface JudgeInputParams {
  /** The unreviewed discoveries (and clearances) to assess. */
  discoveries: Array<Partial<Discovery>>;
}

/** Build the judge agent's user message. */
export function buildJudgeInput({ discoveries }: JudgeInputParams): string {
  return Mustache.render(judgeUserPrompt, { discoveries: JSON.stringify(discoveries) }).trim();
}
