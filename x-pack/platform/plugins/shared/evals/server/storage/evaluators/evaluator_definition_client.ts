/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { InternalIStorageClient, StorageIndexAdapter } from '@kbn/storage-adapter';
import { isResponseError } from '@kbn/es-errors';
import { isEqual } from 'lodash';
import type { Logger } from '@kbn/logging';
import semverCompare from 'semver/functions/compare';
import semverInc from 'semver/functions/inc';
import {
  MAX_EVALUATOR_NAME_LENGTH,
  buildSpaceFilter,
  getEvaluatorDefinitionId,
} from '@kbn/evals-common';
import type {
  EvaluatorDefinitionDocument,
  LlmJudgeConfig,
} from '../../evaluators/user_defined/types';
import { validateJudgeConfig } from '../../evaluators/user_defined/validate_config';
import { EvaluatorAlreadyExistsError } from './evaluator_already_exists_error';
import { BuiltInEvaluatorNameError } from './built_in_evaluator_name_error';
import { EvaluatorNotFoundError } from './evaluator_not_found_error';
import { InvalidEvaluatorNameError } from './invalid_evaluator_name_error';
import type { EvaluatorStorageProperties, evaluatorsStorageSettings } from './evaluators_storage';

type EvaluatorStorageDocument = EvaluatorStorageProperties & { _id?: string };

/**
 * Compares two judge configs by meaning rather than representation, so a definition written
 * through the API and one round-tripped through a form agree. `evidence` and
 * `reference_data_keys` are sets the evaluator is given, so neither order nor an omitted
 * empty list distinguishes them. Score order is left alone: it is the order a reader sees.
 */
const isSameJudge = (a: LlmJudgeConfig, b: LlmJudgeConfig): boolean => {
  const normalize = (judge: LlmJudgeConfig) => ({
    ...judge,
    evidence: [...judge.evidence].sort(),
    reference_data_keys: [...(judge.reference_data_keys ?? [])].sort(),
    output: {
      ...judge.output,
      // Order is kept: it is the order a reader sees. Only a blank description is
      // normalized, since the form omits one and the API accepts an empty string.
      scores: judge.output.scores.map(({ description, ...score }) => ({
        ...score,
        ...(description?.trim() ? { description: description.trim() } : {}),
      })),
    },
  });

  return isEqual(normalize(a), normalize(b));
};

export type EvaluatorsStorageAdapter = StorageIndexAdapter<
  typeof evaluatorsStorageSettings,
  EvaluatorStorageDocument
>;

export interface CreateEvaluatorDefinitionInput {
  name: string;
  description: string;
  judge: LlmJudgeConfig;
  createdBy?: string;
}

/** Fields a new version may change. The name identifies the evaluator, so it cannot. */
export interface UpdateEvaluatorDefinitionInput {
  description?: string;
  judge?: LlmJudgeConfig;
  createdBy?: string;
}

export interface EvaluatorDefinitionDeleteResult {
  deleted: number;
}

const INITIAL_VERSION = '1.0.0';

/** Maximum writes attempted when concurrent updates take the same version. */
const UPDATE_MAX_ATTEMPTS = 5;

const EVALUATOR_DEFINITIONS_PAGE_SIZE = 500;

/** How many versions of one name a listing or delete covers. */
const MAX_EVALUATOR_VERSIONS = 500;

/** Prevents a delete from running forever while concurrent updates keep adding versions. */
const DELETE_MAX_BATCHES = 100;

/**
 * How many of a name's most recent documents the aggregation carries back for
 * semver to choose between. More than one because two versions written in the
 * same millisecond cannot be ordered by timestamp.
 */
const LATEST_VERSION_CANDIDATES = 5;

const getTimestampAfter = (previousTimestamp: string): string => {
  const previous = Date.parse(previousTimestamp);
  return new Date(Math.max(Date.now(), Number.isNaN(previous) ? 0 : previous + 1)).toISOString();
};

/**
 * Names are lowercase so a lookup can't miss on case, and cannot open with an
 * underscore so they never collide with the `_validate` action path.
 */
const EVALUATOR_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/;

export const assertValidEvaluatorName = (name: string): void => {
  if (name.length < 2) {
    throw new InvalidEvaluatorNameError(name, 'must be at least 2 characters');
  }

  if (name.length > MAX_EVALUATOR_NAME_LENGTH) {
    throw new InvalidEvaluatorNameError(
      name,
      `must be at most ${MAX_EVALUATOR_NAME_LENGTH} characters`
    );
  }

  if (!EVALUATOR_NAME_PATTERN.test(name)) {
    throw new InvalidEvaluatorNameError(
      name,
      'must be lowercase alphanumeric, may contain "-" or "_" inside, and must start and end with a letter or digit'
    );
  }
};

interface LatestByNameAggregation {
  after_key?: Record<string, string>;
  buckets?: Array<{
    key: { name?: string };
    latest?: { hits?: { hits?: Array<{ _id?: string; _source?: EvaluatorStorageProperties }> } };
  }>;
}

/**
 * Reads and writes evaluator definitions in one space.
 *
 * Versions are immutable: an update writes a new document rather than replacing
 * the one it read, so a score naming `name@version` always resolves to the
 * definition that produced it. That also removes the read-modify-write datasets
 * need optimistic concurrency for — a derived id and `op_type: 'create'` are
 * enough to make two writers competing for one version resolve to one winner.
 */
export class EvaluatorDefinitionClient {
  private readonly storage: InternalIStorageClient<EvaluatorStorageDocument>;
  private readonly logger: Logger;
  private readonly spaceId: string;
  private readonly spaceFilter: QueryDslQueryContainer;
  private readonly isBuiltIn: (name: string) => boolean;

  constructor({
    storageAdapter,
    logger,
    spaceId,
    isBuiltIn,
  }: {
    storageAdapter: EvaluatorsStorageAdapter;
    logger: Logger;
    spaceId: string;
    isBuiltIn: (name: string) => boolean;
  }) {
    this.storage = storageAdapter.getClient();
    this.logger = logger;
    this.spaceId = spaceId;
    this.spaceFilter = buildSpaceFilter(spaceId);
    this.isBuiltIn = isBuiltIn;
  }

  private scoped(query: QueryDslQueryContainer): QueryDslQueryContainer {
    return { bool: { must: [query], filter: [this.spaceFilter] } };
  }

  async create({
    name,
    description,
    judge,
    createdBy,
  }: CreateEvaluatorDefinitionInput): Promise<EvaluatorDefinitionDocument> {
    assertValidEvaluatorName(name);

    if (this.isBuiltIn(name)) {
      throw new BuiltInEvaluatorNameError(name);
    }
    validateJudgeConfig(judge);

    if (await this.getLatest(name)) {
      throw new EvaluatorAlreadyExistsError(name);
    }

    const timestamp = new Date().toISOString();
    const document: EvaluatorStorageProperties = {
      name,
      version: INITIAL_VERSION,
      kind: 'llm',
      description,
      judge,
      space_ids: [this.spaceId],
      created_at: timestamp,
      updated_at: timestamp,
      ...(createdBy ? { created_by: createdBy } : {}),
    };

    const id = getEvaluatorDefinitionId(this.spaceId, name, INITIAL_VERSION);

    try {
      await this.storage.index({ id, op_type: 'create', document, refresh: true });
    } catch (error) {
      // Another create of the same name reached the same derived id first.
      if (isConflict(error)) {
        throw new EvaluatorAlreadyExistsError(name);
      }
      throw error;
    }

    return toDefinition(id, document);
  }

  /**
   * Writes the next version of a definition. The caller's fields are layered
   * over the latest version, so an update that only changes the description
   * carries the judge config forward unchanged. An update that changes nothing
   * returns the current version instead of writing a duplicate of it.
   */
  async update(
    name: string,
    { description, judge, createdBy }: UpdateEvaluatorDefinitionInput
  ): Promise<EvaluatorDefinitionDocument> {
    if (this.isBuiltIn(name)) {
      throw new BuiltInEvaluatorNameError(name);
    }
    if (judge) {
      validateJudgeConfig(judge);
    }

    for (let attempt = 1; attempt <= UPDATE_MAX_ATTEMPTS; attempt++) {
      const current = await this.getLatest(name);
      if (!current) {
        throw new EvaluatorNotFoundError(name);
      }

      const nextDescription = description ?? current.description;
      const nextJudge = judge ?? current.judge;

      // Saving without changing anything would otherwise mint a version identical to the one
      // below it, inflating a history `listVersions` caps and making `name@version` ambiguous
      // about which edit it represents.
      if (nextDescription === current.description && isSameJudge(nextJudge, current.judge)) {
        return current;
      }

      const nextVersion = semverInc(current.version, 'minor');
      if (!nextVersion) {
        throw new Error(
          `Cannot derive the next version of evaluator "${name}" from "${current.version}"`
        );
      }

      const timestamp = getTimestampAfter(current.updated_at);
      const document: EvaluatorStorageProperties = {
        name,
        version: nextVersion,
        kind: 'llm',
        description: nextDescription,
        judge: nextJudge,
        space_ids: [this.spaceId],
        created_at: timestamp,
        updated_at: timestamp,
        ...(createdBy ?? current.created_by ? { created_by: createdBy ?? current.created_by } : {}),
      };

      const id = getEvaluatorDefinitionId(this.spaceId, name, nextVersion);

      try {
        await this.storage.index({ id, op_type: 'create', document, refresh: true });
        return toDefinition(id, document);
      } catch (error) {
        if (!isConflict(error)) {
          throw error;
        }

        this.logger.debug(
          `Version ${nextVersion} of evaluator "${name}" was taken by a concurrent update; retrying (attempt ${attempt})`
        );
      }
    }

    throw new Error(
      `Could not write a new version of evaluator "${name}" after ${UPDATE_MAX_ATTEMPTS} attempts`
    );
  }

  async getLatest(name: string): Promise<EvaluatorDefinitionDocument | undefined> {
    const response = await this.storage.search({
      track_total_hits: false,
      size: LATEST_VERSION_CANDIDATES,
      query: this.scoped({ term: { name } }),
      sort: [{ created_at: { order: 'desc' } }],
    });

    return response.hits.hits
      .flatMap((hit) => (hit._source && hit._id ? [toDefinition(hit._id, hit._source)] : []))
      .sort((a, b) => compareVersionsDescending(a.version, b.version))[0];
  }

  async getVersion(
    name: string,
    version: string
  ): Promise<EvaluatorDefinitionDocument | undefined> {
    const response = await this.storage.search({
      track_total_hits: false,
      size: 1,
      query: this.scoped({
        bool: { must: [{ term: { name } }, { term: { version } }] },
      }),
    });

    const [hit] = response.hits.hits;
    return hit?._source && hit._id ? toDefinition(hit._id, hit._source) : undefined;
  }

  /** Up to 500 versions of one name, newest first. */
  async listVersions(name: string): Promise<EvaluatorDefinitionDocument[]> {
    const response = await this.storage.search({
      track_total_hits: false,
      size: MAX_EVALUATOR_VERSIONS,
      query: this.scoped({ term: { name } }),
      sort: [{ created_at: { order: 'desc' } }],
    });

    return response.hits.hits
      .filter(
        (hit): hit is typeof hit & { _source: EvaluatorStorageProperties; _id: string } =>
          hit._source !== undefined && hit._id !== undefined
      )
      .map((hit) => toDefinition(hit._id, hit._source))
      .sort((a, b) => compareVersionsDescending(a.version, b.version));
  }

  /** Returns the latest version of every definition in the space. */
  async listLatest(): Promise<EvaluatorDefinitionDocument[]> {
    const definitions: EvaluatorDefinitionDocument[] = [];
    let after: Record<string, string> | undefined;

    do {
      const response = await this.storage.search({
        track_total_hits: false,
        size: 0,
        query: this.scoped({ match_all: {} }),
        aggs: {
          by_name: {
            composite: {
              size: EVALUATOR_DEFINITIONS_PAGE_SIZE,
              sources: [{ name: { terms: { field: 'name' } } }],
              ...(after ? { after } : {}),
            },
            aggs: {
              latest: {
                top_hits: {
                  size: LATEST_VERSION_CANDIDATES,
                  sort: [{ created_at: { order: 'desc' } }],
                },
              },
            },
          },
        },
      });

      const aggregation = response.aggregations?.by_name as LatestByNameAggregation | undefined;
      for (const bucket of aggregation?.buckets ?? []) {
        const candidates = (bucket.latest?.hits?.hits ?? [])
          .filter(
            (hit): hit is { _id: string; _source: EvaluatorStorageProperties } =>
              hit._id !== undefined && hit._source !== undefined
          )
          .map((hit) => toDefinition(hit._id, hit._source))
          .sort((a, b) => compareVersionsDescending(a.version, b.version));

        if (candidates[0]) {
          definitions.push(candidates[0]);
        }
      }
      after = aggregation?.after_key;
    } while (after);

    return definitions.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Removes a definition, or one version of it. Deleting a name removes its
   * history too: a version left behind would still resolve through
   * `name@version` and quietly outlive the delete.
   */
  async delete(
    name: string,
    { version }: { version?: string } = {}
  ): Promise<EvaluatorDefinitionDeleteResult> {
    if (this.isBuiltIn(name)) {
      throw new BuiltInEvaluatorNameError(name);
    }

    if (version) {
      const found = await this.getVersion(name, version);
      return found ? this.deleteBatch(name, [found]) : { deleted: 0 };
    }

    let deleted = 0;
    for (let batch = 1; batch <= DELETE_MAX_BATCHES; batch++) {
      const targets = await this.listVersions(name);
      if (targets.length === 0) {
        return { deleted };
      }

      const result = await this.deleteBatch(name, targets);
      deleted += result.deleted;
    }

    throw new Error(
      `Could not finish deleting evaluator "${name}" after ${DELETE_MAX_BATCHES} batches because versions kept appearing`
    );
  }

  private async deleteBatch(
    name: string,
    targets: EvaluatorDefinitionDocument[]
  ): Promise<EvaluatorDefinitionDeleteResult> {
    const response = await this.storage.bulk({
      operations: targets.map((target) => ({ delete: { _id: target.id } })),
      refresh: true,
    });

    if (response.errors) {
      const [failure] = response.items
        .map((item) => item.delete?.error)
        .filter((error): error is NonNullable<typeof error> => Boolean(error));

      throw new Error(
        `Failed to delete evaluator "${name}": ${failure?.reason ?? 'unknown bulk error'}`
      );
    }

    return {
      deleted: response.items.filter((item) => item.delete?.result === 'deleted').length,
    };
  }
}

const compareVersionsDescending = (a: string, b: string): number => {
  try {
    return semverCompare(b, a);
  } catch {
    // A version that isn't semver can only have been written by hand; order it
    // consistently rather than failing the read it appears in.
    return b.localeCompare(a);
  }
};

const toDefinition = (
  id: string,
  source: EvaluatorStorageProperties
): EvaluatorDefinitionDocument => ({
  id,
  name: source.name,
  version: source.version,
  kind: source.kind,
  description: source.description,
  judge: source.judge,
  created_at: source.created_at,
  updated_at: source.updated_at,
  ...(source.created_by ? { created_by: source.created_by } : {}),
});

const isConflict = (error: unknown): boolean => isResponseError(error) && error.statusCode === 409;
