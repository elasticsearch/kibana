/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH,
  AgentAccessControlRole,
  AgentAccessControlMode,
} from '@kbn/agent-builder-common';
import {
  isValidAvatarSymbol,
  truncateAvatarSymbol,
  agentFormSchema,
} from './agent_form_validation';

describe('isValidAvatarSymbol', () => {
  it('accepts empty string', () => {
    expect(isValidAvatarSymbol('')).toBe(true);
  });

  it('accepts a single letter', () => {
    expect(isValidAvatarSymbol('A')).toBe(true);
  });

  it('accepts two letters', () => {
    expect(isValidAvatarSymbol('AB')).toBe(true);
  });

  it('rejects three letters', () => {
    expect(isValidAvatarSymbol('ABC')).toBe(false);
  });

  it('accepts a single emoji', () => {
    expect(isValidAvatarSymbol('🎉')).toBe(true);
  });

  it('accepts a single flag emoji', () => {
    expect(isValidAvatarSymbol('🇫🇷')).toBe(true);
  });

  it('rejects two emojis', () => {
    expect(isValidAvatarSymbol('🇫🇷🇩🇪')).toBe(false);
  });

  it('rejects emoji + letter', () => {
    expect(isValidAvatarSymbol('🇫🇷x')).toBe(false);
  });

  it('rejects letter + emoji', () => {
    expect(isValidAvatarSymbol('x🇫🇷')).toBe(false);
  });

  it('accepts a ZWJ sequence (single grapheme cluster)', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(isValidAvatarSymbol(family)).toBe(true);
  });
});

describe('truncateAvatarSymbol', () => {
  it('keeps a single letter', () => {
    expect(truncateAvatarSymbol('A')).toBe('A');
  });

  it('keeps two letters', () => {
    expect(truncateAvatarSymbol('AB')).toBe('AB');
  });

  it('truncates three letters to two', () => {
    expect(truncateAvatarSymbol('ABC')).toBe('AB');
  });

  it('keeps a single emoji', () => {
    expect(truncateAvatarSymbol('🎉')).toBe('🎉');
  });

  it('truncates two emojis to one', () => {
    expect(truncateAvatarSymbol('🇫🇷🇩🇪')).toBe('🇫🇷');
  });

  it('truncates emoji + letter to just the emoji', () => {
    expect(truncateAvatarSymbol('🇫🇷x')).toBe('🇫🇷');
  });

  it('keeps empty string', () => {
    expect(truncateAvatarSymbol('')).toBe('');
  });
});

describe('agentFormSchema avatar_symbol', () => {
  const baseData = {
    id: 'my-agent',
    name: 'My Agent',
    description: 'A test agent',
    access_control: { access_mode: 'private' as const, entries: [] },
    configuration: { tools: [] },
  };

  const parse = (avatar_symbol: string | undefined) =>
    agentFormSchema.safeParse({ ...baseData, avatar_symbol });

  it('accepts undefined (field is optional)', () => {
    expect(parse(undefined).success).toBe(true);
  });

  it('accepts a single ASCII character', () => {
    expect(parse('A').success).toBe(true);
  });

  it('accepts two ASCII characters', () => {
    expect(parse('AB').success).toBe(true);
  });

  it('rejects three ASCII characters', () => {
    expect(parse('ABC').success).toBe(false);
  });

  it('accepts a single basic emoji', () => {
    expect(parse('🎉').success).toBe(true);
  });

  it('accepts a single flag emoji', () => {
    expect(parse('🇫🇷').success).toBe(true);
  });

  it('rejects two emojis', () => {
    expect(parse('🇫🇷🇩🇪').success).toBe(false);
  });

  it('rejects emoji + letter combination', () => {
    expect(parse('🇫🇷x').success).toBe(false);
  });

  it('accepts a ZWJ sequence (single grapheme cluster)', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(parse(family).success).toBe(true);
  });
});

describe('agentFormSchema access_control entries', () => {
  const baseData = {
    id: 'my-agent',
    name: 'My Agent',
    description: 'A test agent',
    access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
    configuration: { tools: [] },
  };

  it('rejects principal names longer than the access-control maximum', () => {
    const result = agentFormSchema.safeParse({
      ...baseData,
      access_control: {
        access_mode: AgentAccessControlMode.Private,
        entries: [
          {
            type: 'user',
            name: 'a'.repeat(AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH + 1),
            role: AgentAccessControlRole.User,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
