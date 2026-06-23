/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useState } from 'react';
import { chunk } from 'lodash';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';

/**
 * Maximum number of field names sent in a single metadata request. The endpoint is a GET
 * that serializes `fieldNames` into the query string, so a large field list (e.g. a traces
 * data view with hundreds of fields) overflows the server's max URL/header size and fails
 * with a 400. We chunk the lookup to keep each query string small.
 */
const FIELD_NAMES_CHUNK_SIZE = 100;

/**
 * Resolves which field names in the given list are officially registered ECS fields.
 * Returns null while the check is in progress or when fieldsMetadata is not provided,
 * and a Set of ECS field names once resolved.
 *
 * Fields with a `short` description in the ECS registry are considered official ECS fields
 * and safe to emit as `data-ebt-detail` values. Fields not in the registry receive the
 * NON_ECS_FIELD_EBT_DETAIL sentinel to avoid leaking field names into telemetry.
 *
 * Note: the registry covers ECS-defined fields only. Standard fields from other schemas
 * (e.g. APM-specific `span.name`, OTel `k8s.pod.name`) are not ECS-registered and will
 * receive the sentinel even though they are well-known standard fields.
 *
 * @see https://github.com/elastic/kibana/blob/main/src/platform/plugins/shared/discover/public/ebt_manager/scoped_discover_ebt_manager.ts
 */
export function useEcsFieldNames(
  fieldNames: string[],
  fieldsMetadata: FieldsMetadataPublicStart | undefined
): Set<string> | null {
  const [ecsFieldNames, setEcsFieldNames] = useState<Set<string> | null>(null);

  useEffect(() => {
    setEcsFieldNames(null);
    if (!fieldsMetadata || fieldNames.length === 0) return;
    let cancelled = false;
    fieldsMetadata
      .getClient()
      .then((client) =>
        // Chunk to keep each GET query string under the server's URL/header size limit.
        // Each chunk resolves to its own matched names; a failing chunk contributes none
        // rather than failing the whole lookup.
        Promise.all(
          chunk(fieldNames, FIELD_NAMES_CHUNK_SIZE).map((fieldNamesChunk) =>
            client
              .find({ attributes: ['short'], fieldNames: fieldNamesChunk })
              .then(({ fields: ecsFields }) =>
                Object.entries(ecsFields)
                  .filter(([, def]) => Boolean(def?.short))
                  .map(([name]) => name)
              )
              .catch(() => [] as string[])
          )
        )
      )
      .then((chunkedNames) => {
        if (cancelled) return;
        setEcsFieldNames(new Set(chunkedNames.flat()));
      })
      .catch(() => {
        if (!cancelled) setEcsFieldNames(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [fieldNames, fieldsMetadata]);

  return ecsFieldNames;
}
