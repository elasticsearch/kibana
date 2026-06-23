/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import _ from 'lodash';
import type { FC } from 'react';
import React, { Fragment, useMemo } from 'react';
import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCallOut,
  EuiButton,
  EuiIconTip,
  EuiHorizontalRule,
  EuiTitle,
  EuiSpacer,
  EuiTextTruncate,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type {
  SavedObjectsImportSuccess,
  SavedObjectsImportWarning,
  IBasePath,
  CoreStart,
} from '@kbn/core/public';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { css } from '@emotion/react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { StartDependencies } from '@kbn/content-management-plugin/public/types';
import type { SavedObjectManagementTypeInfo } from '../../../../common/types';
import type { FailedImport } from '../../../lib';
import { getDefaultTitle, getSavedObjectLabel } from '../../../lib';

const DEFAULT_ICON = 'apps';

export interface ImportSummaryProps {
  failedImports: FailedImport[];
  successfulImports: SavedObjectsImportSuccess[];
  importWarnings: SavedObjectsImportWarning[];
  basePath: IBasePath;
  allowedTypes: SavedObjectManagementTypeInfo[];
}

interface ImportItem {
  type: string;
  id: string;
  title: string;
  icon: string;
  outcome: 'created' | 'overwritten' | 'error';
  errorMessage?: string;
}

const unsupportedTypeErrorMessage = i18n.translate(
  'savedObjectsManagement.objectsTable.importSummary.unsupportedTypeError',
  { defaultMessage: 'Unsupported object type' }
);

const getErrorMessage = ({ error }: FailedImport) => {
  if (error.type === 'unknown') {
    return error.message;
  } else if (error.type === 'unsupported_type') {
    return unsupportedTypeErrorMessage;
  }
};

const mapFailedImport = (failure: FailedImport): ImportItem => {
  const { obj } = failure;
  const { type, id, meta } = obj;
  const title = meta.title || getDefaultTitle(obj);
  const icon = meta.icon || DEFAULT_ICON;
  const errorMessage = getErrorMessage(failure);
  return { type, id, title, icon, outcome: 'error', errorMessage };
};

const mapImportSuccess = (obj: SavedObjectsImportSuccess): ImportItem => {
  const { type, id, meta, overwrite } = obj;
  const title = meta.title || getDefaultTitle(obj);
  const icon = meta.icon || DEFAULT_ICON;
  const outcome = overwrite ? 'overwritten' : 'created';
  return { type, id, title, icon, outcome };
};

const CountIndicators: FC<{ importItems: ImportItem[] }> = ({ importItems }) => {
  const styles = useMemoCss(componentStyles);

  if (!importItems.length) {
    return null;
  }

  const outcomeCounts = importItems.reduce(
    (acc, { outcome }) => acc.set(outcome, (acc.get(outcome) ?? 0) + 1),
    new Map<ImportItem['outcome'], number>()
  );
  const createdCount = outcomeCounts.get('created');
  const overwrittenCount = outcomeCounts.get('overwritten');
  const errorCount = outcomeCounts.get('error');

  return (
    <EuiFlexGroup>
      {createdCount && (
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4 css={styles.createdCount} data-test-subj="importSavedObjectsCreatedCount">
              <FormattedMessage
                id="savedObjectsManagement.importSummary.createdCountHeader"
                defaultMessage="{createdCount} new"
                values={{ createdCount }}
              />
            </h4>
          </EuiTitle>
        </EuiFlexItem>
      )}
      {overwrittenCount && (
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4 data-test-subj="importSavedObjectsOverwrittenCount">
              <FormattedMessage
                id="savedObjectsManagement.importSummary.overwrittenCountHeader"
                defaultMessage="{overwrittenCount} overwritten"
                values={{ overwrittenCount }}
              />
            </h4>
          </EuiTitle>
        </EuiFlexItem>
      )}
      {errorCount && (
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4 data-test-subj="importSavedObjectsErrorsCount" css={styles.errorCount}>
              <FormattedMessage
                id="savedObjectsManagement.importSummary.errorCountHeader"
                defaultMessage="{errorCount} error"
                values={{ errorCount }}
              />
            </h4>
          </EuiTitle>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

const StatusIndicator: FC<{ item: ImportItem }> = ({ item }) => {
  const { outcome, errorMessage = 'Error' } = item;
  switch (outcome) {
    case 'created':
      return (
        <EuiIconTip
          type={'checkCircleFill'}
          color={'success'}
          content={i18n.translate('savedObjectsManagement.importSummary.createdOutcomeLabel', {
            defaultMessage: 'Created',
          })}
        />
      );
    case 'overwritten':
      return (
        <EuiIconTip
          type={'check'}
          content={i18n.translate('savedObjectsManagement.importSummary.overwrittenOutcomeLabel', {
            defaultMessage: 'Overwritten',
          })}
        />
      );
    case 'error':
      return (
        <EuiIconTip
          type={'error'}
          color={'danger'}
          content={i18n.translate('savedObjectsManagement.importSummary.errorOutcomeLabel', {
            defaultMessage: '{errorMessage}',
            values: { errorMessage },
          })}
        />
      );
  }
};

const ImportWarnings: FC<{ warnings: SavedObjectsImportWarning[]; basePath: IBasePath }> = ({
  warnings,
  basePath,
}) => {
  if (!warnings.length) {
    return null;
  }

  return (
    <>
      <EuiSpacer size="m" />
      {warnings.map((warning, index) => (
        <Fragment key={`warning-${index}`}>
          <ImportWarning warning={warning} basePath={basePath} />
          {index < warnings.length - 1 && <EuiSpacer size="s" />}
        </Fragment>
      ))}
    </>
  );
};

const ImportWarning: FC<{ warning: SavedObjectsImportWarning; basePath: IBasePath }> = ({
  warning: providedWarning,
  basePath,
}) => {
  const kibana = useKibana<CoreStart & StartDependencies>();
  const isUnifiedRulesPageEnabled = useMemo(
    () => kibana.services.application?.isAppRegistered?.('rules') ?? false,
    [kibana.services.application]
  );

  const isRulesWarning =
    'actionPath' in providedWarning && providedWarning.actionPath.endsWith('triggersActions/rules');

  const warning = useMemo(
    () =>
      isUnifiedRulesPageEnabled && isRulesWarning
        ? {
            ...providedWarning,
            actionPath: '/app/rules',
          }
        : providedWarning,
    [isUnifiedRulesPageEnabled, isRulesWarning, providedWarning]
  );

  const warningContent = useMemo(() => {
    if (warning.type === 'action_required') {
      return (
        <EuiFlexGroup alignItems="flexEnd" justifyContent="flexEnd" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButton
              size="s"
              color="warning"
              data-test-subj="warningActionButton"
              href={basePath.prepend(warning.actionPath)}
              target="_blank"
            >
              {warning.buttonLabel || (
                <FormattedMessage
                  id="savedObjectsManagement.importSummary.warnings.defaultButtonLabel"
                  defaultMessage="Go"
                />
              )}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }
    return null;
  }, [warning, basePath]);

  return (
    <EuiCallOut
      color="warning"
      size="s"
      iconType="warning"
      data-test-subj="importSavedObjectsWarning"
      title={warning.message}
    >
      {warningContent}
    </EuiCallOut>
  );
};

export const ImportSummary: FC<ImportSummaryProps> = ({
  failedImports,
  successfulImports,
  importWarnings,
  basePath,
  allowedTypes,
}) => {
  const importItems: ImportItem[] = useMemo(
    () =>
      _.sortBy(
        [
          ...failedImports.map((x) => mapFailedImport(x)),
          ...successfulImports.map((x) => mapImportSuccess(x)),
        ],
        ['type', 'title']
      ),
    [successfulImports, failedImports]
  );
  const styles = useMemoCss(componentStyles);

  return (
    <Fragment>
      <EuiTitle
        size="s"
        data-test-subj={
          importItems.length ? 'importSavedObjectsSuccess' : 'importSavedObjectsSuccessNoneImported'
        }
      >
        <h3>
          <FormattedMessage
            id="savedObjectsManagement.importSummary.headerLabel"
            defaultMessage="{importCount, plural, one {1 object} other {# objects}} imported"
            values={{ importCount: importItems.length }}
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <CountIndicators importItems={importItems} />
      <ImportWarnings warnings={importWarnings} basePath={basePath} />
      <EuiHorizontalRule />
      {importItems.map((item, index) => {
        const { type, title, icon } = item;
        const typeLabel = getSavedObjectLabel(type, allowedTypes);
        return (
          <EuiFlexGroup
            responsive={false}
            key={index}
            alignItems="center"
            gutterSize="s"
            css={styles.row}
            data-test-subj="importSavedObjectsRow"
          >
            <EuiFlexItem grow={false}>
              <EuiIconTip content={typeLabel} position="top" aria-label={typeLabel} type={icon} />
            </EuiFlexItem>
            <EuiFlexItem css={styles.title} data-test-subj="importSavedObjectsTitle">
              <EuiText size="s">
                <EuiTextTruncate text={title} />
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <div className="eui-textRight">
                <StatusIndicator item={item} />
              </div>
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      })}
    </Fragment>
  );
};

const componentStyles = {
  row: ({ euiTheme }: UseEuiTheme) => css({ marginBottom: euiTheme.size.xs }),
  title: css({ minWidth: 0 }),
  createdCount: ({ euiTheme }: UseEuiTheme) => css({ color: euiTheme.colors.textSuccess }),
  errorCount: ({ euiTheme }: UseEuiTheme) => css({ color: euiTheme.colors.textDanger }),
};
