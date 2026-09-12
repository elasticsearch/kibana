/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import { SourceMap } from 'node:module';
import vm from 'vm';
import transformer from '.';

const makeTransformOptions = (rootDir = process.cwd(), overrides = {}) => ({
  config: {
    rootDir,
    transform: {},
    transformIgnorePatterns: [],
  },
  instrument: false,
  supportsStaticESM: false,
  ...overrides,
});

const getCode = (source, filename = '/repo/example.ts') => {
  const result = transformer.process(source, filename, makeTransformOptions());
  return typeof result === 'string' ? result : result.code;
};

// Evaluates transformed CommonJS output with a minimal module environment.
const evaluate = (source, { modules = {}, filename = '/repo/example.ts', jestObject } = {}) => {
  const module = { exports: {} };
  const requireModule = (name) => {
    if (!(name in modules)) {
      throw new Error(`Unexpected require of ${name}`);
    }
    return typeof modules[name] === 'function' ? modules[name](module.exports) : modules[name];
  };
  const run = vm.runInThisContext(
    `(function (exports, require, module, jest) {\n${getCode(source, filename)}\n})`,
    { filename }
  );
  run(module.exports, requireModule, module, jestObject ?? { mock: jest.fn() });
  return module.exports;
};

const findOriginalPosition = (result, generatedText, generatedOffset = 0) => {
  const generatedLines = result.code.split('\n');
  const generatedLine = generatedLines.findIndex((line) => line.includes(generatedText));
  const generatedColumn = generatedLines[generatedLine].indexOf(generatedText) + generatedOffset;
  return new SourceMap(JSON.parse(result.map)).findEntry(generatedLine, generatedColumn);
};

describe('SWC Jest transformer', () => {
  describe('jest.mock() hoisting', () => {
    it('strips types and hoists jest.mock() above the mocked import', () => {
      const code = getCode(`
        import { value } from './value';
        jest.mock('./value');
        const answer: number = value;
        export { answer };
      `);

      expect(code).not.toContain(': number');
      expect(code.indexOf(".mock('./value')")).toBeLessThan(code.indexOf('require("./value")'));
    });

    it('inlines an identifier module name from the binding visible at the call site', () => {
      const code = getCode(`
        const modulePath = './real_module';
        jest.mock(modulePath, () => ({}));
        describe('x', () => { const modulePath = './wrong'; });
      `);

      expect(code).toMatch(/\.mock\("\.\/real_module"/);
      expect(code).not.toMatch(/\.mock\(['"]\.\/wrong['"]/);
    });

    it('does not inline a module name declared only in an inner scope', () => {
      const code = getCode(`
        jest.mock(modulePath, () => ({}));
        describe('x', () => { const modulePath = './wrong'; });
      `);

      expect(code).toContain('.mock(modulePath');
    });

    it('inlines module names through enclosing scopes', () => {
      const code = getCode(`
        describe('x', () => {
          const modulePath = './value';
          jest.isolateModules(() => {
            jest.mock(modulePath, () => ({}));
          });
        });
      `);

      expect(code).toMatch(/\.mock\("\.\/value"/);
    });

    it('hoists pure module-level constants referenced by a factory above the requires', () => {
      const code = getCode(`
        const Component = () => null;
        import { rendered } from './component';
        const state = { failing: false, items: [1, 'two', null], nested: { deep: true } };
        jest.mock('./component', () => ({ Component, state }));
        export { rendered };
      `);

      const mockIndex = code.indexOf(".mock('./component'");
      const requireIndex = code.indexOf('require("./component")');
      expect(mockIndex).toBeLessThan(code.indexOf('const Component'));
      expect(code.indexOf('const Component')).toBeLessThan(requireIndex);
      expect(code.indexOf('const state')).toBeLessThan(requireIndex);
    });

    it('lets a factory observe a hoisted constant when the mocked module is first required', () => {
      // Like Jest, invoke the factory when the mocked module is first required.
      const factories = new Map();
      const jestObject = {
        mock: (name, factory) => factories.set(name, factory),
      };
      const exports = evaluate(
        `
          import { rendered } from './component';
          const Component = () => null;
          jest.mock('./component', () => ({ Component }));
          export const value = rendered;
        `,
        {
          jestObject,
          modules: {
            './component': () => ({ rendered: factories.get('./component')().Component }),
          },
        }
      );

      expect(typeof exports.value).toBe('function');
    });

    it('does not hoist impure or mock-prefixed bindings', () => {
      const code = getCode(`
        import { rendered } from './component';
        const mockComponent = () => null;
        const created = createComponent();
        jest.mock('./component', () => ({ mockComponent, created }));
        export { rendered };
      `);

      const requireIndex = code.indexOf('require("./component")');
      expect(code.indexOf('const mockComponent')).toBeGreaterThan(requireIndex);
      expect(code.indexOf('const created')).toBeGreaterThan(requireIndex);
    });

    it('does not hoist reassigned bindings', () => {
      const code = getCode(`
        import { rendered } from './component';
        let flag = false;
        jest.mock('./component', () => ({ flag }));
        flag = true;
        export { rendered };
      `);

      expect(code.indexOf('let flag')).toBeGreaterThan(code.indexOf('require("./component")'));
    });

    it('hoists pure constants inside nested blocks above the mock in source order', () => {
      const code = getCode(`
        describe('x', () => {
          const actual = require('./component');
          const base = { flag: true };
          const Component = () => null;
          jest.mock('./component', () => ({ Component, base }));
          use(actual);
        });
      `);

      const blockStart = code.indexOf("describe('x'");
      const requireIndex = code.indexOf("require('./component')", blockStart);
      expect(code.indexOf('const base', blockStart)).toBeLessThan(
        code.indexOf('const Component', blockStart)
      );
      expect(code.indexOf('const Component', blockStart)).toBeLessThan(requireIndex);
    });

    it('keeps source map positions aligned after hoisting', () => {
      const result = transformer.process(
        `import { rendered } from './component';
const Component = () => null;
jest.mock('./component', () => ({ Component }));
export function boom() {
  throw new Error(rendered);
}`,
        '/repo/subject.ts',
        makeTransformOptions()
      );

      expect(findOriginalPosition(result, 'throw new Error')).toMatchObject({
        originalSource: '/repo/subject.ts',
        originalLine: 4,
        originalColumn: 2,
      });
      expect(findOriginalPosition(result, 'const Component')).toMatchObject({
        originalSource: '/repo/subject.ts',
        originalLine: 1,
        originalColumn: 0,
      });
    });
  });

  describe('CommonJS exports', () => {
    it('materializes immutable local exports as writable data properties after initialization', () => {
      const exports = evaluate(`
        export function useFetcher() { return 'real'; }
        export const theme$ = () => 'real';
        export class Service {}
      `);

      for (const name of ['useFetcher', 'theme$', 'Service']) {
        expect(Object.getOwnPropertyDescriptor(exports, name)).toMatchObject({
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      // Sinon wraps data properties whose value is a function; Jest spies work either way.
      const spy = jest.spyOn(exports, 'useFetcher').mockReturnValue('mocked');
      expect(exports.useFetcher()).toBe('mocked');
      spy.mockRestore();
      expect(exports.useFetcher()).toBe('real');

      exports.theme$ = () => 'assigned';
      expect(exports.theme$()).toBe('assigned');
    });

    it('keeps mutable local exports as live bindings that can still be replaced', () => {
      const exports = evaluate(`
        export let counter = 0;
        export const increment = () => { counter += 1; };
      `);

      exports.increment();
      expect(exports.counter).toBe(1);
      expect(Object.getOwnPropertyDescriptor(exports, 'counter').get).toBeDefined();

      exports.counter = 10;
      expect(exports.counter).toBe(10);
    });

    it('keeps re-exported and namespace bindings live and configurable', () => {
      const dependency = { __esModule: true, value: 1 };
      const exports = evaluate(
        `
          export { value } from './dependency';
          export * from './dependency';
          export * as namespace from './dependency';
        `,
        { modules: { './dependency': dependency } }
      );

      dependency.value = 2;
      expect(exports.value).toBe(2);
      expect(exports.namespace.value).toBe(2);
      expect(Object.getOwnPropertyDescriptor(exports, 'value').configurable).toBe(true);
    });

    it('lets Jest spy on export-star bindings', () => {
      const dependency = { __esModule: true, helper: () => 'real' };
      const exports = evaluate(`export * from './dependency';`, {
        modules: { './dependency': dependency },
      });

      jest.spyOn(exports, 'helper').mockReturnValue('mocked');
      expect(exports.helper()).toBe('mocked');
    });

    it('exposes undefined instead of throwing when a circular import reads an uninitialized export', () => {
      const observed = {};
      const exports = evaluate(
        `
          export const first = 1;
          export const value = require('./cycle').value;
        `,
        {
          modules: {
            './cycle': (partialExports) => {
              observed.first = partialExports.first;
              observed.value = partialExports.value;
              return { value: 'from-cycle' };
            },
          },
        }
      );

      // `first` is initialized before the require; `value` is still in its TDZ.
      expect(observed).toEqual({ first: 1, value: undefined });
      expect(exports.value).toBe('from-cycle');
    });

    it('defines re-export getters before loading dependencies so barrel cycles resolve', () => {
      const code = getCode(`
        export { SchemaError } from './schema_error';
        export { SchemaTypeError } from './schema_type_error';
      `);

      expect(code.indexOf('get SchemaError')).toBeLessThan(
        code.indexOf('require("./schema_error")')
      );
    });

    it('does not modify user defineProperty calls or object getters', () => {
      const code = getCode(`
        const target = {};
        Object.defineProperty(target, 'first', {
          enumerable: true,
          get: function() {
            return missingBinding;
          },
        });
        const object = { get helper() { return target.first; } };
        export const value = object.helper;
      `);

      expect(code).toMatch(
        /Object\.defineProperty\(target, ['"]first['"], \{\n\s+enumerable: true,\n\s+get: function\(\) \{\n\s+return missingBinding;/
      );
      expect(code).not.toContain('Object.defineProperty(exports, "helper"');
      expect(code).not.toContain('Object.defineProperty(exports, "first"');
    });

    it('exposes a sole default export through module.exports', () => {
      const code = getCode(`
        const value = 42;
        // A trailing comment, including a comma.
        export default value;
      `);

      expect(code).toContain('module.exports = exports.default;');
    });

    it('exposes a sole default export alongside type-only exports', () => {
      const code = getCode(`
        export interface Options { value: number }
        export type Value = string;
        export default function main() {}
      `);

      expect(code).toContain('module.exports = exports.default;');
    });

    it('keeps the exports object when named exports or export star are present', () => {
      expect(getCode('export default 42; export const answer = 42;')).not.toContain(
        'module.exports = exports.default;'
      );
      expect(getCode(`export * from './value'; export default 42;`)).not.toContain(
        'module.exports = exports.default;'
      );
    });

    it('does not rewrite hand-written CommonJS default exports', () => {
      expect(getCode('exports.default = function foo() {};')).not.toContain(
        'module.exports = exports.default;'
      );
    });
  });

  describe('TypeScript enums', () => {
    it('inlines enum members initialized from string constants', () => {
      const exports = evaluate(`
        const METRIC_ID = 'metric';
        export enum RuleType { Metric = METRIC_ID }
      `);

      expect(exports.RuleType).toEqual({ Metric: 'metric' });
    });

    it('inlines enum members initialized from deep member access', () => {
      const exports = evaluate(`
        const CFG = { ID: { X: 'x' } } as const;
        export enum RuleType { Metric = CFG.ID.X }
      `);

      expect(exports.RuleType).toEqual({ Metric: 'x' });
    });

    it('inlines enum members initialized from template literals', () => {
      const exports = evaluate(`
        const FEATURE_ID = 'workflowsManagement';
        export enum ApiActions {
          create = \`${'${FEATURE_ID}'}:create\`,
          read = \`${'${FEATURE_ID}'}:read\`,
        }
      `);

      expect(exports.ApiActions).toEqual({
        create: 'workflowsManagement:create',
        read: 'workflowsManagement:read',
      });
    });

    it('keeps numeric reverse mappings', () => {
      const exports = evaluate(`
        const BASE = 10;
        export enum Level { Low = BASE, High = 20 }
      `);

      expect(exports.Level.Low).toBe(10);
      expect(exports.Level[10]).toBe('Low');
      expect(exports.Level[20]).toBe('High');
    });
  });

  describe('lazyObject macro', () => {
    it('expands lazyObject() into annotated factories and imports the helpers', () => {
      const code = getCode(`
        import { lazyObject } from '@kbn/lazy-object';
        export const value = lazyObject({ answer: computeAnswer(), shorthand, 'quoted': other(), [computed]: eager(), ...spread, method() {} });
      `);

      expect(code).toContain('require("@kbn/lazy-object")');
      expect(code).toMatch(/createLazyObjectFromAnnotations\)\(\{/);
      expect(code).toContain('answer: (0, _lazyobject.annotateLazy)(()=>computeAnswer())');
      expect(code).toContain('shorthand: (0, _lazyobject.annotateLazy)(()=>shorthand)');
      expect(code).toContain("'quoted': (0, _lazyobject.annotateLazy)(()=>other())");
      expect(code).toContain('[computed]: eager()');
      expect(code).toContain('...spread');
      expect(code).not.toContain('lazyObject)(');
    });

    it('evaluates lazy properties on first access', () => {
      const lazyObjectModule = jest.requireActual('@kbn/lazy-object');
      const factory = jest.fn(() => 'computed');
      const exports = evaluate(
        `
          import { lazyObject } from '@kbn/lazy-object';
          import { factory } from './factory';
          export const value = lazyObject({ answer: factory() });
        `,
        {
          modules: {
            '@kbn/lazy-object': lazyObjectModule,
            './factory': { __esModule: true, factory },
          },
        }
      );

      expect(factory).not.toHaveBeenCalled();
      expect(exports.value.answer).toBe('computed');
      expect(exports.value.answer).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('leaves lazyObject() alone when the helper is not imported from @kbn/lazy-object', () => {
      const code = getCode(`
        import { lazyObject } from './local';
        export const value = lazyObject({ answer: computeAnswer() });
      `);

      expect(code).not.toContain('annotateLazy');
    });
  });

  describe('JSX and Emotion', () => {
    it('normalizes whitespace in multiline JSX string attributes and keeps positions', () => {
      const result = transformer.process(
        `export const message = (
  <FormattedMessage
    id="example.message"
    defaultMessage="First sentence.
      Second sentence."
  />
);
throw new Error('after');`,
        '/repo/message.tsx',
        makeTransformOptions()
      );

      expect(result.code).toContain('defaultMessage: "First sentence. Second sentence."');
      expect(result.code).not.toContain('First sentence.\\n');
      expect(result.code).toContain('jsxDEV');
      expect(findOriginalPosition(result, "new Error('after')", -6)).toMatchObject({
        originalSource: '/repo/message.tsx',
        originalLine: 7,
        originalColumn: 0,
      });
    });

    it('normalizes multiline attributes that contain an apostrophe', () => {
      const code = getCode(
        `export const message = (
  <FormattedMessage
    id="example.message"
    defaultMessage="If you'd like to continue,
      keep going."
  />
);`,
        '/repo/message.tsx'
      );

      expect(code).toContain(`defaultMessage: "If you'd like to continue, keep going."`);
    });

    it('delimits Emotion labels when CSS templates omit a trailing semicolon', () => {
      const code = getCode(
        `
          import { css } from '@emotion/react';
          export const noSemi = (width: number) => css\`width: ${'${width}'}px\`;
          export const plainNoSemi = css\`color: red\`;
          export const withSemi = (width: number) => css\`width: ${'${width}'}px;\`;
        `,
        '/repo/emotion.ts'
      );

      expect(code).toMatch(/"px",\s*";label:noSemi"/);
      expect(code).toMatch(/"color:red",\s*";label:plainNoSemi"/);
      expect(code).toMatch(/"px;",\s*"label:withSemi"/);
    });
  });

  describe('source maps', () => {
    it('keeps source locations without SWC name mappings', () => {
      const result = transformer.process(
        'export const Component = () => null;',
        '/repo/example.tsx',
        makeTransformOptions()
      );
      const sourceMap = JSON.parse(result.map);

      expect(sourceMap.sources).toContain('/repo/example.tsx');
      expect(sourceMap.names).toEqual([]);
      expect(sourceMap.mappings).not.toBe('');
    });

    it('maps generated positions back to the original source', () => {
      const result = transformer.process(
        `export const value = 1;
export function boom() {
  const message = 'failure';
  throw new Error(message);
}
boom();`,
        '/repo/subject.ts',
        makeTransformOptions()
      );

      expect(findOriginalPosition(result, 'throw new Error')).toMatchObject({
        originalSource: '/repo/subject.ts',
        originalLine: 3,
        originalColumn: 2,
      });
    });

    it('maps positions in non-ASCII sources after rewrites', () => {
      const result = transformer.process(
        `const NAME = 'héllo';
export enum Greeting { Value = NAME }
throw new Error('after');`,
        '/repo/unicode.ts',
        makeTransformOptions()
      );

      expect(result.code).toContain('Greeting["Value"] = "héllo"');
      expect(findOriginalPosition(result, 'throw new Error')).toMatchObject({
        originalSource: '/repo/unicode.ts',
        originalLine: 2,
        originalColumn: 0,
      });
    });
  });

  describe('module formats and caching', () => {
    it('keeps processAsync output in the requested module format', async () => {
      const commonJsResult = await transformer.processAsync(
        'export const value = 1;',
        '/repo/commonjs.ts',
        makeTransformOptions()
      );
      const esmResult = await transformer.processAsync(
        `const CFG = { ID: { X: 'x' } } as const;
         export enum RuleType { Metric = CFG.ID.X }`,
        '/repo/esm.ts',
        makeTransformOptions(process.cwd(), { supportsStaticESM: true })
      );

      expect(commonJsResult.code).toContain('Object.defineProperty(exports, "value"');
      expect(esmResult.code).toContain('export var RuleType');
      expect(esmResult.code).toContain('RuleType["Metric"] = "x"');
      expect(esmResult.code).not.toContain('Object.defineProperty(exports');
    });

    it('returns stable cache keys and varies them with relevant inputs', () => {
      const options = makeTransformOptions();
      const first = transformer.getCacheKey('export const value = 1;', __filename, options);

      expect(first).toMatch(/^[a-f0-9]{32}$/);
      expect(transformer.getCacheKey('export const value = 1;', __filename, options)).toBe(first);
      expect(transformer.getCacheKey('export const value = 2;', __filename, options)).not.toBe(
        first
      );
      expect(
        transformer.getCacheKey(
          'export const value = 1;',
          Path.join(process.cwd(), 'other.ts'),
          options
        )
      ).not.toBe(first);
      expect(
        transformer.getCacheKey(
          'export const value = 1;',
          __filename,
          makeTransformOptions(process.cwd(), { supportsStaticESM: true })
        )
      ).not.toBe(first);
    });
  });
});
