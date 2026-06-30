/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { css } from '@emotion/react';
import type { Streams } from '@kbn/streams-schema';
import type {
  ContentPackEntry,
  ContentPackIncludedObjects,
  ContentPackManifest,
} from '@kbn/content-packs-schema';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../../hooks/use_kibana';
import { ContentPackObjectsList } from './objects_list';
import { importContent, previewContent } from './requests';
import { getFormattedError } from '../../../../util/errors';
import { hasSelectedObjects, isEmptyContentPack } from './helpers';

export function ImportContentPackFlyout({
  definition,
  onImport,
  onClose,
}: {
  definition: Streams.all.GetResponse;
  onClose: () => void;
  onImport: () => void;
}) {
  const {
    core: { http, notifications },
  } = useKibana();

  const modalTitleId = useGeneratedHtmlId();

  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [contentPackObjects, setContentPackObjects] = useState<ContentPackEntry[] | undefined>(
    undefined
  );
  const [includedObjects, setIncludedObjects] = useState<ContentPackIncludedObjects>({
    objects: { all: {} },
  });
  const [manifest, setManifest] = useState<ContentPackManifest | undefined>();

  return (
    <EuiFlyout onClose={onClose} aria-labelledby={modalTitleId}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle>
          <h2 id={modalTitleId}>
            {i18n.translate('xpack.streams.streamDetailDashboard.importContent', {
              defaultMessage: 'Import content pack',
            })}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody
        css={css`
          .euiFlyoutBody__overflowContent {
            height: 100%;
          }
        `}
      >
        {!file && (
          <EuiFilePicker
            css={css`
              height: 100%;
              > div {
                height: 100%;
              }
            `}
            id={'streams-content-import'}
            multiple={false}
            initialPromptText={i18n.translate(
              'xpack.streams.streamDetailDashboard.importContentFilePickerPrompt',
              {
                defaultMessage: 'Drop a content pack .zip here to preview and import it.',
              }
            )}
            fullWidth
            onChange={async (files) => {
              if (files?.length) {
                const archiveFile = files.item(0);
                if (!archiveFile) return;

                setFile(archiveFile);

                try {
                  const contentPackParsed = await previewContent({
                    http,
                    definition,
                    file: archiveFile,
                  });

                  setManifest({
                    name: contentPackParsed.name,
                    version: contentPackParsed.version,
                    description: contentPackParsed.description,
                  });
                  setContentPackObjects(contentPackParsed.entries);
                } catch (err) {
                  setFile(undefined);

                  const formattedErr = getFormattedError(err);
                  notifications.toasts.addError(formattedErr, {
                    title: i18n.translate('xpack.streams.failedToPreviewContentError', {
                      defaultMessage: 'Failed to preview content pack',
                    }),
                    toastMessage: formattedErr.message,
                  });
                }
              } else {
                setFile(undefined);
              }
            }}
            display={'large'}
          />
        )}

        {file && manifest && contentPackObjects ? (
          <>
            <EuiPanel hasBorder={true} hasShadow={false} paddingSize="s">
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexGroup alignItems="center" gutterSize="m">
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="package" aria-hidden={true} />
                  </EuiFlexItem>

                  <EuiFlexItem grow={false}>
                    {manifest.name} {manifest.version}
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={i18n.translate('xpack.streams.importContentPackFlyout.closeIcon', {
                      defaultMessage: 'Close',
                    })}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      aria-label={i18n.translate(
                        'xpack.streams.importContentPackFlyout.closeIcon',
                        {
                          defaultMessage: 'Close',
                        }
                      )}
                      iconType="cross"
                      color="danger"
                      onClick={() => {
                        setFile(undefined);
                        setManifest(undefined);
                        setContentPackObjects(undefined);
                        setIncludedObjects({ objects: { all: {} } });
                      }}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>

            <EuiSpacer />

            <ContentPackObjectsList
              objects={contentPackObjects}
              onSelectionChange={setIncludedObjects}
            />
          </>
        ) : null}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={() => onClose()}>
              {i18n.translate('xpack.streams.importContentPackFlyout.cancel', {
                defaultMessage: 'Cancel',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="streamsAppModalFooterButton"
              isDisabled={
                !file ||
                isEmptyContentPack(contentPackObjects ?? []) ||
                !hasSelectedObjects(includedObjects)
              }
              isLoading={isLoading}
              fill
              onClick={async () => {
                if (!file) return;

                setIsLoading(true);

                try {
                  await importContent({
                    http,
                    file,
                    definition,
                    include: includedObjects,
                  });

                  setIsLoading(false);
                  setContentPackObjects(undefined);
                  setFile(undefined);
                  notifications.toasts.addSuccess(
                    i18n.translate('xpack.streams.importContentPackFlyout.importSuccess', {
                      defaultMessage: 'Content imported successfully',
                    })
                  );
                  onImport();
                } catch (err) {
                  setIsLoading(false);

                  const formattedErr = getFormattedError(err);
                  notifications.toasts.addError(formattedErr, {
                    title: i18n.translate('xpack.streams.failedToImportContentError', {
                      defaultMessage: 'Failed to import content pack',
                    }),
                    toastMessage: formattedErr.message,
                  });
                }
              }}
            >
              {i18n.translate('xpack.streams.importContentPackFlyout.importToStream', {
                defaultMessage: 'Import to stream',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
