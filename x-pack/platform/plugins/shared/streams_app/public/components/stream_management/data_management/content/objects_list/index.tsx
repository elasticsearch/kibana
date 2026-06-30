/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import type {
  ContentPackEntry,
  ContentPackIncludedObjects,
  ContentPackStream,
} from '@kbn/content-packs-schema';
import { ROOT_STREAM_ID } from '@kbn/content-packs-schema';
import { getSegments, isChildOf } from '@kbn/streams-schema';
import { EuiCallOut, EuiCheckbox, EuiFlexGroup, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { StreamTree } from './tree';
import { containsMappings } from '../helpers';
import { useStreamsPrivileges } from '../../../../../hooks/use_streams_privileges';

export function ContentPackObjectsList({
  objects,
  onSelectionChange,
}: {
  objects: ContentPackEntry[];
  onSelectionChange: (objects: ContentPackIncludedObjects) => void;
}) {
  const streamEntries = objects.filter(
    (entry): entry is ContentPackStream => entry.type === 'stream'
  );
  const {
    features: { significantEvents },
  } = useStreamsPrivileges();
  const isSignificantEventsEnabled = !!significantEvents?.enabled && !!significantEvents?.available;
  const [includeMappings, setIncludeMappings] = useState<boolean>(containsMappings(streamEntries));
  const [selection, setSelection] = useState<Record<string, { selected: boolean }>>({
    ...objects
      .filter((entry): entry is ContentPackStream => entry.type === 'stream')
      .reduce((map, stream) => {
        map[stream.name] = { selected: true };
        return map;
      }, {} as Record<string, { selected: boolean }>),
  });

  const { rootEntry, descendants } = useMemo(() => {
    if (objects.length === 0) {
      return { rootEntry: null, descendants: [] };
    }

    const root =
      objects.find(
        (entry): entry is ContentPackStream =>
          entry.type === 'stream' && entry.name === ROOT_STREAM_ID
      ) ?? null;

    const others = objects.filter(
      (entry): entry is ContentPackStream =>
        entry.type === 'stream' && entry.name !== ROOT_STREAM_ID
    );

    return { rootEntry: root, descendants: others };
  }, [objects]);

  return !rootEntry ? null : (
    <>
      <EuiCallOut
        size="s"
        iconType="iInCircle"
        title={
          isSignificantEventsEnabled
            ? i18n.translate('xpack.streams.contentPackObjectsList.structuralOnlyCallout', {
                defaultMessage:
                  'Content packs include stream structure only: routing, mappings, and child streams. Significant events and other detections are not included and are managed from the Significant events tab.',
              })
            : i18n.translate('xpack.streams.contentPackObjectsList.structuralOnlyCalloutNoTab', {
                defaultMessage:
                  'Content packs include stream structure only: routing, mappings, and child streams. Significant events and other detections are not included and are managed separately.',
              })
        }
      />

      <EuiSpacer size="m" />

      <EuiFlexGroup alignItems="center" direction="row" gutterSize="s">
        <EuiCheckbox
          id="include-mappings"
          disabled={!containsMappings(streamEntries)}
          checked={includeMappings}
          label={i18n.translate('xpack.streams.contentPackObjectsList.includeMappings', {
            defaultMessage: 'Include mappings of the root stream and selected child streams',
          })}
          onChange={() => {
            const include = !includeMappings;
            setIncludeMappings(include);
            onSelectionChange(
              toIncludedObjects({
                selection,
                includeMappings: include,
              })
            );
          }}
        />
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <StreamTree
        streams={descendants}
        onSelectionChange={(streamsSelection) => {
          setSelection(streamsSelection);

          onSelectionChange(
            toIncludedObjects({
              selection: streamsSelection,
              includeMappings,
            })
          );
        }}
      />
    </>
  );
}

function buildIncludedObjects(
  parent: string,
  selection: Record<string, { selected: boolean }>,
  includeMappings: boolean
): ContentPackIncludedObjects {
  const children = Object.keys(selection).filter((key) => {
    if (!selection[key].selected) {
      return false;
    }

    if (parent === ROOT_STREAM_ID) {
      return key !== ROOT_STREAM_ID && getSegments(key).length === 1;
    }
    return isChildOf(parent, key);
  });

  return {
    objects: {
      mappings: includeMappings,
      routing: children.map((child) => ({
        destination: child,
        ...buildIncludedObjects(child, selection, includeMappings),
      })),
    },
  };
}

function toIncludedObjects({
  selection,
  includeMappings,
}: {
  selection: Record<string, { selected: boolean }>;
  includeMappings: boolean;
}): ContentPackIncludedObjects {
  return buildIncludedObjects(ROOT_STREAM_ID, selection, includeMappings);
}
