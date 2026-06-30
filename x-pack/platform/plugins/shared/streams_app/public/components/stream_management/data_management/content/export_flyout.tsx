/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
// @ts-expect-error
import { saveAs } from '@elastic/filesaver';
import type { Streams } from '@kbn/streams-schema';
import type { ContentPackIncludedObjects, ContentPackManifest } from '@kbn/content-packs-schema';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../../hooks/use_kibana';
import { useStreamsAppFetch } from '../../../../hooks/use_streams_app_fetch';
import { getFormattedError } from '../../../../util/errors';
import { ContentPackObjectsList } from './objects_list';
import { previewContent } from './requests';
import { ContentPackMetadata } from './manifest';
import { hasSelectedObjects, isEmptyContentPack } from './helpers';

export function ExportContentPackFlyout({
  definition,
  onExport,
  onClose,
}: {
  definition: Streams.all.GetResponse;
  onClose: () => void;
  onExport: () => void;
}) {
  const modalTitleId = useGeneratedHtmlId();

  const {
    core: { http, notifications },
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  const [manifest, setManifest] = useState<ContentPackManifest | undefined>();

  const { value: exportResponse, loading: isLoadingContentPack } = useStreamsAppFetch(
    async ({ signal }) => {
      if (!definition) {
        return;
      }

      const contentPackRaw = await streamsRepositoryClient.fetch(
        'POST /api/streams/{name}/content/export 2023-10-31',
        {
          params: {
            path: { name: definition.stream.name },
            body: {
              name: definition.stream.name,
              description: '',
              version: '1.0.0',
              include: { objects: { all: {} } },
            },
          },
          signal,
        }
      );

      const contentPack = await previewContent({
        http,
        definition,
        // @ts-expect-error upgrade typescript v5.9.3
        file: new File([contentPackRaw], `${definition.stream.name}-1.0.0.zip`, {
          type: 'application/zip',
        }),
      });

      setManifest({
        name: contentPack.name,
        version: contentPack.version,
        description: contentPack.description,
      });

      return { contentPack };
    },
    [definition, streamsRepositoryClient, http]
  );

  const [includedObjects, setIncludedObjects] = useState<ContentPackIncludedObjects>({
    objects: { all: {} },
  });
  const [isExporting, setIsExporting] = useState(false);

  return (
    <EuiFlyout onClose={onClose} aria-labelledby={modalTitleId}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle>
          <h2 id={modalTitleId}>
            {i18n.translate('xpack.streams.streamDetailDashboard.exportContent', {
              defaultMessage: 'Export content pack',
            })}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {isLoadingContentPack ? (
          <EuiLoadingSpinner />
        ) : !exportResponse ? null : exportResponse.contentPack.entries ? (
          <>
            {manifest ? <ContentPackMetadata manifest={manifest} onChange={setManifest} /> : null}

            <EuiSpacer size="xl" />

            <ContentPackObjectsList
              objects={exportResponse.contentPack.entries}
              onSelectionChange={setIncludedObjects}
            />
          </>
        ) : null}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={() => onClose()}>
              {i18n.translate('xpack.streams.exportContentPackFlyout.cancel', {
                defaultMessage: 'Cancel',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="streamsAppModalFooterButton"
              isLoading={isExporting}
              isDisabled={
                isLoadingContentPack ||
                !manifest ||
                isEmptyContentPack(exportResponse?.contentPack.entries ?? []) ||
                !hasSelectedObjects(includedObjects)
              }
              fill
              onClick={async () => {
                if (!exportResponse || !manifest) {
                  return;
                }

                setIsExporting(true);

                try {
                  const contentPack = await streamsRepositoryClient.fetch(
                    'POST /api/streams/{name}/content/export 2023-10-31',
                    {
                      params: {
                        path: { name: definition.stream.name },
                        body: { ...manifest, include: includedObjects },
                      },
                      signal: new AbortController().signal,
                    }
                  );

                  saveAs(
                    // @ts-expect-error upgrade typescript v5.9.3
                    new Blob([contentPack], { type: 'application/zip' }),
                    `${manifest.name}-${manifest.version}.zip`
                  );
                  notifications.toasts.addSuccess(
                    i18n.translate('xpack.streams.exportContentPackFlyout.exportSuccess', {
                      defaultMessage: 'Export completed',
                    })
                  );
                  onExport();
                } catch (err) {
                  notifications.toasts.addError(getFormattedError(err), {
                    title: i18n.translate('xpack.streams.failedToExportContentError', {
                      defaultMessage: 'Failed to export content pack',
                    }),
                  });
                } finally {
                  setIsExporting(false);
                }
              }}
            >
              {i18n.translate('xpack.streams.exportContentPackFlyout.exportContentPack', {
                defaultMessage: 'Export content pack',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
