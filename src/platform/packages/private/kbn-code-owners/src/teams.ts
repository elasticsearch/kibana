/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@kbn/repo-info';
import { Jsonc } from '@kbn/repo-packages';
import type { CodeOwnerArea } from './code_owner_areas';

/** Path to the canonical public team registry. */
export const TEAMS_FILE = path.join(
  REPO_ROOT,
  'src/platform/packages/private/kbn-code-owners/teams.jsonc'
);

/**
 * Public identity of a Kibana contributing team.
 *
 * This is the public-only view of a team.
 */
export interface Team {
  /** Stable, unique identifier used to join with private team overlays. */
  id: string;
  /** Human-readable team name. */
  name: string;
  /**
   * Kibana solution/area(s) this team belongs to, when applicable.
   *
   * A team can belong to more than one area).
   */
  areas?: readonly CodeOwnerArea[];
  /** Optional longer description of the team. */
  description?: string;
  github: {
    /** GitHub team handle, e.g. `elastic/kibana-core`. */
    team?: string;
    /** GitHub issue label used to route work to this team. */
    label?: string;
  };
  /** Free-form list of areas this team is responsible for. */
  responsibilities?: readonly string[];
}

let cachedTeams: readonly Team[] | undefined;

const isTeam = (value: unknown): value is Team => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.github === 'object' &&
    candidate.github !== null
  );
};

const assertValid = (teams: unknown): readonly Team[] => {
  if (!Array.isArray(teams)) {
    throw new Error(`Expected ${TEAMS_FILE} to contain an array of teams`);
  }

  for (const team of teams) {
    if (!isTeam(team)) {
      throw new Error(
        `Invalid team entry in ${TEAMS_FILE}: each team requires "id", "name" and "github". Received: ${JSON.stringify(
          team
        )}`
      );
    }
  }

  return teams;
};

/**
 * Get the full list of teams from the public registry.
 *
 * The registry is read from disk once and memoized.
 */
export function getTeams(): readonly Team[] {
  if (cachedTeams === undefined) {
    const contents = fs.readFileSync(TEAMS_FILE, { encoding: 'utf8' });
    cachedTeams = assertValid(Jsonc.parse(contents));
  }

  return cachedTeams;
}

/**
 * Find a team by its unique {@link Team.id}.
 *
 * @param id Team id to look up
 * @returns The matching team, or `undefined` if no team has the given id
 */
export function getTeamById(id: string): Team | undefined {
  return getTeams().find((team) => team.id === id);
}

/**
 * Find a team by its GitHub team handle.
 *
 * A leading `@` is ignored, so both `@elastic/kibana-core` and
 * `elastic/kibana-core` resolve to the same team.
 *
 * @param handle GitHub team handle to look up
 * @returns The matching team, or `undefined` if no team has the given handle
 */
export function getTeamByGithubHandle(handle: string): Team | undefined {
  const normalizedHandle = handle.startsWith('@') ? handle.slice(1) : handle;
  return getTeams().find((team) => team.github.team === normalizedHandle);
}
