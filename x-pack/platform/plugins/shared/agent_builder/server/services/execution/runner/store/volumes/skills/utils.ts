/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FileEntry } from '@kbn/agent-builder-server/runner/filestore';
import { FileEntryType } from '@kbn/agent-builder-server/runner/filestore';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import { MOUNT_POINTS } from '../../../../filesystem/mount_points';
import type { SkillFileEntry, SkillReferencedContentFileEntry } from './types';

/**
 * Strip the conventional `skills/` prefix that `basePath` carries today so
 * the store works in paths relative to the `/skills` mount. Also collapses
 * any `.` (current-dir) segments and empty segments along the way, so callers
 * can pass `referencedContent.relativePath` shapes like `'.'` or `'./queries'`
 * without polluting the stored path. Returns a single leading slash regardless
 * of input form.
 */
const toStoreRelativePath = (segments: string[]): string => {
  const parts = segments.flatMap((s) => s.split('/')).filter((s) => s.length > 0 && s !== '.');
  const stripped = parts[0] === 'skills' ? parts.slice(1) : parts;
  return `/${stripped.join('/')}`;
};

/**
 * Get the store-relative entry path for a skill. The returned path is
 * relative to the `/skills` mount: e.g. `/platform/foo/SKILL.md`. The
 * agent-visible path is `MOUNT_POINTS.skills + this`; compose at the boundary.
 */
export const getSkillEntryPath = ({
  skill,
}: {
  skill: Pick<InternalSkillDefinition, 'basePath' | 'name'>;
}): string => {
  return toStoreRelativePath([skill.basePath, skill.name, 'SKILL.md']);
};

export const getSkillReferencedContentEntryPath = ({
  skill,
  referencedContent,
}: {
  skill: Pick<InternalSkillDefinition, 'basePath' | 'name'>;
  referencedContent: { relativePath: string; name: string };
}): string => {
  return toStoreRelativePath([
    skill.basePath,
    skill.name,
    referencedContent.relativePath,
    `${referencedContent.name}.md`,
  ]);
};

/**
 * Get the agent-visible (absolute, mount-prefixed) path for a skill — i.e.
 * what the LLM sees and what it should pass back to tools like `read_file`.
 * Composes `MOUNT_POINTS.skills` over the store-relative {@link getSkillEntryPath}.
 */
export const getSkillAbsolutePath = ({
  skill,
}: {
  skill: Pick<InternalSkillDefinition, 'basePath' | 'name'>;
}): string => {
  return `${MOUNT_POINTS.skills}${getSkillEntryPath({ skill })}`;
};

/**
 * Agent-visible (absolute, mount-prefixed) path for a skill's referenced
 * content file. Mirrors {@link getSkillAbsolutePath}.
 */
export const getSkillReferencedContentAbsolutePath = ({
  skill,
  referencedContent,
}: {
  skill: Pick<InternalSkillDefinition, 'basePath' | 'name'>;
  referencedContent: { relativePath: string; name: string };
}): string => {
  return `${MOUNT_POINTS.skills}${getSkillReferencedContentEntryPath({
    skill,
    referencedContent,
  })}`;
};

export const getSkillPlainText = ({
  skill,
}: {
  skill: Pick<InternalSkillDefinition, 'name' | 'description' | 'content'>;
}): string => {
  return `---
name: ${skill.name}
description: ${skill.description}
---

${skill.content}`;
};

/**
 * Creates VFS file entries for a skill that has a basePath.
 */
export const createSkillEntries = (
  skill: InternalSkillDefinition
): (SkillFileEntry | SkillReferencedContentFileEntry)[] => {
  const stringifiedContent = getSkillPlainText({ skill });

  return [
    {
      type: 'file',
      path: getSkillEntryPath({
        skill,
      }),
      content: {
        raw: {
          body: stringifiedContent,
        },
        plain_text: stringifiedContent,
      },
      metadata: {
        // generic meta
        type: FileEntryType.skill,
        id: skill.id,
        token_count: estimateTokens(stringifiedContent),
        readonly: true,
        // specific tool-result meta
        skill_name: skill.name,
        skill_description: skill.description,
        skill_id: skill.id,
      },
    } satisfies SkillFileEntry,
    ...(skill.referencedContent?.map((referencedContent) => {
      return {
        type: 'file' as const,
        path: getSkillReferencedContentEntryPath({
          skill,
          referencedContent,
        }),
        content: {
          raw: {
            body: referencedContent.content,
          },
          plain_text: referencedContent.content,
        },
        metadata: {
          // generic meta
          type: FileEntryType.skillReferenceContent,
          id: skill.id,
          token_count: estimateTokens(referencedContent.content),
          readonly: true,
          // specific tool-result meta
          skill_id: skill.id,
        },
      } satisfies SkillReferencedContentFileEntry;
    }) ?? []),
  ];
};

export const isSkillFileEntry = (entry: FileEntry): entry is SkillFileEntry => {
  return entry.metadata.type === FileEntryType.skill;
};
