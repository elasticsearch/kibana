/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Streams } from '@kbn/streams-schema';
import { Streams as StreamsSchema, getParentId } from '@kbn/streams-schema';
import type { IndexManagementLocatorParams } from '@kbn/index-management-shared-types';
import { INDEX_MANAGEMENT_LOCATOR_ID } from '@kbn/index-management-shared-types';
import { useKibana } from '../../../../../../hooks/use_kibana';
import { useStreamsAppRouter } from '../../../../../../hooks/use_streams_app_router';

export interface InheritLink {
  href: string;
  label: string;
}

export interface InheritLinkLabels {
  classicIndexTemplate: string;
  wiredParentStream: string;
}

export const useInheritLink = (
  definition: Streams.ingest.all.GetResponse,
  labels: InheritLinkLabels
): InheritLink | undefined => {
  const {
    dependencies: {
      start: { share },
    },
  } = useKibana();
  const router = useStreamsAppRouter();

  const isClassic = StreamsSchema.ClassicStream.GetResponse.is(definition);
  const isWired = StreamsSchema.WiredStream.GetResponse.is(definition);

  const templateName = isClassic ? definition.elasticsearch_assets?.indexTemplate : undefined;

  const indexManagementLocator = share.url.locators.get<IndexManagementLocatorParams>(
    INDEX_MANAGEMENT_LOCATOR_ID
  );

  const [templateHref, setTemplateHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isClassic || !templateName || !indexManagementLocator) {
      setTemplateHref(undefined);
      return;
    }
    indexManagementLocator
      .getUrl({ page: 'index_template', indexTemplate: templateName })
      .then(setTemplateHref);
  }, [indexManagementLocator, isClassic, templateName]);

  return useMemo(() => {
    if (isClassic) {
      if (!templateName || !templateHref) return undefined;
      return { href: templateHref, label: labels.classicIndexTemplate };
    }

    if (isWired) {
      const parentId = getParentId(definition.stream.name);
      if (!parentId) return undefined;
      return {
        href: router.link('/{key}/management/{tab}', { path: { key: parentId, tab: 'lifecycle' } }),
        label: labels.wiredParentStream,
      };
    }

    return undefined;
  }, [
    definition,
    isClassic,
    isWired,
    labels.classicIndexTemplate,
    labels.wiredParentStream,
    router,
    templateHref,
    templateName,
  ]);
};
