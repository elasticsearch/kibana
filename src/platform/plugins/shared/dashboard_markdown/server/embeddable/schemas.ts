/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { serializedTitlesSchema } from '@kbn/presentation-publishing-schemas';
import { BY_REF_SCHEMA_META, BY_VALUE_SCHEMA_META } from '@kbn/presentation-publishing-schemas';

export const markdownByValueStateSchema = serializedTitlesSchema.extends(
  {
    content: schema.string({
      meta: {
        description:
          'The Markdown text rendered by the panel. Supports GitHub-flavored Markdown, including headings, paragraphs, lists, links, images, tables, blockquotes, and code blocks. Use `\\n` for line breaks within JSON strings.',
      },
    }),
    settings: schema.object(
      {
        open_links_in_new_tab: schema.boolean({
          defaultValue: true,
          meta: { description: 'Open links in a new browser tab.' },
        }),
      },
      {
        meta: { description: 'Display settings for the markdown panel.' },
      }
    ),
  },
  {
    meta: BY_VALUE_SCHEMA_META,
  }
);

const markdownByReferenceStateSchema = serializedTitlesSchema.extends(
  {
    ref_id: schema.string({
      meta: { description: 'The unique identifier of the markdown library item.' },
    }),
  },
  {
    meta: BY_REF_SCHEMA_META,
  }
);

export const markdownEmbeddableSchema = schema.oneOf(
  [markdownByValueStateSchema, markdownByReferenceStateSchema],
  {
    meta: {
      description: 'Markdown panel config',
    },
  }
);

export type MarkdownByValueState = TypeOf<typeof markdownByValueStateSchema>;
export type MarkdownByReferenceState = TypeOf<typeof markdownByReferenceStateSchema>;
export type MarkdownEmbeddableState = TypeOf<typeof markdownEmbeddableSchema>;

export type MarkdownSettingsState = MarkdownByValueState['settings'];
