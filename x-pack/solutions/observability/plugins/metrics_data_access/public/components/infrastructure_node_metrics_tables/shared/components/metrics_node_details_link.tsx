/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { parse } from '@kbn/datemath';
import { EuiLink } from '@elastic/eui';
import { esql, type ComposerQuery } from '@elastic/esql';
import type { InventoryItemType } from '../../../../../common/inventory_models/types';
import { useKibanaContextForPlugin } from '../../../../hooks/use_kibana';
import { useAssetDetailsRedirect } from '../../../../pages/link_to/use_asset_details_redirect';

const DISCOVER_APP_LOCATOR_ID = 'DISCOVER_APP_LOCATOR';

/** Fallback index pattern when infrastructure metric indices are not available. */
const DEFAULT_METRICS_INDEX = 'metrics-*';

type ExtractStrict<T, U extends T> = Extract<T, U>;
export type NodeTypeForLink = ExtractStrict<InventoryItemType, 'host' | 'container' | 'pod'>;

interface CompareMetricNodesLinkProps {
  ids: string[];
  nodeType: NodeTypeForLink;
  timerange: { from: string; to: string };
  metricsIndices?: string;
}

interface MetricsNodeDetailsLinkProps {
  id: string;
  label: string;
  nodeType: NodeTypeForLink;
  timerange: { from: string; to: string };
  isOtel?: boolean;
  /** Infrastructure/metrics index pattern from settings; used for Discover ES|QL when isOtel is true. */
  metricsIndices?: string;
}

function getDiscoverBreakdownForNodeType(nodeType: NodeTypeForLink): string {
  switch (nodeType) {
    case 'container':
      return 'resource.attributes.container.id';
    case 'pod':
      return 'resource.attributes.k8s.pod.name';
    case 'host':
      return 'resource.attributes.host.name';
    default:
      return '';
  }
}

function getDiscoverEsqlQueryForNodeComparison(
  nodeType: NodeTypeForLink,
  ids: string[],
  indexPattern: string
): ComposerQuery {
  const from = indexPattern || DEFAULT_METRICS_INDEX;
  const idLiterals = ids.map((id) => esql.str(id));

  switch (nodeType) {
    case 'container':
      return esql`TS ${from} | WHERE container.id IN (${idLiterals})`;
    case 'pod':
      return esql`TS ${from} | WHERE k8s.pod.name IN (${idLiterals})`;
    default:
      return esql`TS ${from} | WHERE host.name IN (${idLiterals})`;
  }
}

export const CompareMetricNodesLink = ({
  ids,
  nodeType,
  timerange,
  metricsIndices,
}: CompareMetricNodesLinkProps) => {
  const { share } = useKibanaContextForPlugin().services;

  return useMemo(() => {
    const discoverLocator = share?.url?.locators?.get(DISCOVER_APP_LOCATOR_ID);
    const esqlQuery = getDiscoverEsqlQueryForNodeComparison(
      nodeType,
      ids,
      metricsIndices ?? DEFAULT_METRICS_INDEX
    );
    const discoverParams = {
      timeRange: { from: timerange.from, to: timerange.to },
      breakdownField: getDiscoverBreakdownForNodeType(nodeType),
      query: {
        esql: esqlQuery.toRequest().query,
      },
    };
    const href = discoverLocator?.getRedirectUrl(discoverParams) ?? '#';
    return {
      href,
      onClick: (e: React.MouseEvent) => {
        if (discoverLocator) {
          e.preventDefault();
          discoverLocator.navigate(discoverParams);
        }
      },
    };
  }, [ids, nodeType, metricsIndices, timerange, share?.url?.locators]);
};

/** Build an ES|QL query that filters by the given node type and entity id. */
function getDiscoverEsqlQueryForNode(
  nodeType: NodeTypeForLink,
  entityId: string,
  indexPattern: string
): ComposerQuery {
  const from = indexPattern || DEFAULT_METRICS_INDEX;
  switch (nodeType) {
    case 'container':
      return esql`TS ${from} | WHERE container.id == ${entityId}`;
    case 'pod':
      return esql`TS ${from} | WHERE k8s.pod.uid == ${entityId}`;
    default:
      return esql`TS ${from}`;
  }
}

export const MetricsNodeDetailsLink = ({
  id,
  label,
  nodeType,
  timerange,
  isOtel,
  metricsIndices,
}: MetricsNodeDetailsLinkProps) => {
  const { share } = useKibanaContextForPlugin().services;
  const { getAssetDetailUrl } = useAssetDetailsRedirect();

  const redirectToDiscover = isOtel && nodeType !== 'host';

  const linkProps = useMemo(() => {
    if (redirectToDiscover) {
      const discoverLocator = share?.url?.locators?.get(DISCOVER_APP_LOCATOR_ID);
      const esqlQuery = getDiscoverEsqlQueryForNode(
        nodeType,
        id,
        metricsIndices ?? DEFAULT_METRICS_INDEX
      );
      const discoverParams = {
        timeRange: { from: timerange.from, to: timerange.to },
        query: {
          esql: esqlQuery.toRequest().query,
        },
      };
      const href = discoverLocator?.getRedirectUrl(discoverParams) ?? '#';
      return {
        href,
        onClick: (e: React.MouseEvent) => {
          if (discoverLocator) {
            e.preventDefault();
            discoverLocator.navigate(discoverParams);
          }
        },
      };
    }

    const assetDetails = getAssetDetailUrl({
      entityType: nodeType,
      entityId: id,
      search: {
        name: label,
        from: parse(timerange.from)?.valueOf(),
        to: parse(timerange.to)?.valueOf(),
      },
      preferredSchema: isOtel ? 'semconv' : 'ecs',
    });
    return { href: assetDetails.href, onClick: assetDetails.onClick };
  }, [
    redirectToDiscover,
    share?.url?.locators,
    timerange.from,
    timerange.to,
    nodeType,
    id,
    label,
    isOtel,
    metricsIndices,
    getAssetDetailUrl,
  ]);

  return (
    <EuiLink
      data-test-subj="infraMetricsNodeDetailsLinkLink"
      href={linkProps.href}
      onClick={linkProps.onClick}
    >
      {label}
    </EuiLink>
  );
};
