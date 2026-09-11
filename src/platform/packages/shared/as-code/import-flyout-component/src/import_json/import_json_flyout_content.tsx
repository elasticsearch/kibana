/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';

import {
  EuiAccordion,
  EuiBetaBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiFilePicker,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
  euiYScrollWithShadows,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import { KbnDangerCallout, KbnInfoCallout, KbnWarningCallout } from '@kbn/ui-callout';

import { importJsonFlyoutStrings } from './import_json_strings';
import { MAX_IMPORT_JSON_FILE_BYTES } from './constants';
import type { CreateFromJson, ImportJsonFlyoutServices, SanitizeImportJson } from './types';

export interface ImportJsonFlyoutContentProps<SanitizedState> {
  title: string;
  titleId: string;
  closeFlyout: () => void;
  dataTestSubjPrefix: string;
  /** Display name of the exporting app in the info callout (e.g. "Dashboard application"). */
  exportApplication: string;
  services: ImportJsonFlyoutServices;
  isTechnicalPreview?: boolean;
  serverValidationError: string;
  /** Override the default generic warnings summary. */
  getWarningsSummary?: (count: number) => string;
  sanitizeImportJson: SanitizeImportJson<SanitizedState>;
  createFromJson: CreateFromJson<SanitizedState>;
  onImportSuccess: (id: string, title: string) => void;
}

export const ImportJsonFlyoutContent = <SanitizedState,>({
  title,
  titleId,
  closeFlyout,
  dataTestSubjPrefix,
  exportApplication,
  services,
  isTechnicalPreview = false,
  serverValidationError,
  getWarningsSummary,
  sanitizeImportJson,
  createFromJson,
  onImportSuccess,
}: ImportJsonFlyoutContentProps<SanitizedState>) => {
  const euiThemeContext = useEuiTheme();
  const warningsAccordionId = useGeneratedHtmlId({
    prefix: `${dataTestSubjPrefix}Warnings`,
  });
  const savedObjectsHref = services.application.getUrlForApp('management', {
    path: '/kibana/objects',
  });
  const [filePickerError, setFilePickerError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sanitizedState, setSanitizedState] = useState<SanitizedState | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isWarningsExpanded, setIsWarningsExpanded] = useState(false);
  const [showWarningsCallout, setShowWarningsCallout] = useState(true);

  const warningsListStyles = useMemo(
    () => css`
      ${euiYScrollWithShadows(euiThemeContext, { height: 'auto' })}
      max-height: 240px;
      padding-top: ${euiThemeContext.euiTheme.size.s};
      padding-bottom: ${euiThemeContext.euiTheme.size.s};
    `,
    [euiThemeContext]
  );

  const resetState = useCallback(() => {
    setFilePickerError(null);
    setServerError(null);
    setWarnings([]);
    setSanitizedState(null);
    setIsWarningsExpanded(false);
    setShowWarningsCallout(true);
  }, []);

  const onFileChange = useCallback(
    async (files: FileList | null) => {
      resetState();
      const selected = files?.[0] ?? null;

      if (!selected) return;

      if (selected.size > MAX_IMPORT_JSON_FILE_BYTES) {
        setFilePickerError(importJsonFlyoutStrings.getFileTooLargeError());
        return;
      }

      setIsValidating(true);
      try {
        const text = await selected.text();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          setFilePickerError(importJsonFlyoutStrings.getInvalidJsonError());
          return;
        }

        try {
          const { data, warnings: sanitizeWarnings } = await sanitizeImportJson(raw);
          setWarnings(sanitizeWarnings);
          setSanitizedState(data);
        } catch {
          setServerError(serverValidationError);
        }
      } finally {
        setIsValidating(false);
      }
    },
    [resetState, sanitizeImportJson, serverValidationError]
  );

  const onImport = useCallback(async () => {
    if (!sanitizedState) return;

    setIsImporting(true);
    try {
      const result = await createFromJson(sanitizedState);
      closeFlyout();
      onImportSuccess(result.id, result.title);
    } catch (e) {
      services.notifications.toasts.addDanger({
        title,
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsImporting(false);
    }
  }, [sanitizedState, createFromJson, closeFlyout, onImportSuccess, services, title]);

  const canImport = Boolean(sanitizedState) && !isValidating && !filePickerError && !serverError;
  const warningsSummary =
    getWarningsSummary?.(warnings.length) ??
    importJsonFlyoutStrings.getWarningsSummary(warnings.length);

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id={titleId}>{title}</h2>
        </EuiTitle>
        {isTechnicalPreview && (
          <>
            <EuiSpacer size="s" />
            <EuiBetaBadge
              label={importJsonFlyoutStrings.getTechnicalPreviewBadgeLabel()}
              tooltipContent={importJsonFlyoutStrings.getTechnicalPreviewBadgeTooltip()}
              size="s"
              data-test-subj={`${dataTestSubjPrefix}TechnicalPreviewBadge`}
            />
          </>
        )}
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <KbnInfoCallout
          title={importJsonFlyoutStrings.getInfoCalloutTitle(exportApplication)}
          text={
            <FormattedMessage
              id="asCodeImport.importJson.ndjsonNote"
              defaultMessage="Trying to import an NDJSON? Do it from {link}."
              values={{
                link: (
                  <EuiLink href={savedObjectsHref}>
                    {importJsonFlyoutStrings.getNdjsonNoteLinkLabel()}
                  </EuiLink>
                ),
              }}
            />
          }
        />
        <EuiSpacer size="m" />

        {serverError && (
          <>
            <KbnDangerCallout
              announceOnMount
              title={serverError}
              data-test-subj={`${dataTestSubjPrefix}ServerError`}
            />
            <EuiSpacer size="m" />
          </>
        )}

        {showWarningsCallout && warnings.length > 0 && (
          <>
            <KbnWarningCallout
              announceOnMount
              size="s"
              title={importJsonFlyoutStrings.getWarningsTitle()}
              text={warningsSummary}
              data-test-subj={`${dataTestSubjPrefix}Warnings`}
              onDismiss={() => {
                setShowWarningsCallout(false);
                setIsWarningsExpanded(false);
              }}
            >
              <EuiAccordion
                id={warningsAccordionId}
                initialIsOpen={false}
                onToggle={setIsWarningsExpanded}
                paddingSize="s"
                buttonContent={
                  isWarningsExpanded
                    ? importJsonFlyoutStrings.getWarningsAccordionHide()
                    : importJsonFlyoutStrings.getWarningsAccordionShow()
                }
              >
                {isWarningsExpanded ? (
                  <EuiText
                    size="s"
                    data-test-subj={`${dataTestSubjPrefix}WarningsList`}
                    css={warningsListStyles}
                  >
                    <ul>
                      {warnings.map((w, i) => (
                        <li key={`${i}-${w}`}>{w}</li>
                      ))}
                    </ul>
                  </EuiText>
                ) : null}
              </EuiAccordion>
            </KbnWarningCallout>
            <EuiSpacer size="m" />
          </>
        )}

        <EuiForm fullWidth>
          <EuiFormRow
            fullWidth
            label={importJsonFlyoutStrings.getFilePickerLabel()}
            isInvalid={Boolean(filePickerError)}
            error={filePickerError ?? undefined}
          >
            <EuiFilePicker
              fullWidth
              accept=".json"
              onChange={onFileChange}
              isLoading={isValidating}
              isInvalid={Boolean(filePickerError)}
              data-test-subj={`${dataTestSubjPrefix}FilePicker`}
            />
          </EuiFormRow>
        </EuiForm>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={closeFlyout}
              data-test-subj={`${dataTestSubjPrefix}CancelButton`}
            >
              {importJsonFlyoutStrings.getCancelButtonLabel()}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              isDisabled={!canImport}
              isLoading={isImporting}
              onClick={onImport}
              data-test-subj={`${dataTestSubjPrefix}ImportButton`}
            >
              {isImporting
                ? importJsonFlyoutStrings.getImportingLabel()
                : importJsonFlyoutStrings.getImportButtonLabel()}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </>
  );
};
