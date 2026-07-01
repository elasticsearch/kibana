/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderElement } from '@kbn/agent-builder-common/tools/custom_rendering';
import { createTagParser } from './utils';

/**
 * Parser for <render> tags in markdown.
 * Converts HTML/text nodes containing render tags into structured AST nodes
 * carrying the workspace `path` and renderer `type`.
 *
 * The `type` attribute is mapped onto a `renderType` node field because a
 * unist/mdast node's `type` is its kind (here, `'render'`).
 */
export const renderTagParser = createTagParser({
  tagName: renderElement.tagName,
  getAttributes: (value, extractAttr) => ({
    path: extractAttr(value, renderElement.attributes.path),
    type: extractAttr(value, renderElement.attributes.type),
  }),
  createNode: (attributes, position) => ({
    type: renderElement.tagName,
    path: attributes.path,
    renderType: attributes.type,
    position,
  }),
});
