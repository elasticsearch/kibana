/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { Parent } from 'mdast';
import type { Node } from 'unist';
import type { ConversationRoundStep } from '@kbn/agent-builder-common';
import type { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';

export type MutableNode = Node & {
  value?: string;
  toolResultId?: string;
  chartType?: string;
  attachmentId?: string;
  attachmentVersion?: string;
  path?: string;
  renderType?: string;
};

export const createTagParser = <T extends Record<string, string | undefined>>(config: {
  tagName: string;
  getAttributes: (
    value: string,
    extractAttr: (value: string, attr: string) => string | undefined
  ) => T;
  createNode: (attributes: T, position: MutableNode['position']) => MutableNode;
}) => {
  return () => {
    const extractAttribute = (value: string, attr: string) => {
      // (?:^|\s) prevents a short attr name like "id" from matching inside a
      // longer attribute name (e.g. "field-id") that ends with the same string.
      const regex = new RegExp(`(?:^|\\s)${attr}="([^"]*)"`, 'i');
      return value.match(regex)?.[1];
    };

    const tagRegex = new RegExp(`<${config.tagName}\\b[^>]*\\/?>`, 'gi');

    const visitParent = (parent: Parent) => {
      for (let index = 0; index < parent.children.length; index++) {
        const child = parent.children[index] as MutableNode;

        if ('children' in child) {
          visitParent(child as Parent);
        }

        if (child.type !== 'html' && child.type !== 'text') {
          continue; // only html/text nodes can contain the raw tag markup
        }

        const rawValue = child.value;
        if (!rawValue) {
          continue; // nothing to scan
        }

        // Match tags wherever they appear in the node, not just at the start.
        // remark cannot tokenize tag names containing underscores into their own
        // html nodes, so the tag is frequently embedded inside a text node along
        // with surrounding prose (e.g. "Rule:\n<render_attachment .../>").
        const matches = Array.from(rawValue.matchAll(tagRegex));
        if (matches.length === 0) {
          continue;
        }

        // Rebuild the node as a sequence of [leading text, tag, text, tag, ...]
        // preserving any prose around the tag(s).
        const replacementNodes: Node[] = [];
        let cursorIndex = 0;

        const pushTextSegment = (text: string) => {
          // Drop whitespace-only gaps (e.g. newlines between stacked tags) so we
          // don't introduce empty paragraphs between rendered attachments.
          if (text.trim().length === 0) {
            return;
          }
          replacementNodes.push({
            type: 'text',
            value: text,
            position: child.position,
          } as MutableNode);
        };

        for (const match of matches) {
          const matchIndex = match.index ?? 0;
          pushTextSegment(rawValue.slice(cursorIndex, matchIndex));
          const attributes = config.getAttributes(match[0], extractAttribute);
          replacementNodes.push(config.createNode(attributes, child.position));
          cursorIndex = matchIndex + match[0].length;
        }
        pushTextSegment(rawValue.slice(cursorIndex));

        const siblings = parent.children as Node[];
        siblings.splice(index, 1, ...replacementNodes);
        index += replacementNodes.length - 1;
      }
    };

    return (tree: Node) => {
      if ('children' in tree) {
        visitParent(tree as Parent);
      }
    };
  };
};

export const findToolResult = <T>(
  steps: ConversationRoundStep[],
  toolResultId: string,
  resultType: ToolResultType
): T | undefined => {
  return steps
    .filter((s) => s.type === 'tool_call')
    .flatMap((s) => (s.type === 'tool_call' && s.results) || [])
    .find((r) => r.type === resultType && r.tool_result_id === toolResultId) as T | undefined;
};
