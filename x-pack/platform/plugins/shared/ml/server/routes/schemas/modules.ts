/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const setupModuleBodySchema = schema.object({
  prefix: schema.maybe(
    schema.string({
      maxLength: 10000,
      meta: {
        description:
          'Job ID prefix. This will be added to the start of the ID every job created by the module (optional).',
      },
    })
  ),
  groups: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), {
      maxSize: 10000,
      meta: {
        description:
          'List of group IDs. This will override the groups assigned to each job created by the module (optional).',
      },
    })
  ),
  indexPatternName: schema.maybe(
    schema.string({
      maxLength: 10000,
      meta: {
        description: `Name of kibana index pattern. Overrides the index used in each datafeed and each index pattern used in the custom urls and saved objects created by the module. A matching index pattern must exist in kibana if the module contains custom urls or saved objects which rely on an index pattern ID. If the module does not contain custom urls or saved objects which require an index pattern ID, the indexPatternName can be any index name or pattern that will match an ES index. It can also be a comma separated list of names. If no indexPatternName is supplied, the default index pattern specified in the manifest.json will be used (optional).`,
      },
    })
  ),
  query: schema.maybe(
    schema.any({
      meta: {
        description:
          'ES Query DSL object. Overrides the query object for each datafeed created by the module (optional).',
      },
    })
  ),
  useDedicatedIndex: schema.maybe(
    schema.boolean({
      meta: {
        description:
          'Flag to specify that each job created by the module uses a dedicated index (optional).',
      },
    })
  ),
  startDatafeed: schema.maybe(
    schema.boolean({
      meta: {
        description:
          'Flag to specify that each datafeed created by the module is started once saved. Defaults to <code>false</code> (optional).',
      },
    })
  ),
  start: schema.maybe(
    schema.number({
      meta: {
        description:
          'Start date for datafeed. Specified in epoch seconds. Only used if startDatafeed is true. If not specified, a value of 0 is used i.e. start at the beginning of the data (optional).',
      },
    })
  ),
  end: schema.maybe(
    schema.number({
      meta: {
        description: `End date for datafeed. Specified in epoch seconds. Only used if startDatafeed is true. If not specified, the datafeed will continue to run in real time (optional).`,
      },
    })
  ),
  jobOverrides: schema.maybe(
    schema.any({
      meta: {
        description:
          'Partial job configuration which will override jobs contained in the module. Can be an array of objects. If a <code>job_id</code> is specified, only that job in the module will be overridden. Applied before any of the existing overridable options (e.g. useDedicatedIndex, groups, indexPatternName etc) and so can be overridden themselves (optional).',
      },
    })
  ),
  datafeedOverrides: schema.maybe(
    schema.any({
      meta: {
        description:
          'Partial datafeed configuration which will override datafeeds contained in the module. Can be an array of objects. If a datafeed_id or a job_id is specified, only that datafeed in the module will be overridden. Applied before any of the existing overridable options (e.g. useDedicatedIndex, groups, indexPatternName etc) and so can be overridden themselves (optional).',
      },
    })
  ),
  estimateModelMemory: schema.maybe(
    schema.boolean({
      meta: {
        description:
          'Indicates whether an estimate of the model memory limit should be made by checking the cardinality of fields in the job configurations (optional).',
      },
    })
  ),
  applyToAllSpaces: schema.maybe(
    schema.boolean({ meta: { description: 'Add each job created to the * space (optional)' } })
  ),
});

export const optionalModuleIdParamSchema = schema.object({
  moduleId: schema.maybe(
    schema.string({ maxLength: 10000, meta: { description: 'ID of the module' } })
  ),
});

export const moduleIdParamSchema = schema.object({
  moduleId: schema.string({ maxLength: 10000, meta: { description: 'ID of the module' } }),
});

export const optionalSizeQuerySchema = schema.object({
  size: schema.maybe(schema.number({ meta: { description: 'How many results to return' } })),
});

export const recognizeModulesSchema = schema.object({
  indexPatternTitle: schema.string({
    maxLength: 10000,
    meta: {
      description:
        'Index pattern to recognize. Note that this does not need to be a Kibana index pattern, and can be the name of a single Elasticsearch index, or include a wildcard (*) to match multiple indices.',
    },
  }),
});

export const moduleFilterSchema = schema.object({
  filter: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const recognizeModulesSchemaResponse = () =>
  schema.arrayOf(
    schema.object({
      id: schema.string({ maxLength: 10000 }),
      title: schema.string({ maxLength: 10000 }),
      query: schema.any(),
      description: schema.string({ maxLength: 10000 }),
      logo: schema.any(),
    }),
    { maxSize: 10000 }
  );

const moduleSchema = schema.object({
  id: schema.string({ maxLength: 10000 }),
  title: schema.string({ maxLength: 10000 }),
  description: schema.string({ maxLength: 10000 }),
  type: schema.string({ maxLength: 10000 }),
  logo: schema.maybe(schema.any()),
  logoFile: schema.maybe(schema.string({ maxLength: 10000 })),
  defaultIndexPattern: schema.maybe(schema.string({ maxLength: 10000 })),
  query: schema.maybe(schema.any()),
  jobs: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  datafeeds: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  kibana: schema.maybe(schema.any()),
  tags: schema.maybe(schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })),
});

export const getModulesSchemaResponse = () =>
  schema.oneOf([moduleSchema, schema.arrayOf(moduleSchema, { maxSize: 10000 })]);

/**
 *
 * @link DataRecognizerConfigResponse
 */
export const dataRecognizerConfigResponse = () =>
  schema.object({
    datafeeds: schema.arrayOf(schema.any(), { maxSize: 10000 }),
    jobs: schema.arrayOf(schema.any(), { maxSize: 10000 }),
    kibana: schema.maybe(schema.any()),
  });

export const jobExistsResponse = () =>
  schema.object({
    jobsExist: schema.boolean(),
    jobs: schema.maybe(
      schema.arrayOf(
        schema.object({
          id: schema.string({ maxLength: 10000 }),
          earliestTimestampMs: schema.number(),
          latestTimestampMs: schema.number(),
          latestResultsTimestampMs: schema.maybe(schema.number()),
        }),
        { maxSize: 10000 }
      )
    ),
  });
