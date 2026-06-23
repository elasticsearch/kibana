/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import {
  AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH,
  agentIdRegexp,
  agentIdMaxLength,
} from '@kbn/agent-builder-common/agents';
import {
  isInProtectedNamespace,
  hasNamespaceName,
} from '@kbn/agent-builder-common/base/namespaces';
import { z } from '@kbn/zod/v4';
import { isValidAgentAvatarColor } from '../../../utils/color';

const isEmoji = (str: string): boolean =>
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(str);

const getGraphemes = (str: string): string[] => {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(str)].map((s) => s.segment);
  }
  return str.split('');
};

/**
 * Validates an avatar symbol value.
 * Allows: 1 emoji, 1 letter, or 2 letters.
 * Disallows: 2+ emojis, emoji + letter combinations, 3+ characters.
 */
export const isValidAvatarSymbol = (value: string): boolean => {
  const graphemes = getGraphemes(value);
  if (graphemes.length === 0) return true;
  if (graphemes.length === 1) return true;
  if (graphemes.length === 2) return !isEmoji(graphemes[0]) && !isEmoji(graphemes[1]);
  return false;
};

/**
 * Truncates an avatar symbol value to valid length.
 * If first character is emoji, keeps only that emoji.
 * Otherwise, keeps up to 2 characters.
 */
export const truncateAvatarSymbol = (value: string): string => {
  const graphemes = getGraphemes(value);
  if (graphemes.length <= 1) return value;
  if (isEmoji(graphemes[0])) return graphemes[0];
  return graphemes.slice(0, 2).join('');
};

export const agentFormSchema = z.object({
  id: z
    .string()
    .min(1, {
      message: i18n.translate('xpack.agentBuilder.agents.form.idRequired', {
        defaultMessage: 'Agent ID is required.',
      }),
    })
    .max(agentIdMaxLength, {
      message: i18n.translate('xpack.agentBuilder.agents.form.id.tooLongError', {
        defaultMessage: 'Agent ID must be 63 characters or less.',
      }),
    })
    .regex(agentIdRegexp, {
      message: i18n.translate('xpack.agentBuilder.agents.form.idInvalid', {
        defaultMessage:
          'Agent ID must start and end with a letter or number, and can only contain lowercase letters, numbers, hyphens, and underscores.',
      }),
    })
    .check((ctx) => {
      const name = ctx.value as string;
      if (isInProtectedNamespace(name) || hasNamespaceName(name)) {
        ctx.issues.push({
          code: 'custom',
          message: i18n.translate('xpack.agentBuilder.agents.form.id.protectedNamespaceError', {
            defaultMessage: 'Agent ID "{name}" uses a protected namespace.',
            values: { name },
          }),
          input: name,
        });
      }
    }),
  name: z.string().min(1, {
    message: i18n.translate('xpack.agentBuilder.agents.form.nameRequired', {
      defaultMessage: 'Agent name is required.',
    }),
  }),
  description: z.string().min(1, {
    message: i18n.translate('xpack.agentBuilder.agents.form.descriptionRequired', {
      defaultMessage: 'Agent description is required.',
    }),
  }),
  access_control: z.object({
    access_mode: z.enum(['private', 'public', 'shared']),
    entries: z.array(
      z.object({
        type: z.literal('user'),
        name: z.string().min(1).max(AGENT_ACCESS_CONTROL_PRINCIPAL_NAME_MAX_LENGTH),
        role: z.enum(['user', 'editor', 'manager']),
      })
    ),
  }),
  labels: z.array(z.string()).optional(),
  avatar_color: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value) return true;
        return isValidAgentAvatarColor(value);
      },
      {
        message: i18n.translate('xpack.agentBuilder.agents.form.avatarColorInvalidError', {
          defaultMessage:
            'Please enter a valid hex color code. This can either be a three or six character hex value.',
        }),
      }
    ),
  avatar_symbol: z
    .string()
    .optional()
    .refine((value) => !value || isValidAvatarSymbol(value), {
      message: i18n.translate('xpack.agentBuilder.agents.form.avatarSymbolMaxLengthError', {
        defaultMessage: 'Avatar symbol must be a single emoji or up to 2 letters.',
      }),
    }),
  configuration: z.object({
    instructions: z.string().optional(),
    tools: z.array(
      z.object({
        tool_ids: z.array(z.string()),
      })
    ),
    skill_ids: z.array(z.string()).optional(),
    enable_elastic_capabilities: z.boolean().optional(),
    workflow_ids: z.array(z.string()).optional(),
    plugin_ids: z.array(z.string()).optional(),
  }),
});
