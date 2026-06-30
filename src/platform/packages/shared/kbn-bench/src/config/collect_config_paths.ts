/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import Path from 'path';
import execa from 'execa';
import { minimatch } from 'minimatch';

export async function collectConfigPaths({
  patterns,
  cwd,
}: {
  patterns: string[];
  cwd: string;
}): Promise<string[]> {
  const filename = 'benchmark.config.ts';
  const filenameSuffix = '.benchmark.config.ts';

  // get all the benchmark files first, this is much faster than globbing directly
  const { stdout: lsFilesStdout } = await execa(
    'git',
    [
      'ls-files',
      // without -z, some files will be returned with quotes (core.quotePath)
      '-z',
      // make sure files that are not committed yet are included
      '--cached',
      '--others',
      '--exclude-standard',
      filename,
      `**/${filename}`,
      `*${filenameSuffix}`,
      `**/*${filenameSuffix}`,
    ],
    { cwd }
  );

  const files = lsFilesStdout
    .split('\0')
    .filter((f) => f.endsWith(filename) || f.endsWith(filenameSuffix))
    .map((file) => Path.resolve(cwd, file));

  const matchers = patterns.filter(Boolean).map((pattern) => {
    return minimatch.makeRe(Path.isAbsolute(pattern) ? pattern : Path.join(cwd, pattern));
  });

  const matchingFiles = matchers.length
    ? files.filter((file) => {
        return matchers.some((matcher) => matcher && matcher.test(file));
      })
    : files;

  return matchingFiles;
}
