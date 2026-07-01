/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import unified from 'unified';
import remarkParse from 'remark-parse-no-trim';
import type { Node, Parent } from 'unist';
import {
  renderElement,
  renderAttachmentElement,
} from '@kbn/agent-builder-common/tools/custom_rendering';
import { renderTagParser } from './render_plugin';
import { renderAttachmentTagParser } from './render_attachment_plugin';
import type { MutableNode } from './utils';

/**
 * Parses markdown the same way the chat renderer does (remark parser + the
 * render tag parser transformer), so the test exercises the real mdast shapes
 * produced by remark rather than hand-built trees.
 */
const parseMarkdown = (markdown: string): Node => {
  const processor = unified().use(remarkParse).use(renderTagParser);
  const tree = processor.parse(markdown);
  return processor.runSync(tree);
};

const collectNodesByType = (tree: Node, type: string): MutableNode[] => {
  const found: MutableNode[] = [];
  const walk = (node: Node) => {
    if (node.type === type) {
      found.push(node as MutableNode);
    }
    if ('children' in node) {
      (node as Parent).children.forEach(walk);
    }
  };
  walk(tree);
  return found;
};

const collectTextValues = (tree: Node): string[] =>
  collectNodesByType(tree, 'text').map((n) => n.value ?? '');

const tag = (path: string, type = 'dashboard') =>
  `<${renderElement.tagName} ${renderElement.attributes.path}="${path}" ${renderElement.attributes.type}="${type}"/>`;

describe('renderTagParser', () => {
  it('maps path and type attributes onto the render node (type → renderType)', () => {
    const parser = renderTagParser();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'html',
          value: tag('/workspace/renders/dashboard/sales.json', 'dashboard'),
        },
      ],
    };

    parser(tree as any);

    expect(tree.children[0]).toMatchObject({
      type: renderElement.tagName,
      path: '/workspace/renders/dashboard/sales.json',
      renderType: 'dashboard',
    });
  });

  it('still produces a node when attributes are missing (lenient, never throws)', () => {
    const parser = renderTagParser();
    const tree = {
      type: 'root',
      children: [{ type: 'html', value: `<${renderElement.tagName}/>` }],
    };

    expect(() => parser(tree as any)).not.toThrow();
    expect(tree.children[0]).toMatchObject({
      type: renderElement.tagName,
      path: undefined,
      renderType: undefined,
    });
  });

  describe('with markdown parsed by remark (real pipeline)', () => {
    it('parses a tag that stands alone in its own paragraph', () => {
      const tree = parseMarkdown(tag('/workspace/renders/dashboard/sales.json', 'dashboard'));

      const nodes = collectNodesByType(tree, renderElement.tagName);
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        type: renderElement.tagName,
        path: '/workspace/renders/dashboard/sales.json',
        renderType: 'dashboard',
      });
    });

    it('parses tags with prose above and trailing text on the same line', () => {
      const markdown = `Sales:\n${tag(
        '/workspace/renders/dashboard/sales.json'
      )} is ready.\n\nOps:\n${tag('/workspace/renders/dashboard/ops.json')}`;

      const tree = parseMarkdown(markdown);

      const nodes = collectNodesByType(tree, renderElement.tagName);
      expect(nodes.map((n) => n.path)).toEqual([
        '/workspace/renders/dashboard/sales.json',
        '/workspace/renders/dashboard/ops.json',
      ]);

      const allText = collectTextValues(tree).join('');
      // The literal tag markup must not survive as visible text.
      expect(allText).not.toContain('<render');
      // Surrounding prose must be preserved.
      expect(allText).toContain('Sales:');
      expect(allText).toContain('is ready.');
      expect(allText).toContain('Ops:');
    });

    it('does not capture <render_attachment> tags (word-boundary disjoint)', () => {
      const markdown = `<${renderAttachmentElement.tagName} ${renderAttachmentElement.attributes.attachmentId}="dash-1"/>`;

      const tree = parseMarkdown(markdown);

      expect(collectNodesByType(tree, renderElement.tagName)).toHaveLength(0);
    });
  });

  describe('renderAttachmentTagParser interplay', () => {
    it('leaves <render> tags untouched (render_attachment parser is disjoint)', () => {
      const parser = renderAttachmentTagParser();
      const tree = {
        type: 'root',
        children: [{ type: 'html', value: tag('/workspace/renders/dashboard/sales.json') }],
      };

      parser(tree as any);

      // render_attachment parser must not turn a <render> tag into a render_attachment node.
      expect(collectNodesByType(tree as Node, renderAttachmentElement.tagName)).toHaveLength(0);
    });
  });
});
