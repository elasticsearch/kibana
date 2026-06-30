/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs';

import MarkdownIt from 'markdown-it';
import cheerio from 'cheerio';
import { REPO_ROOT } from '@kbn/repo-info';
import { getPackages, getPluginPackagesFilter } from '@kbn/repo-packages';

import { extractAsciidocInfo } from './extract_asciidoc_info';

export interface Plugin {
  id: string;
  relativeDir: string;
  relativeReadmePath?: string;
  readmeSnippet?: string;
}

export type Plugins = Plugin[];

const getReadmeName = (directory: string) =>
  Fs.readdirSync(directory).find(
    (name) => name.toLowerCase() === 'readme.md' || name.toLowerCase() === 'readme.mdx'
  );

const getReadmeAsciidocName = (directory: string) =>
  Fs.readdirSync(directory).find((name) => name.toLowerCase() === 'readme.asciidoc');

export const discoverPlugins = (pluginDir: string): Plugins =>
  getPackages(REPO_ROOT)
    .filter(getPluginPackagesFilter())
    .filter((pkg) => pkg.normalizedRepoRelativeDir.startsWith(pluginDir + '/'))
    .map((pkg): Plugin => {
      const directory = Path.resolve(REPO_ROOT, pkg.normalizedRepoRelativeDir);
      const readmeName = getReadmeName(directory);
      const readmeAsciidocName = getReadmeAsciidocName(directory);

      let relativeReadmePath: string | undefined;
      let readmeSnippet: string | undefined;

      if (readmeAsciidocName) {
        const readmePath = Path.resolve(directory, readmeAsciidocName);
        relativeReadmePath = Path.relative(REPO_ROOT, readmePath);

        const readmeText = Fs.readFileSync(relativeReadmePath).toString();

        const { firstParagraph } = extractAsciidocInfo(readmeText);
        readmeSnippet = firstParagraph;
      } else if (readmeName) {
        const readmePath = Path.resolve(directory, readmeName);
        relativeReadmePath = Path.relative(REPO_ROOT, readmePath);

        const md = new MarkdownIt();
        const parsed = md.render(Fs.readFileSync(readmePath, 'utf8'));
        const $ = cheerio.load(parsed);

        const firstParagraph = $('p')[0];
        if (firstParagraph) {
          readmeSnippet = $(firstParagraph).text();
        }
      }

      return {
        id: pkg.manifest.plugin.id,
        relativeReadmePath,
        relativeDir: relativeReadmePath || Path.relative(REPO_ROOT, directory),
        readmeSnippet,
      };
    });
