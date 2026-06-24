/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import deepEqual from 'fast-deep-equal';
import type { LayerDescriptor } from '@kbn/maps-plugin/common';
import type { MapAttributes } from '@kbn/maps-plugin/server';
import type {
  MapAttachmentData,
  MapAttachmentMetadata,
  MapAttributesSnapshot,
} from '../../../../common/types/domain_zod/attachment/map/v2';
import type { UnifiedReferenceAttachmentViewProps } from '../../../client/attachment_framework/types';
import { useKibana } from '../../../common/lib/kibana';

type MapViewProps = UnifiedReferenceAttachmentViewProps<
  MapAttachmentMetadata,
  string,
  MapAttachmentData
>;

/**
 * Compile-time tripwire: if Maps drops or renames any of the snapshot fields
 * (or changes one to a type that isn't assignable to ours), this `Pick` fails
 * typecheck and forces us to sync `MapAttributesSnapshotSchema`. The snapshot
 * types are intentionally loose (e.g. `layers: unknown[]`) so renderer-side
 * shape evolution within an existing field is allowed.
 *
 * The key union is pinned by hand instead of `keyof MapAttributesSnapshot`
 * because the schema is `.loose()` — Zod adds an `[k: string]: unknown` index
 * signature to the inferred type which would collapse `keyof` to `string`.
 */
type MapSnapshotKey = 'title' | 'layers' | 'center' | 'zoom' | 'settings' | 'isLayerTOCOpen';

export type MapSnapshotMatchesMapAttributes = (
  attrs: Pick<MapAttributes, MapSnapshotKey>
) => Pick<MapAttributesSnapshot, MapSnapshotKey>;

const mapContainerStyle = {
  position: 'relative' as const,
  width: '100%',
  height: 400,
};

/**
 * Inline map embed. Module-level `import`s pull in `@kbn/maps-plugin/common`
 * for the `LayerDescriptor` type; the render path consumes `services.maps.Map`
 * from `@kbn/maps-plugin/public` via the kibana context. Kept under a
 * `React.lazy` boundary so the cost is deferred until a map attachment is
 * actually rendered.
 *
 * Caller (`getMapAttachmentViewObject`) only mounts this when `data` is
 * present; with the schema-level requirement `data.attributes` is then
 * guaranteed, so we destructure directly without a narrowing helper.
 */
const MapEmbedAttachmentImpl: React.FC<MapViewProps> = ({ data }) => {
  const {
    services: { maps },
  } = useKibana();

  if (!data || !maps) {
    return null;
  }
  const { attributes } = data;
  // `layers` is typed `unknown[]` in the schema (we forward verbatim to the
  // maps renderer); narrow to the renderer-expected `LayerDescriptor[]` here.
  const layerList = (attributes.layers ?? []) as LayerDescriptor[];
  const mapCenter =
    attributes.center && typeof attributes.zoom === 'number'
      ? { ...attributes.center, zoom: attributes.zoom }
      : undefined;

  return (
    <div style={mapContainerStyle} data-test-subj="cases-map-embed">
      <maps.Map
        layerList={layerList}
        mapCenter={mapCenter}
        mapSettings={attributes.settings}
        isLayerTOCOpen={attributes.isLayerTOCOpen}
        title={attributes.title}
        timeRange={data.timeRange}
        hideFilterActions
      />
    </div>
  );
};

MapEmbedAttachmentImpl.displayName = 'MapEmbedAttachment';

export const MapEmbedAttachment = React.memo(MapEmbedAttachmentImpl, (prev, next) =>
  deepEqual(prev.data, next.data)
);
