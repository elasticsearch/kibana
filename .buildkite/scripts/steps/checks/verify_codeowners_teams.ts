/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as acorn from 'acorn';

const KIBANA_OPS_REPO = 'elastic/kibana-operations';
const TEAMS_FILE_PATH = 'triage/teams.js';
const CODEOWNERS_PATH = resolve(__dirname, '../../../../.github/CODEOWNERS');

/**
 * Teams that are valid GitHub teams used in CODEOWNERS but are not tracked.
 */
const KNOWN_VALID_TEAMS = new Set([
  'elastic/apm-ui',
  'elastic/cloud-services',
  'elastic/contextual-security',
  'elastic/docs',
  'elastic/eui',
  'elastic/eui-team',
  'elastic/experience-docs',
  'elastic/jinastic',
  'elastic/kibana-accessibility',
  'elastic/kibana-performance-testing',
  'elastic/kibana-tech-leads',
  'elastic/kibana-telemetry',
  'elastic/kibana-visualization',
  'elastic/obs-cloudnative-monitoring',
  'elastic/obs-sig-events-team',
  'elastic/obs-ux-management-team',
  'elastic/observability-bi',
  'elastic/observability-design',
  'elastic/observability-ui',
  'elastic/observablt-robots',
  'elastic/platform-docs',
  'elastic/search-design',
  'elastic/search-inference-team',
  'elastic/security-design',
  'elastic/security-detection-platform',
  'elastic/security-engineering-productivity',
  'elastic/security-genai-research-and-development',
  'elastic/security-ml',
  'elastic/security-pds-deployment',
  'elastic/ski-docs',
]);

function extractValue(node: acorn.Expression): unknown {
  if (!node) return undefined;

  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'ArrayExpression':
      return node.elements.map((el) => (el ? extractValue(el as acorn.Expression) : undefined));
    case 'ObjectExpression': {
      const obj: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (prop.type === 'Property') {
          const key =
            prop.key.type === 'Identifier'
              ? prop.key.name
              : extractValue(prop.key as acorn.Expression);
          obj[key as string] = extractValue(prop.value as acorn.Expression);
        }
      }
      return obj;
    }
    case 'Identifier':
      return node.name === 'undefined' ? undefined : node.name;
    default:
      return undefined;
  }
}

/**
 * Parse teams.js content and extract all github.team values.
 */
function extractGithubTeamsFromJs(content: string): Set<string> {
  const ast = acorn.parse(content, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });

  let teamsArray: Array<acorn.Expression | acorn.SpreadElement | null> | null = null;

  for (const node of ast.body) {
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        if (
          declaration.id?.type === 'Identifier' &&
          declaration.id.name === 'teams' &&
          declaration.init?.type === 'ArrayExpression'
        ) {
          teamsArray = declaration.init.elements;
          break;
        }
      }
    }
    if (teamsArray) break;
  }

  if (!teamsArray) {
    throw new Error('Could not find teams array in teams.js content');
  }

  const githubTeams = new Set<string>();

  for (const element of teamsArray) {
    if (element?.type !== 'ObjectExpression') continue;

    const teamObj = extractValue(element) as Record<string, unknown>;
    const github = teamObj?.github as Record<string, unknown> | undefined;
    const team = github?.team as string | undefined;

    if (team) {
      githubTeams.add(team);
    }
  }

  return githubTeams;
}

/**
 * Fetch teams.js from the kibana-operations repo via `gh api`.
 */
function fetchTeamsFile(): string {
  const cmd = `gh api repos/${KIBANA_OPS_REPO}/contents/${TEAMS_FILE_PATH} --jq .content`;

  const base64Content = execSync(cmd, { encoding: 'utf-8' }).trim();
  return Buffer.from(base64Content, 'base64').toString('utf-8');
}

/**
 * Extract all @elastic/<team> references from CODEOWNERS.
 */
function extractCodeownersTeams(): Set<string> {
  const content = readFileSync(CODEOWNERS_PATH, 'utf-8');
  const teams = new Set<string>();
  const teamPattern = /@(elastic\/[\w-]+)/g;

  let match: RegExpExecArray | null;
  while ((match = teamPattern.exec(content)) !== null) {
    teams.add(match[1]);
  }

  // Exclude the bot account used for backport branch overrides
  teams.delete('elastic/kibanamachine');

  return teams;
}

async function main(): Promise<void> {
  console.log('Fetching teams.js from elastic/kibana-operations...');

  let teamsJsContent: string;
  try {
    teamsJsContent = fetchTeamsFile();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `WARNING: Could not fetch teams.js from GitHub, skipping team validation: ${message}`
    );
    process.exit(0);
  }

  console.log('Parsing teams from teams.js...');
  const teamsJsTeams = extractGithubTeamsFromJs(teamsJsContent);
  console.log(`Found ${teamsJsTeams.size} teams in teams.js`);

  console.log('Extracting teams from CODEOWNERS...');
  const codeownersTeams = extractCodeownersTeams();
  console.log(`Found ${codeownersTeams.size} unique teams in CODEOWNERS`);

  const invalidTeams: string[] = [];

  for (const team of codeownersTeams) {
    if (!teamsJsTeams.has(team) && !KNOWN_VALID_TEAMS.has(team)) {
      invalidTeams.push(team);
    }
  }

  if (invalidTeams.length > 0) {
    console.error('\nERROR: The following teams in CODEOWNERS are not recognized:');
    console.error('They are not present in kibana-operations/triage/teams.js');
    console.error('and are not in the known-valid allowlist.\n');
    for (const team of invalidTeams.sort()) {
      console.error(`  - ${team}`);
    }
    console.error(
      '\nTo fix: either add the team to teams.js in elastic/kibana-operations,\n' +
        'or add it to KNOWN_VALID_TEAMS in verify_codeowners_teams.ts\n' +
        '(requires approval from @elastic/kibana-security).\n'
    );
    process.exit(1);
  }

  console.log('All CODEOWNERS teams are valid.');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
