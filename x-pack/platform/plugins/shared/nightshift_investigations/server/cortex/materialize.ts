/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import {
  CORTEX_ENTITY_TYPE_BUCKETS,
  CORTEX_ENTITY_TYPES,
  type CortexEntityType,
  type CortexPage,
  type CortexPageSummary,
} from '../../common/cortex';
import type { SandboxApiClient } from '../tools/sandbox_bash/grpc_client';
import type { CortexPageStore } from './page_store';

export const CORTEX_WORKSPACE_ROOT = '/workspace/cortex';

const README_CONTENT = `# Knowledge Cortex

A living wiki of durable, cross-linked knowledge. Read these pages before investigating.

Start here, then open \`INDEX.md\` and follow links with \`nightshift_sandbox_view_file\`.
Do not write Cortex pages yourself — a post-run optimizer updates the wiki from this investigation.

Pages live under \`{type}/{slug}.md\`. Status is established, tentative, or archived.
`;

const pagePath = (entityType: CortexEntityType, slug: string): string =>
  `${CORTEX_WORKSPACE_ROOT}/${CORTEX_ENTITY_TYPE_BUCKETS[entityType]}/${slug}.md`;

const renderIndex = (pages: CortexPageSummary[]): string => {
  const lines = [
    '# Cortex index',
    '',
    'Open a page with `nightshift_sandbox_view_file` using the path in parentheses.',
    '',
  ];

  for (const entityType of CORTEX_ENTITY_TYPES) {
    const bucketPages = pages.filter((page) => page.entity_type === entityType);
    if (bucketPages.length === 0) {
      continue;
    }
    lines.push(`## ${CORTEX_ENTITY_TYPE_BUCKETS[entityType]}`);
    lines.push('');
    for (const page of bucketPages) {
      const path = pagePath(page.entity_type, page.id.replace(`cortex_${page.entity_type}_`, ''));
      lines.push(`- **${page.title}** (${page.status}, ${page.corroborations}x) — \`${path}\``);
    }
    lines.push('');
  }

  if (pages.length === 0) {
    lines.push('_No Cortex pages yet. Investigate first; the optimizer will propose pages._');
    lines.push('');
  }

  return lines.join('\n');
};

const renderPage = (page: CortexPage): string => {
  const header = [
    `---`,
    `title: ${page.title}`,
    `type: ${page.entity_type}`,
    `status: ${page.status}`,
    `corroborations: ${page.corroborations}`,
    `updated_at: ${page.updated_at}`,
    ...(page.description !== undefined ? [`description: ${page.description}`] : []),
    `---`,
    '',
    `# ${page.title}`,
    '',
  ];
  return `${header.join('\n')}${page.content.trim()}\n`;
};

export const materializeCortex = async ({
  apiClient,
  conversationId,
  store,
  logger,
}: {
  apiClient: SandboxApiClient;
  conversationId: string;
  store: CortexPageStore;
  logger: Logger;
}): Promise<void> => {
  await store.pruneDuplicates();
  const { pages } = await store.list();
  const fullPages = (await Promise.all(pages.map(async (summary) => store.get(summary.id)))).filter(
    (page): page is CortexPage => page !== undefined
  );

  const files = [
    { path: `${CORTEX_WORKSPACE_ROOT}/README.md`, content: Buffer.from(README_CONTENT, 'utf8') },
    { path: `${CORTEX_WORKSPACE_ROOT}/INDEX.md`, content: Buffer.from(renderIndex(pages), 'utf8') },
    ...fullPages.map((page) => ({
      path: pagePath(page.entity_type, page.slug),
      content: Buffer.from(renderPage(page), 'utf8'),
    })),
  ];

  await apiClient.mkdirs(conversationId, [
    CORTEX_WORKSPACE_ROOT,
    ...CORTEX_ENTITY_TYPES.map(
      (entityType) => `${CORTEX_WORKSPACE_ROOT}/${CORTEX_ENTITY_TYPE_BUCKETS[entityType]}`
    ),
  ]);
  await apiClient.writeFiles(conversationId, files);

  logger.info(
    `Materialized ${fullPages.length} Cortex page(s) into sandbox conversation ${conversationId}`
  );
};
