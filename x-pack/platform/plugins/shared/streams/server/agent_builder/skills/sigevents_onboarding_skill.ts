/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { MemoryToolsOptions } from '../tools/memory';
import { createMemoryTools } from '../tools/memory';
import { toInlineMemoryTools } from './memory/to_inline_tools';
import content from './sigevents_onboarding.skill.md.text';

export const createSigEventsOnboardingSkill = (options: MemoryToolsOptions) =>
  defineSkillType({
    id: 'significant-events-onboarding',
    name: 'significant-events-onboarding',
    basePath: 'skills/platform/streams',
    description:
      'Interview the user to build a mental model of their system for significant events analysis. Use when the user wants to describe their architecture, deployment infrastructure, observability setup, or any operational context that should be remembered for RCA and remediation.',
    content,
    getInlineTools: () => toInlineMemoryTools(createMemoryTools(options)),
  });
