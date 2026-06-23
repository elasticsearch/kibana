/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { PublicSkillDefinition, PublicSkillSummary } from '@kbn/agent-builder-common';
import { getSkillAbsolutePath } from '../execution/runner/store/volumes/skills/utils';

/**
 * Converts an InternalSkillDefinition to a PublicSkillDefinition
 * suitable for API responses. This is used at the route handler boundary.
 */
export const internalToPublicDefinition = async (
  skill: InternalSkillDefinition
): Promise<PublicSkillDefinition> => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  content: skill.content,
  referenced_content: skill.referencedContent?.map((rc) => ({
    name: rc.name,
    relativePath: rc.relativePath,
    content: rc.content,
  })),
  tool_ids: await skill.getRegistryTools(),
  readonly: skill.readonly,
  plugin_id: skill.plugin_id,
  experimental: skill.experimental,
});

/**
 * Converts an InternalSkillDefinition to a PublicSkillSummary for listing.
 * Strips heavy content fields; uses `referencedContentCount` for the count.
 */
export const internalToPublicSummary = async (
  skill: InternalSkillDefinition
): Promise<PublicSkillSummary> => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  tool_ids: await skill.getRegistryTools(),
  readonly: skill.readonly,
  plugin_id: skill.plugin_id,
  experimental: skill.experimental,
  referenced_content_count: skill.referencedContentCount,
});

const SKILL_FILE_SUFFIX = '/SKILL.md';

export type SkillResolution = { match: InternalSkillDefinition } | { error: string };

/**
 * Resolve a skill from an input string. Accepts:
 *  - a bare name (e.g. `my-skill`)
 *  - a folder path (e.g. `skills/platform/my-skill`)
 *  - a SKILL.md path (e.g. `skills/platform/my-skill/SKILL.md`)
 * Leading slashes are tolerated.
 *
 * Returns `{ match }` for a unique resolution, or `{ error }` with a
 * human-readable message describing why resolution failed.
 */
export const resolveSkill = (
  input: string,
  allSkills: InternalSkillDefinition[]
): SkillResolution => {
  let target = input.trim();
  if (target.endsWith(SKILL_FILE_SUFFIX)) {
    target = target.slice(0, -SKILL_FILE_SUFFIX.length);
  }
  // Tolerate a single leading slash so `/skills/...` works too.
  if (target.startsWith('/')) {
    target = target.slice(1);
  }

  const isPath = target.includes('/');

  if (isPath) {
    const lastSlash = target.lastIndexOf('/');
    const basePath = target.slice(0, lastSlash);
    const name = target.slice(lastSlash + 1);
    const match = allSkills.find((s) => s.name === name && s.basePath === basePath);
    if (!match) {
      return { error: `Skill not found at path '${input}'.` };
    }
    return { match };
  }

  const matches = allSkills.filter((s) => s.name === target);
  if (matches.length === 0) {
    return { error: `Skill '${input}' not found.` };
  }
  if (matches.length > 1) {
    const paths = matches.map((s) => getSkillAbsolutePath({ skill: s })).join(', ');
    return {
      error: `Skill name '${input}' is ambiguous. Multiple skills match: ${paths}. Re-call load_skill using the full path to disambiguate.`,
    };
  }
  return { match: matches[0] };
};
