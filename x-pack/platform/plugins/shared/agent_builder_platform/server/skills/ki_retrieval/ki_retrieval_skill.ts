/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import { contextEngineSkillAvailability } from '../context_engine_skill_availability';
import content from './ki_retrieval.skill.md.text';

export const kiRetrievalSkill = defineSkillType({
  id: 'ki-retrieval',
  name: 'ki-retrieval',
  basePath: 'skills/platform/context-engine',
  experimental: true,
  availability: contextEngineSkillAvailability,
  description:
    'Retrieve context from a Context Engine AI Index at query time using keyword, semantic, or hybrid (FORK+FUSE) ES|QL search through the AI-index tools.',
  content,
  referencedContent: [],
  getRegistryTools: () => Object.values(contextEngineAiIndexTools),
});
