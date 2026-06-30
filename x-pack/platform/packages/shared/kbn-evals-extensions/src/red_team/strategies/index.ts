/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Strategy, StrategyFactory } from '../types';
import { createDirectStrategy } from './direct';
import { createBase64Strategy } from './base64';
import { createLeetspeakStrategy } from './leetspeak';
import { createJailbreakWrapperStrategy } from './jailbreak_wrapper';
import { createCrescendoStrategy } from './crescendo';
import { createPersistenceStrategy } from './persistence';
import { createRot13Strategy } from './rot13';
import { createUnicodeConfusablesStrategy } from './unicode_confusables';

const STRATEGIES: Record<string, StrategyFactory> = {
  direct: createDirectStrategy,
  base64: createBase64Strategy,
  leetspeak: createLeetspeakStrategy,
  jailbreak_wrapper: createJailbreakWrapperStrategy,
  crescendo: createCrescendoStrategy,
  persistence: createPersistenceStrategy,
  rot13: createRot13Strategy,
  unicode_confusables: createUnicodeConfusablesStrategy,
};

export const getStrategy = (name: string, config?: Record<string, unknown>): Strategy => {
  const factory = Object.hasOwn(STRATEGIES, name) ? STRATEGIES[name] : undefined;
  if (!factory) {
    const available = Object.keys(STRATEGIES).join(', ');
    throw new Error(`Unknown strategy "${name}". Available: ${available}`);
  }
  return factory(config);
};

export const getAvailableStrategies = (): string[] => Object.keys(STRATEGIES);
