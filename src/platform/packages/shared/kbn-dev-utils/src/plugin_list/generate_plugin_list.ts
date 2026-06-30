/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { relative, resolve } from 'path';
import normalizePath from 'normalize-path';
import { REPO_ROOT } from '@kbn/repo-info';

import type { Plugin, Plugins } from './discover_plugins';

function markdownEscape(snippet: string): string {
  return snippet.replaceAll('\n', ' ').replaceAll('|', '\\|');
}

function getLinkAndDescription(plugin: Plugin): { link: string; description: string } {
  const path = normalizePath(plugin.relativeReadmePath || plugin.relativeDir);
  const link = `[${plugin.id}](https://github.com/elastic/kibana/blob/main/${path})`;

  const description =
    plugin.relativeReadmePath && plugin.readmeSnippet
      ? markdownEscape(plugin.readmeSnippet)
      : 'WARNING: Missing or empty README.';

  return { link, description };
}

export function generatePluginList(ossPlugins: Plugins, xpackPlugins: Plugins) {
  return `---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/plugin-list.html
---

% This is an automatically generated file. Please do not edit directly.
% Instead, run the following from within the kibana repository:
%
%  node scripts/build_plugin_list_docs
%
% You can update the template within ${normalizePath(
    relative(REPO_ROOT, resolve(__dirname, __filename))
  )}

# List of Kibana plugins [plugin-list]


## src/plugins [_srcplugins]

| Name | Description |
| --- | --- |
${ossPlugins
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(getLinkAndDescription)
  .map(({ link, description }) => `| ${link} | ${description} |`)
  .join('\n')}

## x-pack/plugins [_x_packplugins]

| Name | Description |
| --- | --- |
${xpackPlugins
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(getLinkAndDescription)
  .map(({ link, description }) => `| ${link} | ${description} |`)
  .join('\n')}
`;
}
