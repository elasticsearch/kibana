/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Platform } from './platform';

describe('getName()', () => {
  it('returns the name argument', () => {
    expect(new Platform('win32', 'x64', 'foo').getName()).toBe('win32');
  });
});

describe('getNodeArch()', () => {
  it('returns the node arch for the passed name', () => {
    expect(new Platform('win32', 'x64', 'foo').getNodeArch()).toBe('win32-x64');
  });
});

describe('getBuildName()', () => {
  it('returns the build name for the passed name', () => {
    expect(new Platform('linux', 'arm64', 'linux-aarch64').getBuildName()).toBe('linux-aarch64');
  });
});

describe('isWindows()', () => {
  it('returns true if name is win32', () => {
    expect(new Platform('win32', 'x64', 'foo').isWindows()).toBe(true);
    expect(new Platform('linux', 'x64', 'foo').isWindows()).toBe(false);
    expect(new Platform('darwin', 'x64', 'foo').isWindows()).toBe(false);
    expect(new Platform('darwin', 'arm64', 'foo').isWindows()).toBe(false);
  });
});

describe('isLinux()', () => {
  it('returns true if name is linux', () => {
    expect(new Platform('win32', 'x64', 'foo').isLinux()).toBe(false);
    expect(new Platform('linux', 'x64', 'foo').isLinux()).toBe(true);
    expect(new Platform('darwin', 'x64', 'foo').isLinux()).toBe(false);
    expect(new Platform('darwin', 'arm64', 'foo').isLinux()).toBe(false);
  });
});

describe('isMac()', () => {
  it('returns true if name is darwin', () => {
    expect(new Platform('win32', 'x64', 'foo').isMac()).toBe(false);
    expect(new Platform('linux', 'x64', 'foo').isMac()).toBe(false);
    expect(new Platform('darwin', 'x64', 'foo').isMac()).toBe(true);
    expect(new Platform('darwin', 'arm64', 'foo').isMac()).toBe(true);
  });
});

describe('isServerless()', () => {
  it('returns true if serverless', () => {
    expect(new Platform('linux', 'x64', 'test', 'serverless').isServerless()).toBe(true);
    expect(new Platform('linux', 'x64', 'test').isServerless()).toBe(false);
  });
});

describe('toString()', () => {
  it('returns the correct string', () => {
    expect(new Platform('linux', 'x64', 'test').toString()).toBe('linux-x64');
    expect(new Platform('darwin', 'arm64', 'test').toString()).toBe('darwin-arm64');
    expect(new Platform('linux', 'x64', 'test', 'serverless').toString()).toBe(
      'linux-x64-serverless'
    );
  });
});
