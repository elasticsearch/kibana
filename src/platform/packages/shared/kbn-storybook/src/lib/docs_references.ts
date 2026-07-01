/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { StorybookDocsRegistry } from './docs_assets';

export interface StorybookDocsReference {
  file: string;
  id: string;
  line: number;
}

export interface ValidateStorybookDocsReferencesResult {
  references: StorybookDocsReference[];
  missing: StorybookDocsReference[];
}

const directiveStartRegex = /^\s*:{3,}\s*(?:\{storybook\}|storybook)(?:\s|$)/;
const directiveEndRegex = /^\s*:{3,}\s*$/;
const idRegex = /^\s*:id:\s*(\S+)/;

export const extractStorybookDocsReferences = ({
  markdown,
  file = '<inline>',
}: {
  markdown: string;
  file?: string;
}): StorybookDocsReference[] => {
  const references: StorybookDocsReference[] = [];
  let inStorybookDirective = false;

  markdown.split(/\r?\n/).forEach((line, index) => {
    if (directiveStartRegex.test(line)) {
      inStorybookDirective = true;
      return;
    }

    if (!inStorybookDirective) {
      return;
    }

    const idMatch = line.match(idRegex);

    if (idMatch) {
      references.push({
        file,
        id: idMatch[1],
        line: index + 1,
      });
    }

    if (directiveEndRegex.test(line)) {
      inStorybookDirective = false;
    }
  });

  return references;
};

const getMarkdownFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        return getMarkdownFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        return [entryPath];
      }

      return [];
    })
  );

  return nestedFiles.flat();
};

export const validateStorybookDocsReferences = async ({
  docsRoot,
  registryPath,
}: {
  docsRoot: string;
  registryPath: string;
}): Promise<ValidateStorybookDocsReferencesResult> => {
  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as StorybookDocsRegistry;
  const registryIds = new Set(Object.keys(registry.stories));
  const markdownFiles = await getMarkdownFiles(docsRoot);
  const references = (
    await Promise.all(
      markdownFiles.map(async (file) =>
        extractStorybookDocsReferences({
          file,
          markdown: await readFile(file, 'utf8'),
        })
      )
    )
  ).flat();

  return {
    references,
    missing: references.filter(({ id }) => !registryIds.has(id)),
  };
};
