/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const EpmPackagesSchemaV6 = schema.object({
  name: schema.string(),
  version: schema.string(),
  internal: schema.maybe(schema.boolean()),
  keep_policies_up_to_date: schema.maybe(schema.boolean()),
  es_index_patterns: schema.maybe(schema.any()),
  verification_status: schema.string(),
  verification_key_id: schema.maybe(schema.string()),
  installed_es: schema.maybe(
    schema.arrayOf(
      schema.object({
        id: schema.string(),
        type: schema.string(),
        version: schema.maybe(schema.string()),
        deferred: schema.maybe(schema.boolean()),
      }),
      { maxSize: 10000 }
    )
  ),
  latest_install_failed_attempts: schema.maybe(schema.any()),
  latest_executed_state: schema.maybe(schema.any()),
  installed_kibana: schema.maybe(schema.any()),
  installed_kibana_space_id: schema.maybe(schema.string()),
  package_assets: schema.maybe(schema.any()),
  additional_spaces_installed_kibana: schema.maybe(schema.any()),
  install_started_at: schema.string(),
  install_version: schema.string(),
  install_status: schema.string(),
  install_source: schema.string(),
  install_format_schema_version: schema.maybe(schema.string()),
  experimental_data_stream_features: schema.maybe(
    schema.arrayOf(
      schema.object({
        data_stream: schema.string(),
        features: schema.maybe(
          schema.arrayOf(
            schema.object(
              {
                synthetic_source: schema.maybe(schema.boolean()),
                tsdb: schema.maybe(schema.boolean()),
              },
              { unknowns: 'ignore' }
            ),
            { maxSize: 10 }
          )
        ),
      }),
      { maxSize: 1000 }
    )
  ),
  previous_version: schema.maybe(schema.string()),
  pending_upgrade_review: schema.maybe(schema.any()),
});

export const EpmPackagesSchemaV7 = EpmPackagesSchemaV6.extends({
  dependencies: schema.maybe(
    schema.arrayOf(
      schema.object({
        name: schema.string(),
        version: schema.string(),
      }),
      { maxSize: 1000 }
    )
  ),
});

export const EpmPackagesSchemaV8 = EpmPackagesSchemaV7.extends({
  is_dependency_of: schema.maybe(
    schema.arrayOf(
      schema.object({
        name: schema.string(),
        version: schema.string(),
      }),
      { maxSize: 1000 }
    )
  ),
  installed_as_dependency: schema.maybe(schema.boolean()),
});

export const EpmPackagesSchemaV9 = EpmPackagesSchemaV8.extends({
  namespace_customization_enabled_for: schema.maybe(
    schema.arrayOf(schema.string(), { maxSize: 100 })
  ),
  previous_dependency_versions: schema.maybe(
    schema.nullable(
      schema.arrayOf(
        schema.object({
          name: schema.string(),
          previousVersion: schema.nullable(schema.string()),
        }),
        { maxSize: 1000 }
      )
    )
  ),
});

export const EpmPackagesSchemaV10 = EpmPackagesSchemaV9.extends({
  installed_es: schema.maybe(
    schema.arrayOf(
      schema.object({
        id: schema.string(),
        type: schema.string(),
        version: schema.maybe(schema.string()),
        deferred: schema.maybe(schema.boolean()),
        customDataStreamOriginDataset: schema.maybe(schema.string()),
        customDataStreamOriginType: schema.maybe(schema.string()),
      }),
      { maxSize: 10000 }
    )
  ),
});

export const EpmPackagesSchemaV11 = EpmPackagesSchemaV10.extends({
  namespace_customization_settings: schema.maybe(
    schema.recordOf(
      schema.string(),
      schema.object({
        ilm_policy: schema.maybe(schema.string()),
      })
    )
  ),
});
