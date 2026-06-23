/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';
import { cruise } from 'dependency-cruiser';
import fs from 'fs';
import nodePath from 'path';

import { groupFilesByOwners } from '../../lib/group_by_owners.ts';
import { groupBySource } from '../../lib/group_by_source.ts';
import { groupByPackage } from '../../lib/group_by_package.ts';
import { createCollapseRegexWithDepth } from '../../lib/collapse_with_depth.ts';
import { aggregationGroups, excludePaths } from '../common/constants.ts';

interface DependencyGraphOptions {
  isVerbose?: boolean;
  summary?: boolean;
  collapseDepth: number;
  groupBy?: string;
}

type PathsToAnalyze = string[];
type DependencyName = string | undefined;

/** Regex that collapses node_modules entries to their top-level package name. */
export const NODE_MODULES_COLLAPSE_REGEX = '^node_modules/(@[^/]+/[^/]+|[^/]+)';

/**
 * Run dependency-cruiser for a set of paths, capturing all external (node_modules)
 * imports. Source file paths are intentionally NOT collapsed so that each dep
 * module's `dependents[]` holds real file paths — suitable for per-file analysis
 * such as ES indexing.
 */
export async function cruiseExternalDeps(paths: PathsToAnalyze) {
  return cruise(paths, {
    ruleSet: {
      forbidden: [
        {
          name: 'external-deps',
          severity: 'info',
          from: { path: paths.map((p) => `^${p}`) },
          to: { path: '^node_modules' },
        },
      ],
    },
    doNotFollow: { path: 'node_modules' },
    // @ts-expect-error wrongly typed in dependency-cruiser, see https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md#extensions
    extensions: ['.ts', '.tsx'],
    focus: '^node_modules',
    exclude: { path: excludePaths },
    onlyReachable: paths.map((p) => `^${p}`).join('|'),
    includeOnly: ['^node_modules', ...paths.map((p) => `^${p}`)],
    validate: true,
    collapse: NODE_MODULES_COLLAPSE_REGEX,
  });
}

const invokeDependencyCruiser = async (
  paths: PathsToAnalyze,
  dependencyName: DependencyName,
  { summary, collapseDepth }: Omit<DependencyGraphOptions, 'groupBy' | 'verbose'>
) => {
  const collapseByNodeModule = !dependencyName || (dependencyName && summary);
  const collapseRules = [createCollapseRegexWithDepth(aggregationGroups, collapseDepth)];

  if (collapseByNodeModule) {
    collapseRules.push(NODE_MODULES_COLLAPSE_REGEX);
  }

  const captureRule = dependencyName
    ? {
        name: `dependency-usage ${dependencyName}`,
        severity: 'info',
        from: { pathNot: '^node_modules' },
        to: { path: dependencyName },
      }
    : {
        name: 'external-deps',
        severity: 'info',
        from: { path: paths.map((path) => `^${path}`) },
        to: { path: '^node_modules' },
      };

  const result = await cruise(paths, {
    ruleSet: {
      // @ts-expect-error
      forbidden: [captureRule],
    },
    doNotFollow: {
      path: 'node_modules',
    },
    extensions: ['.ts', '.tsx'],
    focus: '^node_modules',
    exclude: {
      path: excludePaths,
    },
    onlyReachable: paths.map((path) => `^${path}`).join('|'),
    includeOnly: ['^node_modules', ...paths.map((path) => `^${path}`)],
    validate: true,
    collapse: collapseRules.join('|'),
  });

  return result;
};

export async function identifyDependencyUsageWithCruiser(
  paths: PathsToAnalyze,
  dependencyName: string | undefined,
  { groupBy, summary, collapseDepth, isVerbose }: DependencyGraphOptions
) {
  const result = await invokeDependencyCruiser(paths, dependencyName, {
    summary,
    collapseDepth,
  });

  if (typeof result.output === 'string') {
    throw new Error('Unexpected string output from cruise result');
  }

  console.log(
    `${chalk.green(`Successfully`)} built dependency graph using ${chalk.bold.magenta(
      'cruiser'
    )}. Analyzing...`
  );

  if (isVerbose) {
    const verboseLogPath = nodePath.join(process.cwd(), '.dependency-graph-log.json');

    fs.writeFile(verboseLogPath, JSON.stringify(result, null, 2), (err) => {
      if (err) {
        console.error(
          chalk.red(`Failed to save dependency graph log to ${verboseLogPath}: ${err.message}`)
        );
      } else {
        console.log(chalk.yellow(`Dependency graph log saved to ${verboseLogPath}`));
      }
    });
  }

  const { violations } = result.output.summary;

  if (groupBy === 'owner') {
    return groupFilesByOwners(violations);
  }

  if (groupBy === 'package') {
    return groupByPackage(violations);
  }

  if (dependencyName) {
    const dependencyRegex = new RegExp(`node_modules/${dependencyName}`);

    const dependentsList = result.output.modules.reduce<Record<string, string[]>>(
      (acc, { source, dependents }) => {
        if (!dependencyRegex.test(source)) {
          return acc;
        }

        const transformedDependencyName = source.split('/')[1];
        if (!acc[transformedDependencyName]) {
          acc[transformedDependencyName] = [];
        }

        acc[transformedDependencyName].push(...dependents);

        return acc;
      },
      {}
    );

    return {
      modules: [...new Set(violations.map(({ from }) => from))],
      ...(!summary && { dependents: dependentsList }),
    };
  }

  return groupBySource(violations);
}
