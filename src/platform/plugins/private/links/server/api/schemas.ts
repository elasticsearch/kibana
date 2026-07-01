/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MAX_ID_LENGTH, MAX_TITLE_LENGTH } from '@kbn/as-code-shared-schemas';
import { getAsCodeTagsSchema } from '@kbn/as-code-shared-schemas/src/schemas';
import { schema } from '@kbn/config-schema';
import { dashboardNavigationOptionsSchema } from '@kbn/dashboard-navigation-options-schema';
import {
  BY_REF_SCHEMA_META,
  BY_VALUE_SCHEMA_META,
  serializedTitlesSchema,
} from '@kbn/presentation-publishing-schemas';
import {
  DASHBOARD_LINK_TYPE,
  DEFAULT_EXTERNAL_LINK_OPTIONS,
  EXTERNAL_LINK_TYPE,
  LINKS_HORIZONTAL_LAYOUT,
  LINKS_VERTICAL_LAYOUT,
} from '../../common/constants';

const baseLinkSchema = {
  label: schema.maybe(
    schema.string({
      maxLength: MAX_TITLE_LENGTH,
      meta: { description: 'The label of the link displayed in the UI.' },
    })
  ),
};

export const dashboardLinkSchema = schema.object(
  {
    ...baseLinkSchema,
    type: schema.literal(DASHBOARD_LINK_TYPE),
    destination: schema.string({
      maxLength: MAX_ID_LENGTH,
      meta: { description: 'Linked dashboard saved object ID.' },
    }),
    options: dashboardNavigationOptionsSchema,
  },
  {
    meta: {
      description: 'Link type. Set to dashboardLink for a link to another dashboard.',
      id: `kbn-link-panel-type-${DASHBOARD_LINK_TYPE}`,
    },
  }
);

export const externalLinkOptionsSchema = schema.object(
  {
    open_in_new_tab: schema.boolean({
      meta: {
        description: 'Whether to open this link in a new tab when clicked.',
      },
      defaultValue: DEFAULT_EXTERNAL_LINK_OPTIONS.open_in_new_tab,
    }),
    encode_url: schema.boolean({
      meta: {
        description: 'Whether to escape the URL with percent encoding',
      },
      defaultValue: DEFAULT_EXTERNAL_LINK_OPTIONS.encode_url,
    }),
  },
  {
    defaultValue: DEFAULT_EXTERNAL_LINK_OPTIONS,
    unknowns: 'forbid',
  }
);

export const externalLinkSchema = schema.object(
  {
    ...baseLinkSchema,
    type: schema.literal(EXTERNAL_LINK_TYPE),
    destination: schema.string({
      maxLength: 250,
      meta: { description: 'The external URL to link to.' },
    }),
    options: externalLinkOptionsSchema,
  },
  {
    meta: {
      id: `kbn-link-type-${EXTERNAL_LINK_TYPE}`,
      description: 'Link type. Set to externalLink for a URL outside Kibana.',
    },
  }
);

export const linksArraySchema = schema.arrayOf(
  schema.discriminatedUnion('type', [dashboardLinkSchema, externalLinkSchema]),
  {
    meta: { description: 'The list of links to display.' },
    maxSize: 100,
  }
);

// Shared schema for layout - used by both saved objects and embeddables
export const layoutSchema = schema.maybe(
  schema.oneOf([schema.literal(LINKS_HORIZONTAL_LAYOUT), schema.literal(LINKS_VERTICAL_LAYOUT)], {
    meta: {
      description: 'Whether to display the links in a horizontal or vertical layout.',
    },
  })
);

export const linksByValueSchema = serializedTitlesSchema.extends(
  {
    links: linksArraySchema,
    layout: layoutSchema,
  },
  { meta: BY_VALUE_SCHEMA_META }
);

export const linksByReferenceSchema = serializedTitlesSchema.extends(
  {
    // make title required for the library item
    title: schema.string({
      meta: {
        description: 'The library item title.',
      },
    }),
    ref_id: schema.string({
      maxLength: MAX_ID_LENGTH + 50, // accounts for prefix
      meta: {
        title: 'Reference ID',
        description: 'The unique identifier of the links library item.',
      },
    }),
  },
  { meta: BY_REF_SCHEMA_META }
);

// Complete links embeddable schema (union of by-value and by-reference embeddables)
export const linksEmbeddableSchema = schema.oneOf([linksByValueSchema, linksByReferenceSchema], {
  meta: {
    description: 'Links embeddable schema',
  },
});

export const linksApiStateSchema = linksByValueSchema.extends({
  title: schema.string(), // make title required - all links library items must have a title
  tags: getAsCodeTagsSchema(),
});
