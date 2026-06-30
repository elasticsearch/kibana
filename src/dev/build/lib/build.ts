/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';

import type { Config } from './config';
import type { Platform } from './platform';
import { dashSuffix } from './util';

export class Build {
  private buildDesc: string = '';
  private name = 'kibana';
  private logTag = chalk`{cyan [  kibana  ]}`;

  constructor(private config: Config, private bufferLogs = false) {}

  resolvePath(...args: string[]) {
    return this.config.resolveFromRepo('build', this.name, ...args);
  }

  resolvePathForPlatform(platform: Platform, ...args: string[]) {
    return this.config.resolveFromRepo(
      'build',
      'default',
      `kibana${dashSuffix(
        platform.getVariant()
      )}-${this.config.getBuildVersion()}-${platform.getBuildName()}`,
      ...args
    );
  }

  getPlatformArchivePath(platform: Platform) {
    const ext = platform.isWindows() ? 'zip' : this.config.getTarZstd() ? 'tar.zst' : 'tar.gz';
    return this.config.resolveFromRepo(
      'target',
      `${this.name}${dashSuffix(
        platform.getVariant()
      )}-${this.config.getBuildVersion()}-${platform.getBuildName()}.${ext}`
    );
  }

  getRootDirectory(platform: Platform) {
    return `${this.name}${dashSuffix(platform.getVariant())}-${this.config.getBuildVersion()}`;
  }

  getName() {
    return this.name;
  }

  getLogTag() {
    return this.logTag;
  }

  getBufferLogs() {
    return this.bufferLogs;
  }

  setBuildDesc(desc: string) {
    this.buildDesc = desc;
  }

  getBuildDesc() {
    return this.buildDesc;
  }
}
