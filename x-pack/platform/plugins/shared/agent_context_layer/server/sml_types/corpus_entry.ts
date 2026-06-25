/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import type { SmlTypeDefinition } from '../services/sml/types';

export const CORPUS_ENTRY_SML_TYPE = 'corpus_entry';

/**
 * Neutral SML type for ad-hoc / eval corpus documents written directly via the
 * `contextEngine.addEntry` workflow step (content-mode, `ingestion_method:
 * 'manual'`).
 *
 * It is intentionally registered by the Agent Context Layer host plugin rather
 * than a solution plugin: corpus entries do not belong to any product surface,
 * so this gives workflow authors a non-solution-specific namespace to sink
 * documents into for end-to-end tests and ad-hoc use cases.
 *
 * There is no crawler integration: `list` yields nothing and `getSmlData`
 * returns `undefined`, so the crawler never produces entries for this type
 * (writes only ever arrive through the workflow step's content-mode path, which
 * skips `getSmlData`). Unlike solution-owned types (dashboard, significant
 * event) whose `toAttachment` re-fetches the live source object, a corpus entry
 * has no external origin to resolve — its content is self-contained in the
 * stored SML document. So `toAttachment` builds the attachment directly from
 * the indexed `title` / `content` / `description`.
 */
export const corpusEntrySmlType: SmlTypeDefinition = {
  id: CORPUS_ENTRY_SML_TYPE,

  async *list() {},

  getSmlData: async () => undefined,

  /**
   * Surface the stored document as a built-in `text` attachment so Agent
   * Builder can attach it to a conversation.
   *
   * We return `data` inline (rather than a by-reference `origin`) on purpose:
   * the attachment state manager only re-resolves content from `origin` when
   * `data` is absent, and a corpus entry has no live source to resolve against
   * — the indexed document is the source of truth. Title and description are
   * folded into the content so the agent sees the full KI, not just the body.
   */
  toAttachment: async (item) => {
    const sections = [
      item.title ? `# ${item.title}` : undefined,
      item.description,
      item.content,
    ].filter((section): section is string => Boolean(section && section.trim()));

    if (sections.length === 0) {
      return undefined;
    }

    return {
      id: item.id,
      type: AttachmentType.text,
      data: { content: sections.join('\n\n') },
      ...(item.description ? { description: item.description } : {}),
      readonly: true,
    };
  },
};
