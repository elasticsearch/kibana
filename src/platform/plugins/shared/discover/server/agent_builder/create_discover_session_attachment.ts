/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { platformCoreTools } from '@kbn/agent-builder-common';
import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_DATA_VIEW_SPEC_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../common/agent_builder';
import {
  discoverSessionApiDataSchema,
  type DiscoverSessionApiData,
  type DiscoverSessionApiTab,
} from '../api/schema';

const MAX_FORMATTED_COLUMNS = 20;

const isDiscoverSessionApiData = (data: unknown): data is DiscoverSessionApiData => {
  return discoverSessionApiDataSchema.safeParse(data).success;
};

export const createDiscoverSessionAttachmentType = (): AttachmentTypeDefinition => {
  return {
    id: DISCOVER_SESSION_ATTACHMENT_TYPE,
    validate: (input) => {
      const parseResult = discoverSessionApiDataSchema.safeParse(input);
      if (parseResult.success) {
        return { valid: true, data: parseResult.data };
      }
      return { valid: false, error: parseResult.error.message };
    },
    format: (attachment) => {
      const { data } = attachment;
      if (!isDiscoverSessionApiData(data)) {
        throw new Error(`Invalid Discover session attachment data for attachment ${attachment.id}`);
      }
      return {
        getRepresentation: () => ({
          type: 'text' as const,
          value: formatDiscoverSessionData(attachment.id, data),
        }),
      };
    },
    getTools: () => [],
    getAgentDescription: () => {
      return `This attachment is a Kibana Discover session: title, query, time range, and table columns. It does not include result rows. To refine this table, call ${platformCoreTools.createDiscoverSession} with this attachment's id. Do not create a second Discover session unless the user asked for another table. Render it with <render_attachment>. Do not dump tab JSON, vis_context, or sample documents into the conversation.`;
    },
  };
};

const formatDiscoverSessionData = (attachmentId: string, data: DiscoverSessionApiData): string => {
  const lines: string[] = [`Discover session "${data.title}" (attachment id: "${attachmentId}")`];

  if (data.description) {
    lines.push(`Description: ${data.description}`);
  }

  lines.push(`Tabs: ${data.tabs.length}`);

  for (const tab of data.tabs) {
    lines.push(...formatTab(tab));
  }

  return lines.join('\n');
};

const formatTab = (tab: DiscoverSessionApiTab): string[] => {
  const lines = [`Tab "${tab.label}" (${tab.id})`, `  ${formatDataSource(tab)}`];

  if ('query' in tab && tab.query) {
    lines.push(`  Query (${tab.query.language}): ${tab.query.expression}`);
  }

  if (tab.time_range) {
    lines.push(`  Time range: ${tab.time_range.from} to ${tab.time_range.to}`);
  }

  lines.push(`  ${formatColumns(tab.column_order)}`);
  lines.push(`  Chart hidden: ${tab.hide_chart}`);

  return lines;
};

const formatDataSource = (tab: DiscoverSessionApiTab): string => {
  const { data_source: dataSource } = tab;

  switch (dataSource.type) {
    case AS_CODE_ESQL_DATA_SOURCE_TYPE:
      return `ES|QL: ${dataSource.query}`;
    case AS_CODE_DATA_VIEW_REFERENCE_TYPE:
      return `Data view: ${dataSource.ref_id}`;
    case AS_CODE_DATA_VIEW_SPEC_TYPE:
      return `Index pattern: ${dataSource.index_pattern}`;
    default: {
      const exhaustive: never = dataSource;
      return exhaustive;
    }
  }
};

const formatColumns = (columnOrder: string[] | undefined): string => {
  if (!columnOrder || columnOrder.length === 0) {
    return 'Columns: (default columns)';
  }

  if (columnOrder.length > MAX_FORMATTED_COLUMNS) {
    const shown = columnOrder.slice(0, MAX_FORMATTED_COLUMNS).join(', ');
    return `Columns: ${shown} (and ${columnOrder.length - MAX_FORMATTED_COLUMNS} more)`;
  }

  return `Columns: ${columnOrder.join(', ')}`;
};
