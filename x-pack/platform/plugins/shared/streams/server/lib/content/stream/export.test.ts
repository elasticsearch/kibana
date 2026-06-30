/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sortBy } from 'lodash';
import { ROOT_STREAM_ID } from '@kbn/content-packs-schema';
import { prepareStreamsForExport } from './export';
import { asTree } from './tree';
import { testContentPackEntry } from './test.utils';

const streams = [
  testContentPackEntry({
    name: 'logs',
    routing: [
      { destination: 'logs.foo', where: { always: {} }, status: 'enabled' },
      { destination: 'logs.hello', where: { always: {} }, status: 'enabled' },
    ],
  }),
  testContentPackEntry({
    name: 'logs.foo',
    routing: [{ destination: 'logs.foo.bar', where: { always: {} }, status: 'enabled' }],
  }),
  testContentPackEntry({ name: 'logs.foo.bar' }),
  testContentPackEntry({ name: 'logs.hello' }),
];

describe('content pack export', () => {
  it('renames exported streams', () => {
    const tree = asTree({
      include: { objects: { all: {} } },
      root: 'logs',
      streams,
    });

    const exportedStreams = prepareStreamsForExport({ tree });
    expect(sortBy(exportedStreams, 'name')).toEqual([
      testContentPackEntry({
        name: ROOT_STREAM_ID,
        fields: {},
        routing: [
          { destination: 'foo', where: { always: {} }, status: 'enabled' },
          { destination: 'hello', where: { always: {} }, status: 'enabled' },
        ],
      }),
      testContentPackEntry({
        name: 'foo',
        routing: [{ destination: 'foo.bar', where: { always: {} }, status: 'enabled' }],
      }),
      testContentPackEntry({ name: 'foo.bar' }),
      testContentPackEntry({ name: 'hello' }),
    ]);
  });

  it('exports selected objects', () => {
    const tree = asTree({
      include: {
        objects: {
          mappings: true,
          routing: [
            {
              destination: 'logs.hello',
              objects: {
                mappings: true,
                routing: [],
              },
            },
          ],
        },
      },
      root: 'logs',
      streams,
    });

    const exportedStreams = prepareStreamsForExport({ tree });
    expect(sortBy(exportedStreams, 'name')).toEqual([
      testContentPackEntry({
        name: ROOT_STREAM_ID,
        routing: [{ destination: 'hello', where: { always: {} }, status: 'enabled' }],
      }),
      testContentPackEntry({ name: 'hello' }),
    ]);
  });
});
