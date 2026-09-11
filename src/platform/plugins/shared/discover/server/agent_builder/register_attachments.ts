/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import { platformCoreTools } from '@kbn/agent-builder-common';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { ESQL_QUERY_RESULTS_ATTACHMENT_TYPE } from '../../common/agent_builder';
import { createDiscoverSessionAttachmentType } from './create_discover_session_attachment';

const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
});

const timeRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const playbookContributionSchema = z.object({
  shapeId: z.string(),
  shapeLabel: z.string(),
  characteristicFields: z.array(z.string()),
  guidance: z.string().max(600),
  interestingSignals: z.array(z.string()).max(5).optional(),
});

const esqlQueryResultsDataSchema = z.object({
  query: z.string(),
  columns: z.array(columnSchema),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
  totalHits: z.number(),
  timeRange: timeRangeSchema.optional(),
  playbookContribution: playbookContributionSchema.optional(),
});

type EsqlQueryResultsData = z.infer<typeof esqlQueryResultsDataSchema>;

const isEsqlQueryResultsData = (data: unknown): data is EsqlQueryResultsData => {
  return esqlQueryResultsDataSchema.safeParse(data).success;
};

const createEsqlQueryResultsAttachmentType = (): AttachmentTypeDefinition => {
  return {
    id: ESQL_QUERY_RESULTS_ATTACHMENT_TYPE,
    validate: (input) => {
      const parseResult = esqlQueryResultsDataSchema.safeParse(input);
      if (parseResult.success) {
        return { valid: true, data: parseResult.data };
      }
      return { valid: false, error: parseResult.error.message };
    },
    format: (attachment: Attachment<string, unknown>) => {
      const data = attachment.data;
      if (!isEsqlQueryResultsData(data)) {
        throw new Error(
          `Invalid ES|QL query results attachment data for attachment ${attachment.id}`
        );
      }
      return {
        getRepresentation: () => {
          return { type: 'text' as const, value: formatQueryResultsData(data) };
        },
      };
    },
    getTools: () => [
      platformCoreTools.generateEsql,
      platformCoreTools.executeEsql,
      platformCoreTools.createVisualization,
    ],
    getAgentDescription: () => {
      return `This attachment contains ES|QL query results from Kibana Discover: the query text, column metadata, a small sample of rows for schema understanding, the total result count, and the time range. Use the sample rows only to understand the data schema — run executeEsql for actual analysis.`;
    },
  };
};

const formatQueryResultsData = (data: EsqlQueryResultsData): string => {
  const lines: string[] = [];

  lines.push(`ES|QL Query: ${data.query}`);
  lines.push(`Total Results: ${data.totalHits}`);
  if (data.timeRange) {
    lines.push(`Time Range: ${data.timeRange.from} to ${data.timeRange.to}`);
  }
  lines.push('');

  lines.push('Columns:');
  for (const col of data.columns) {
    lines.push(`  - ${col.name} (${col.type})`);
  }
  lines.push('');

  lines.push(`Sample Rows (${data.sampleRows.length} of ${data.totalHits}):`);
  for (const row of data.sampleRows) {
    const entries = Object.entries(row)
      .map(([key, val]) => {
        const strVal = typeof val === 'string' ? val : JSON.stringify(val);
        const truncated = strVal && strVal.length > 100 ? strVal.substring(0, 100) + '...' : strVal;
        return `${key}: ${truncated}`;
      })
      .join(', ');
    lines.push(`  { ${entries} }`);
  }

  if (data.playbookContribution) {
    const columnNames = new Set(data.columns.map((col) => col.name));
    const fields = data.playbookContribution.characteristicFields.filter((f) => columnNames.has(f));

    lines.push('');
    lines.push('Shape Profile:');
    lines.push(
      `  Shape: ${data.playbookContribution.shapeLabel} (${data.playbookContribution.shapeId})`
    );
    if (fields.length > 0) {
      lines.push(`  Characteristic fields present: ${fields.join(', ')}`);
    }
    lines.push(`  Guidance: ${data.playbookContribution.guidance}`);
    if (data.playbookContribution.interestingSignals?.length) {
      lines.push('  Interesting signals:');
      for (const signal of data.playbookContribution.interestingSignals) {
        lines.push(`    - ${signal}`);
      }
    }
  }

  return lines.join('\n');
};

export const registerAttachments = (agentBuilder: AgentBuilderPluginSetup) => {
  agentBuilder.attachments.registerType(createEsqlQueryResultsAttachmentType());
  agentBuilder.attachments.registerType(createDiscoverSessionAttachmentType());
};
