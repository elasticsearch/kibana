/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import os from 'os';
import { args } from './args';

describe('headless webgl arm mac workaround', () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  const simulateEnv = (platform: string, arch: ReturnType<typeof os.arch>) => {
    Object.defineProperty(process, 'platform', { value: platform });
    jest.spyOn(os, 'arch').mockReturnValue(arch);
  };

  test('disables gpu', () => {
    simulateEnv('darwin', 'x64');

    const flags = args({
      userDataDir: '/',
      proxy: { enabled: false },
    });
    expect(flags.includes(`--disable-gpu`)).toBe(true);
    expect(flags.includes(`--enable-gpu`)).toBe(false);
    expect(flags.includes(`--enable-unsafe-swiftshader`)).toBe(true);
  });
});
