/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// canvg has no `types` condition in its package `exports` map, so TS bundler
// resolution can't find the types. The package's own `lib/index.d.ts` re-exports
// from sibling files that are only emitted as `.d.ts` (not `.js`), which makes
// any tool that *also* follows the path map (Rspack, Jest) try to bundle the
// `.d.ts` as JS and fail. This shim provides a minimal, structural surface for
// type-checking only — runtime resolution still picks the real package via
// `exports.import` / `exports.require`.

declare module 'canvg' {
  export class Canvg {
    static from(ctx: any, svgString: string, options?: any): Promise<Canvg>;
    static fromString(ctx: any, svgString: string, options?: any): Canvg;
    start(options?: any): void;
    stop(): void;
    resize(width?: number, height?: number, preserveAspectRatio?: boolean | string): void;
    render(options?: any): Promise<void>;
  }
  const _default: typeof Canvg;
  // eslint-disable-next-line import/no-default-export
  export default _default;
}
