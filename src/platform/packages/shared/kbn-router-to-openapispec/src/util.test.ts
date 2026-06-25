/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RouteMethod } from '@kbn/core-http-server';
import type { OpenAPIV3 } from 'openapi-types';
import type { GetOpId } from './util';
import {
  buildGlobalTags,
  getXsrfHeaderForMethod,
  mergeResponseContent,
  prepareRoutes,
  getPathParameters,
  createOpIdGenerator,
  assignToPaths,
  extractTags,
  setXState,
} from './util';
import type { CustomOperationObject } from './type';

describe('extractTags', () => {
  test.each([
    [[], []],
    [['a', 'b', 'c'], []],
    [
      ['oas-tag:foo', 'b', 'oas-tag:bar'],
      ['foo', 'bar'],
    ],
  ])('given %s returns %s', (input, output) => {
    expect(extractTags(input)).toEqual(output);
  });
});

describe('buildGlobalTags', () => {
  test.each([
    {
      name: 'base case',
      paths: {},
      additionalTags: [],
      output: [],
    },
    {
      name: 'all methods',
      paths: {
        '/foo': {
          get: { tags: ['get'] },
          put: { tags: ['put'] },
          post: { tags: ['post'] },
          patch: { tags: ['patch'] },
          delete: { tags: ['delete'] },
          options: { tags: ['options'] },
          head: { tags: ['head'] },
          trace: { tags: ['trace'] },
        },
      },
      additionalTags: [],
      output: [
        { name: 'delete' },
        { name: 'get' },
        { name: 'head' },
        { name: 'options' },
        { name: 'patch' },
        { name: 'post' },
        { name: 'put' },
        { name: 'trace' },
      ],
    },
    {
      name: 'unknown method',
      paths: {
        '/foo': {
          unknown: { tags: ['not-included'] },
        },
        '/bar': {
          post: { tags: ['bar'] },
        },
      },
      additionalTags: [],
      output: [{ name: 'bar' }],
    },
    {
      name: 'dedup',
      paths: {
        '/foo': {
          get: { tags: ['foo'] },
          patch: { tags: ['foo'] },
        },
        '/bar': {
          get: { tags: ['foo'] },
          post: { tags: ['foo'] },
        },
      },
      additionalTags: [],
      output: [{ name: 'foo' }],
    },
    {
      name: 'dedups with additional tags',
      paths: {
        '/foo': { get: { tags: ['foo'] } },
        '/baz': { patch: { tags: ['foo'] } },
        '/bar': { patch: { tags: ['bar'] } },
      },
      additionalTags: ['foo', 'bar', 'baz'],
      output: [{ name: 'bar' }, { name: 'baz' }, { name: 'foo' }],
    },
  ])('$name', ({ paths, additionalTags, output }) => {
    expect(buildGlobalTags(paths as OpenAPIV3.PathsObject, additionalTags)).toEqual(output);
  });
});

describe('assignToPaths', () => {
  it('should transform path names', () => {
    const paths = {};
    assignToPaths(paths, '/foo', {});
    assignToPaths(paths, '/bar/{id?}', {});
    assignToPaths(paths, '/bar/file/{path*}', {});
    assignToPaths(paths, '/bar/file/{path*}/{id?}', {});
    expect(paths).toEqual({
      '/foo': {},
      '/bar/{id}': {},
      '/bar/file/{path}': {},
      '/bar/file/{path}/{id}': {},
    });
  });
});

describe('prepareRoutes', () => {
  const internal = 'internal' as const;
  const pub = 'public' as const;
  test.each([
    {
      input: [{ path: '/api/foo', options: { access: internal } }],
      output: [{ path: '/api/foo', options: { access: internal } }],
      filters: { access: internal },
    },
    {
      input: [
        { path: '/api/foo', options: { access: internal } },
        { path: '/api/bar', options: { access: internal } },
      ],
      output: [{ path: '/api/bar', options: { access: internal } }],
      filters: { pathStartsWith: ['/api/bar'], access: internal },
    },
    {
      input: [
        { path: '/api/foo', options: { access: pub } },
        { path: '/api/bar', options: { access: internal } },
      ],
      output: [{ path: '/api/foo', options: { access: pub } }],
      filters: { access: pub },
    },
    {
      input: [
        { path: '/api/foo', options: { access: pub } },
        { path: '/api/bar', options: { access: internal } },
        { path: '/api/baz', options: { access: pub } },
      ],
      output: [{ path: '/api/foo', options: { access: pub } }],
      filters: { pathStartsWith: ['/api/foo'], access: pub },
    },
    {
      input: [
        { path: '/api/foo', options: { access: pub } },
        { path: '/api/bar', options: { access: internal } },
        { path: '/api/baz', options: { access: pub } },
      ],
      output: [{ path: '/api/foo', options: { access: pub } }],
      filters: { excludePathsMatching: ['/api/b'], access: pub },
    },
    {
      input: [
        { path: '/api/foo', options: { access: pub, excludeFromOAS: true } },
        { path: '/api/bar', options: { access: internal } },
        { path: '/api/baz', options: { access: pub } },
      ],
      output: [{ path: '/api/baz', options: { access: pub } }],
      filters: { excludePathsMatching: ['/api/bar'], access: pub },
    },
  ])('returns the expected routes #%#', ({ input, output, filters }) => {
    expect(prepareRoutes(input, filters)).toEqual(output);
  });
});

describe('mergeResponseContent', () => {
  it('returns an empty object if no content is provided', () => {
    expect(mergeResponseContent(undefined, undefined)).toEqual({});
    expect(mergeResponseContent({}, {})).toEqual({});
  });

  it('merges content objects', () => {
    expect(
      mergeResponseContent(
        {
          ['application/json+v1']: { encoding: {} },
        },
        {
          ['application/json+v1']: { example: 'overridden' },
          ['application/json+v2']: {},
        }
      )
    ).toEqual({
      content: {
        ['application/json+v1']: { example: 'overridden' },
        ['application/json+v2']: {},
      },
    });
  });
});

describe('getXsrfHeaderForMethod', () => {
  const headerParam = () => [
    {
      description: 'A required header to protect against CSRF attacks',
      in: 'header',
      name: 'kbn-xsrf',
      required: true,
      schema: {
        example: 'true',
        type: 'string',
      },
    },
  ];
  test.each([
    { method: 'get', expected: [] },
    { method: 'options', expected: [] },
    { method: 'put', expected: headerParam() },
    { method: 'post', expected: headerParam() },
    { method: 'patch', expected: headerParam() },
    { method: 'delete', expected: headerParam() },
    { method: 'everything-else', expected: headerParam() },

    { method: 'get, xsrfRequired: false', options: { xsrfRequired: false }, expected: [] },
    { method: 'option, xsrfRequired: falses', options: { xsrfRequired: false }, expected: [] },
    { method: 'put, xsrfRequired: false', options: { xsrfRequired: false }, expected: [] },
    { method: 'post, xsrfRequired: false', options: { xsrfRequired: false }, expected: [] },
    { method: 'patch, xsrfRequired: false', options: { xsrfRequired: false }, expected: [] },
    { method: 'delete, xsrfRequired: false', options: { xsrfRequired: false }, expected: [] },
    {
      method: 'everything-else, xsrfRequired: false',
      options: { xsrfRequired: false },
      expected: [],
    },
  ])('$method', ({ method, options, expected }) => {
    expect(getXsrfHeaderForMethod(method as RouteMethod, options)).toEqual(expected);
  });
});

describe('getPathParameters', () => {
  test.each([
    ['', {}],
    ['/', {}],
    ['{}', {}],
    ['{{}', {}],
    ['{badinput', {}],
    ['{ok}', { ok: { optional: false } }],
    ['{ok?}', { ok: { optional: true } }],
    ['{ok??}', {}],
    ['/api/{path}/is/{cool}', { path: { optional: false }, cool: { optional: false } }],
    [
      '/{required}/and/{optional?}',
      { required: { optional: false }, optional: { optional: true } },
    ],
  ])('%s', (input, output) => {
    expect(getPathParameters(input)).toEqual(output);
  });
});

describe('createOpIdGenerator', () => {
  let getOpId: GetOpId;
  beforeEach(() => {
    getOpId = createOpIdGenerator();
  });
  test('empty', () => {
    expect(() => getOpId({ method: '', path: '/asd' })).toThrow(/Must provide method and path/);
    expect(() => getOpId({ method: 'get', path: '' })).toThrow(/Must provide method and path/);
    expect(() => getOpId({ method: '', path: '' })).toThrow(/Must provide method and path/);
  });
  test('disambiguate', () => {
    expect(getOpId({ method: 'get', path: '/test' })).toBe('get-test');
    expect(getOpId({ method: 'get', path: '/test' })).toBe('get-test-2');
    expect(getOpId({ method: 'get', path: '/test' })).toBe('get-test-3');
    expect(getOpId({ method: 'get', path: '/test' })).toBe('get-test-4');
  });
  test.each([
    { input: { method: 'GET', path: '/api/file' }, output: 'get-file' },
    { input: { method: 'GET', path: '///api/file///' }, output: 'get-file' },
    { input: { method: 'POST', path: '/internal/api/file' }, output: 'post-file' },
    { input: { method: 'PUT', path: '/internal/file' }, output: 'put-file' },
    { input: { method: 'Put', path: 'fOO/fILe' }, output: 'put-foo-file' },
    {
      input: { method: 'delete', path: '/api/my/really/cool/domain/resource' },
      output: 'delete-my-really-cool-domain-resource',
    },
    {
      input: {
        method: 'delete',
        path: '/api/my/really/cool/domain/resource',
      },
      output: 'delete-my-really-cool-domain-resource',
    },
    {
      input: {
        method: 'get',
        path: '/api/my/resource/{id}',
      },
      output: 'get-my-resource-id',
    },
    {
      input: {
        method: 'get',
        path: '/api/my/resource/{id}/{type?}',
      },
      output: 'get-my-resource-id-type',
    },
    {
      input: {
        method: 'get',
        path: '/api/my/resource/{id?}',
      },
      output: 'get-my-resource-id',
    },
    {
      input: {
        method: 'get',
        path: '/api/my/resource/{path}',
      },
      output: 'get-my-resource-path',
    },
    {
      input: {
        method: 'get',
        path: '/api/my/underscore_resource',
      },
      output: 'get-my-underscore-resource',
    },
    {
      input: {
        method: 'get',
        path: '/api/my/_underscore_resource',
      },
      output: 'get-my-underscore-resource',
    },
  ])('$input.method $input.path -> $output', ({ input, output }) => {
    expect(getOpId(input)).toBe(output);
  });
});

describe('setXState', () => {
  describe('with serverless=false (default)', () => {
    test.each([
      {
        name: 'stable with since',
        availability: { stability: 'stable' as const, since: '8.0.0' },
        expected: 'Generally available; added in 8.0.0',
      },
      {
        name: 'stable without since',
        availability: { stability: 'stable' as const },
        expected: 'Generally available',
      },
      {
        name: 'experimental with since',
        availability: { stability: 'experimental' as const, since: '8.0.0' },
        expected: 'Experimental; added in 8.0.0',
      },
      {
        name: 'experimental without since',
        availability: { stability: 'experimental' as const },
        expected: 'Experimental',
      },
      {
        name: 'tech_preview with since',
        availability: { stability: 'tech_preview' as const, since: '8.0.0' },
        expected: 'Technical Preview; added in 8.0.0',
      },
      {
        name: 'tech_preview without since',
        availability: { stability: 'tech_preview' as const },
        expected: 'Technical Preview',
      },
      {
        name: 'no availability',
        availability: undefined,
        expected: undefined,
      },
      {
        name: 'only since',
        availability: { since: '8.0.0' },
        expected: 'Added in 8.0.0',
      },
    ])('$name', ({ availability, expected }) => {
      // Create a minimal valid CustomOperationObject with required responses property
      const operation: CustomOperationObject = {
        responses: {
          '200': {
            description: 'OK',
          },
        },
      };
      setXState(availability, operation, { serverless: false });
      expect(operation['x-state']).toBe(expected);
    });
  });

  describe('with serverless=true', () => {
    test.each([
      {
        name: 'stable with since',
        availability: { stability: 'stable' as const, since: '8.0.0' },
        expected: 'Generally available',
      },
      {
        name: 'stable without since',
        availability: { stability: 'stable' as const },
        expected: 'Generally available',
      },
      {
        name: 'experimental with since',
        availability: { stability: 'experimental' as const, since: '8.0.0' },
        expected: 'Experimental',
      },
      {
        name: 'experimental without since',
        availability: { stability: 'experimental' as const },
        expected: 'Experimental',
      },
      {
        name: 'tech_preview with since',
        availability: { stability: 'tech_preview' as const, since: '8.0.0' },
        expected: 'Technical Preview',
      },
      {
        name: 'tech_preview without since',
        availability: { stability: 'tech_preview' as const },
        expected: 'Technical Preview',
      },
      {
        name: 'no availability',
        availability: undefined,
        expected: undefined,
      },
      {
        name: 'only since',
        availability: { since: '8.0.0' },
        expected: '',
      },
    ])('$name', ({ availability, expected }) => {
      // Create a minimal valid CustomOperationObject with required responses property
      const operation: CustomOperationObject = {
        responses: {
          '200': {
            description: 'OK',
          },
        },
      };
      setXState(availability, operation, { serverless: true });
      expect(operation['x-state']).toBe(expected);
    });
  });
});
