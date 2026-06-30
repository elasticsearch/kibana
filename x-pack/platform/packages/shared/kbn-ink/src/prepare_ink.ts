/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Module from 'node:module';

// eval import() to prevent babel from translating it to a CJS require,
// which doesn't work with the top-level await from `ink`.
// eslint-disable-next-line no-new-func
const dynamicImport = new Function('path', 'return import(path);');

let ink: typeof import('ink');

function installModuleIntercept() {
  // @ts-expect-error
  const originalLoad = Module._load;
  // @ts-expect-error
  Module._load = function (...args: any[]) {
    const request = args[0];
    if (request === 'ink') {
      return ink;
    }

    return originalLoad.apply(this, args);
  };
}

export async function prepareInk() {
  ink = await dynamicImport('ink');
  installModuleIntercept();
  return ink;
}

export { ink };
