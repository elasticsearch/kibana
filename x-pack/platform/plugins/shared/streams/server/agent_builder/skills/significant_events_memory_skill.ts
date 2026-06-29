/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { MemoryToolsOptions } from '../tools/memory';
import { createMemoryTools } from '../tools/memory';
import description from './significant_events_memory.description.text';
import content from './significant_events_memory.skill.md.text';

export const createSigEventsMemorySkill = (options: MemoryToolsOptions) =>
  defineSkillType({
    id: 'significant-events-memory',
    name: 'significant-events-memory',
    basePath: 'skills/platform/streams',
    description,
    content,
    getInlineTools: () =>
      createMemoryTools(options).map(({ tags, id, ...rest }) => ({
        ...rest,
        id: id.replaceAll('.', '_'),
      })),
  });
