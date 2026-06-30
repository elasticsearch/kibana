/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SkillDefinition, InternalSkillDefinition } from '@kbn/agent-builder-server/skills';

export const convertBuiltinSkill = (skill: SkillDefinition): InternalSkillDefinition => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  content: skill.content,
  readonly: true,
  experimental: skill.experimental ?? false,
  uiSettingRequired: skill.uiSettingRequired,
  referencedContent: skill.referencedContent,
  referencedContentCount: skill.referencedContent?.length ?? 0,
  basePath: skill.basePath,
  getRegistryTools: () => skill.getRegistryTools?.() ?? [],
  getInlineTools: skill.getInlineTools,
});
