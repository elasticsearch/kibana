/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { asTree, mergeTrees } from './tree';
import { testContentPackEntry } from './test.utils';
import { baseFields } from '../../streams/component_templates/logs_layer';

describe('content pack tree helpers', () => {
  describe('asTree', () => {
    it('builds a complete tree when includeAll is provided', () => {
      const root = testContentPackEntry({
        name: 'root',
        routing: [
          { destination: 'root.child1', where: { always: {} }, status: 'enabled' },
          { destination: 'root.child2', where: { always: {} }, status: 'enabled' },
        ],
      });
      const child1 = testContentPackEntry({
        name: 'root.child1',
        routing: [{ destination: 'root.child1.nested', where: { always: {} }, status: 'enabled' }],
      });
      const child2 = testContentPackEntry({ name: 'root.child2' });
      const child1Nested = testContentPackEntry({ name: 'root.child1.nested' });

      const tree = asTree({
        root: 'root',
        streams: [root, child1, child2, child1Nested],
        include: { objects: { all: {} } },
      });

      expect(tree.children).toHaveLength(2);
      expect(tree.children[0].name).toEqual('root.child1');
      expect(tree.children[1].name).toEqual('root.child2');
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].name).toEqual('root.child1.nested');
    });

    it('allows nested includeAll', () => {
      const root = testContentPackEntry({
        name: 'root',
        routing: [
          { destination: 'root.child1', where: { always: {} }, status: 'enabled' },
          { destination: 'root.child2', where: { always: {} }, status: 'enabled' },
        ],
      });
      const child1 = testContentPackEntry({
        name: 'root.child1',
        routing: [{ destination: 'root.child1.nested', where: { always: {} }, status: 'enabled' }],
      });
      const child2 = testContentPackEntry({ name: 'root.child2' });
      const child1Nested = testContentPackEntry({ name: 'root.child1.nested' });

      const tree = asTree({
        root: 'root',
        streams: [root, child1, child2, child1Nested],
        include: {
          objects: {
            mappings: true,
            routing: [{ destination: 'root.child1', objects: { all: {} } }],
          },
        },
      });

      expect(tree.children).toHaveLength(1);
      expect(tree.request.stream.ingest.wired.routing).toEqual([
        { destination: 'root.child1', where: { always: {} }, status: 'enabled' },
      ]);
      expect(tree.children[0].name).toEqual('root.child1');
      expect(tree.children[0].request.stream.ingest.wired.routing).toEqual([
        { destination: 'root.child1.nested', where: { always: {} }, status: 'enabled' },
      ]);
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].name).toEqual('root.child1.nested');
    });

    it('throws when an included stream does not exist', () => {
      const root = testContentPackEntry({
        name: 'root',
        routing: [{ destination: 'root.child1', where: { always: {} }, status: 'enabled' }],
      });
      const child1 = testContentPackEntry({ name: 'root.child1' });

      expect(() =>
        asTree({
          root: 'root',
          streams: [root, child1],
          include: {
            objects: {
              mappings: true,
              routing: [{ destination: 'root.child2', objects: { all: {} } }],
            },
          },
        })
      ).toThrow('Stream [root] does not route to [root.child2]');
    });
  });

  describe('mergeTrees', () => {
    it('merges distinct children and fields', () => {
      const existing = asTree({
        root: 'logs.foo',
        streams: [
          testContentPackEntry({
            name: 'logs.foo',
            routing: [{ destination: 'logs.foo.one', where: { always: {} }, status: 'enabled' }],
            fields: { existing: { type: 'keyword' } },
          }),
          testContentPackEntry({ name: 'logs.foo.one' }),
        ],
        include: { objects: { all: {} } },
      });

      const incoming = asTree({
        root: 'logs.foo',
        streams: [
          testContentPackEntry({
            name: 'logs.foo',
            routing: [{ destination: 'logs.foo.two', where: { always: {} }, status: 'enabled' }],
            fields: { custom: { type: 'keyword' } },
          }),
          testContentPackEntry({ name: 'logs.foo.two' }),
        ],
        include: { objects: { all: {} } },
      });

      const merged = mergeTrees({ existing, incoming });
      expect(merged.request.stream.ingest.wired.routing).toEqual([
        { destination: 'logs.foo.one', where: { always: {} }, status: 'enabled' },
        { destination: 'logs.foo.two', where: { always: {} }, status: 'enabled' },
      ]);
      expect(merged.request.stream.ingest.wired.fields).toEqual({
        existing: { type: 'keyword' },
        custom: { type: 'keyword' },
      });
    });

    it('throws on duplicate child destination', () => {
      const existing = asTree({
        root: 'logs',
        streams: [
          testContentPackEntry({
            name: 'logs',
            routing: [{ destination: 'logs.foo', where: { always: {} }, status: 'enabled' }],
          }),
          testContentPackEntry({ name: 'logs.foo' }),
        ],
        include: { objects: { all: {} } },
      });

      const incoming = asTree({
        root: 'logs',
        streams: [
          testContentPackEntry({
            name: 'logs',
            routing: [{ destination: 'logs.foo', where: { always: {} }, status: 'enabled' }],
          }),
          testContentPackEntry({ name: 'logs.foo' }),
        ],
        include: { objects: { all: {} } },
      });

      expect(() => mergeTrees({ existing, incoming })).toThrow('[logs.foo] already exists');
    });

    it('throws on conflicting field mapping', () => {
      const existing = asTree({
        root: 'logs.foo',
        streams: [
          testContentPackEntry({ name: 'logs.foo', fields: { custom: { type: 'keyword' } } }),
        ],
        include: { objects: { all: {} } },
      });

      const incoming = asTree({
        root: 'logs.foo',
        streams: [testContentPackEntry({ name: 'logs.foo', fields: { custom: { type: 'long' } } })],
        include: { objects: { all: {} } },
      });

      expect(() => mergeTrees({ existing, incoming })).toThrow(
        'Cannot change mapping of [custom] for [logs.foo]'
      );
    });

    it('keeps base fields on root stream', () => {
      const existing = asTree({
        root: 'logs',
        streams: [testContentPackEntry({ name: 'logs', fields: baseFields })],
        include: { objects: { all: {} } },
      });

      const incoming = asTree({
        root: 'logs',
        streams: [testContentPackEntry({ name: 'logs', fields: {} })],
        include: { objects: { all: {} } },
      });

      const merged = mergeTrees({ existing, incoming });
      expect(merged.request.stream.ingest.wired.fields).toEqual(baseFields);
    });
  });
});
