/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import React, { useEffect, useCallback, useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLink,
  EuiSkeletonRectangle,
  EuiSkeletonTitle,
  type UseEuiTheme,
  useIsWithinBreakpoints,
  useEuiTheme,
} from '@elastic/eui';
import useDebounce from 'react-use/lib/useDebounce';
import { i18n } from '@kbn/i18n';
import useObservable from 'react-use/lib/useObservable';
import { INDEX_PATTERN_TYPE } from '@kbn/data-views-plugin/public';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { KbnInfoCallout } from '@kbn/ui-callout';

import type { DataView, DataViewSpec } from '../shared_imports';
import { Form, useForm, useFormData, useKibana, UseField } from '../shared_imports';

import { FlyoutPanels } from './flyout_panels';

import { removeSpaces } from '../lib';

import { noTimeFieldLabel, noTimeFieldValue } from '../lib/extract_time_fields';

import type {
  DataViewEditorContext,
  RollupIndicesCapsResponse,
  IndexPatternConfig,
  FormInternal,
} from '../types';

import {
  TimestampField,
  TypeField,
  TitleField,
  NameField,
  schema,
  Footer,
  SubmittingType,
  AdvancedParamsContent,
  PreviewPanel,
  RollupDeprecatedWarning,
} from '.';
import { editDataViewModal } from './confirm_modals/edit_data_view_changed_modal';
import type { DataViewEditorService } from '../data_view_editor_service';

export interface Props {
  /**
   * Handler for the "save" footer button
   */
  onSave: (dataViewSpec: DataViewSpec, persist: boolean) => void;
  /**
   * Handler for the "cancel" footer button
   */
  onCancel: () => void;
  defaultTypeIsRollup?: boolean;
  editData?: DataView;
  showManagementLink?: boolean;
  allowAdHoc: boolean;
  dataViewEditorService: DataViewEditorService;
  isDuplicating: boolean;
  onDuplicate?: () => void;
  getDataViewHelpText?: (dataView: DataView) => ReactNode | string | undefined;
}

const editorTitle = i18n.translate('indexPatternEditor.title', {
  defaultMessage: 'Create data view',
});

const editorTitleEditMode = i18n.translate('indexPatternEditor.titleEditMode', {
  defaultMessage: 'Edit data view',
});

const IndexPatternEditorFlyoutContentComponent = ({
  onSave,
  onCancel,
  defaultTypeIsRollup,
  editData,
  allowAdHoc,
  showManagementLink,
  getDataViewHelpText,
  dataViewEditorService,
  onDuplicate,
  isDuplicating,
}: Props) => {
  const styles = useMemoCss(componentStyles);
  const { euiTheme } = useEuiTheme();
  const isMobile = useIsWithinBreakpoints(['s', 'xs']);

  const {
    services: { application, dataViews, uiSettings, overlays, docLinks },
  } = useKibana<DataViewEditorContext>();

  const canSave = dataViews.getCanSaveSync();
  const isManaged = !!editData?.managed;
  // onDuplicate is only provided when editing an existing data view
  // if onDuplicate is undefined we are duplicating a new data view
  const isEditingExisting = editData && !isDuplicating;

  const { form } = useForm<IndexPatternConfig, FormInternal>({
    // Prefill with data if editData exists
    defaultValue: {
      type:
        defaultTypeIsRollup || editData?.type === INDEX_PATTERN_TYPE.ROLLUP
          ? INDEX_PATTERN_TYPE.ROLLUP
          : INDEX_PATTERN_TYPE.DEFAULT,
      isAdHoc: false,
      ...(editData
        ? {
            title: editData.getIndexPattern(),
            id: isDuplicating ? undefined : editData.id,
            name: isDuplicating ? undefined : editData.name,
            allowHidden: editData.getAllowHidden(),
            ...(editData.timeFieldName === noTimeFieldValue
              ? { timestampField: { label: noTimeFieldLabel, value: noTimeFieldValue } }
              : editData.timeFieldName
              ? {
                  timestampField: { label: editData.timeFieldName, value: editData.timeFieldName },
                }
              : {}),
          }
        : {}),
    },
    schema,
    onSubmit: async (formData, isValid) => {
      if (!isValid) {
        return;
      }

      const indexPatternStub: DataViewSpec = {
        title: removeSpaces(formData.title),
        timeFieldName: formData.timestampField?.value,
        id: formData.id,
        name: formData.name,
        allowHidden: formData.allowHidden,
      };

      if (type === INDEX_PATTERN_TYPE.ROLLUP && rollupIndex) {
        indexPatternStub.type = INDEX_PATTERN_TYPE.ROLLUP;
        indexPatternStub.typeMeta = {
          params: {
            rollup_index: rollupIndex,
          },
          aggs: rollupCaps?.aggs,
        };
      }

      if (isEditingExisting && editData.getIndexPattern() !== formData.title) {
        await editDataViewModal({
          dataViewName: formData.name || formData.title,
          overlays,
          onEdit: async () => {
            await onSave(indexPatternStub, !formData.isAdHoc);
          },
        });
      } else {
        await onSave(indexPatternStub, !formData.isAdHoc);
      }
    },
  });

  // `useFormData` initially returns `undefined`,
  // we override `undefined` with real default values from `schema`
  // to get a stable reference to avoid hooks re-run and reduce number of excessive requests
  const [
    {
      title = schema.title.defaultValue,
      allowHidden = schema.allowHidden.defaultValue,
      type = schema.type.defaultValue,
    },
  ] = useFormData<FormInternal>({
    form,
  });

  const isLoadingSources = useObservable(dataViewEditorService.isLoadingSources$, true);
  const existingDataViewNames = useObservable(dataViewEditorService.dataViewNames$);
  const rollupIndex = useObservable(dataViewEditorService.rollupIndex$);
  const rollupCaps = useObservable(dataViewEditorService.rollupCaps$);
  const rollupIndicesCapabilities = useObservable(dataViewEditorService.rollupIndicesCaps$, {});

  const namesNotAllowed = useMemo(() => {
    // When duplicating a data view, add the existing name
    // to the not allowed names list
    if (isDuplicating && editData) {
      return [editData.name, ...(existingDataViewNames || [])];
    }
    return existingDataViewNames || [];
  }, [existingDataViewNames, isDuplicating, editData]);

  useDebounce(
    () => {
      dataViewEditorService.setIndexPattern(title);
    },
    250,
    [dataViewEditorService, title]
  );

  useEffect(() => {
    dataViewEditorService.setAllowHidden(allowHidden);
  }, [dataViewEditorService, allowHidden]);

  useEffect(() => {
    dataViewEditorService.setType(type);
  }, [dataViewEditorService, type]);

  const getRollupIndices = (rollupCapsRes: RollupIndicesCapsResponse) => Object.keys(rollupCapsRes);
  const titleHelpText = useMemo(
    () => editData && getDataViewHelpText && getDataViewHelpText(editData),
    [editData, getDataViewHelpText]
  );

  const onTypeChange = useCallback(
    (newType: INDEX_PATTERN_TYPE) => {
      form.setFieldValue('title', '');
      form.setFieldValue('name', '');
      form.setFieldValue('timestampField', '');
      if (newType === INDEX_PATTERN_TYPE.ROLLUP) {
        form.setFieldValue('allowHidden', false);
      }
    },
    [form]
  );

  if (isLoadingSources || !existingDataViewNames) {
    return (
      <EuiFlexGroup css={styles.loadingWrapper}>
        <EuiFlexItem>
          <EuiSkeletonTitle size="l" css={styles.skeletonTitle} />
          {Array.from({ length: 3 }).map((_, index) => (
            <React.Fragment key={index}>
              <EuiSpacer size="xl" />
              <EuiSkeletonRectangle width="100%" height="48px" />
            </React.Fragment>
          ))}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiSkeletonRectangle width="100%" height="160px" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  const showIndexPatternTypeSelect = () =>
    uiSettings.isDeclared('rollups:enableIndexPatterns') &&
    uiSettings.get('rollups:enableIndexPatterns') &&
    getRollupIndices(rollupIndicesCapabilities).length;

  const indexPatternTypeSelect = showIndexPatternTypeSelect() ? (
    <>
      <EuiSpacer size="l" />
      <EuiFlexGroup>
        <EuiFlexItem>
          <TypeField onChange={onTypeChange} />
        </EuiFlexItem>
      </EuiFlexGroup>
      {type === INDEX_PATTERN_TYPE.ROLLUP ? (
        <EuiFlexGroup>
          <EuiFlexItem>
            <RollupDeprecatedWarning docLinksService={docLinks} />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <></>
      )}
    </>
  ) : (
    <></>
  );

  const FlyoutEditorFooter = () => (
    <Footer
      onCancel={onCancel}
      onSubmit={async (adhoc?: boolean) => {
        const formData = form.getFormData();
        if (!formData.name) {
          form.updateFieldValues({ name: formData.title });
          await form.getFields().name.validate();
        }
        // Ensures timestamp field is validated against current set of options
        form.validateFields(['timestampField']);
        form.setFieldValue('isAdHoc', adhoc || false);
        form.submit();
      }}
      submitDisabled={(form.isSubmitted && !form.isValid) || form.isSubmitting}
      submittingType={
        form.isSubmitting
          ? form.getFormData().isAdHoc
            ? SubmittingType.savingAsAdHoc
            : SubmittingType.persisting
          : undefined
      }
      hasEditData={!!editData}
      isPersisted={Boolean(editData && editData.isPersisted())}
      allowAdHoc={allowAdHoc}
      canSave={canSave}
      isManaged={isManaged}
      onDuplicate={onDuplicate}
      isDuplicating={isDuplicating}
    />
  );

  return (
    <FlyoutPanels.Group flyoutClassName="indexPatternEditorFlyout" maxWidth={1180}>
      <FlyoutPanels.Item data-test-subj="indexPatternEditorFlyout" border="right">
        <FlyoutPanels.Content>
          <EuiTitle data-test-subj="flyoutTitle">
            <h2 id="dataViewEditorFlyoutTitle">
              {isEditingExisting ? editorTitleEditMode : editorTitle}
            </h2>
          </EuiTitle>
          {showManagementLink && isEditingExisting && editData && editData.id && (
            <EuiLink
              href={application.getUrlForApp('management', {
                path: `/kibana/dataViews/dataView/${editData.id}`,
              })}
            >
              {i18n.translate('indexPatternEditor.goToManagementPage', {
                defaultMessage: 'Manage settings and view field details',
              })}
            </EuiLink>
          )}
          {isManaged && (
            <KbnInfoCallout
              announceOnMount={false}
              title={i18n.translate('indexPatternEditor.managedDataViewCalloutMessage', {
                defaultMessage:
                  "You can't edit managed data views. Instead, you can duplicate the data view and make changes to your newly created copy.",
              })}
              size="s"
              css={{ marginTop: euiTheme.base }}
            />
          )}
          <Form
            form={form}
            css={styles.patternEditorForm}
            error={form.getErrors()}
            isInvalid={form.isSubmitted && !form.isValid && form.getErrors().length}
            data-validation-error={form.getErrors().length ? '1' : '0'}
            data-test-subj="indexPatternEditorForm"
          >
            <UseField path="isAdHoc" />
            {indexPatternTypeSelect}
            <EuiSpacer size="l" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <NameField namesNotAllowed={namesNotAllowed} disabled={isManaged} />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <TitleField
                  isRollup={form.getFields().type?.value === INDEX_PATTERN_TYPE.ROLLUP}
                  matchedIndices$={dataViewEditorService.matchedIndices$}
                  rollupIndicesCapabilities={rollupIndicesCapabilities}
                  indexPatternValidationProvider={
                    dataViewEditorService.indexPatternValidationProvider
                  }
                  titleHelpText={titleHelpText}
                  disabled={isManaged}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <TimestampField
                  options$={dataViewEditorService.timestampFieldOptions$}
                  isLoadingOptions$={dataViewEditorService.loadingTimestampFields$}
                  matchedIndices$={dataViewEditorService.matchedIndices$}
                  optionsError$={dataViewEditorService.timestampFieldsError$}
                  disabled={isManaged}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <AdvancedParamsContent
              disableAllowHidden={type === INDEX_PATTERN_TYPE.ROLLUP || isManaged}
              disableId={isEditingExisting || isManaged}
              onAllowHiddenChange={() => {
                form.getFields().title.validate();
              }}
              defaultVisible={editData?.getAllowHidden()}
            />
          </Form>
        </FlyoutPanels.Content>
        {!isMobile && <FlyoutEditorFooter />}
      </FlyoutPanels.Item>
      <FlyoutPanels.Item>
        {isLoadingSources ? (
          <></>
        ) : (
          <PreviewPanel
            type={type}
            allowHidden={allowHidden}
            title={title}
            matchedIndices$={dataViewEditorService.matchedIndices$}
          />
        )}
      </FlyoutPanels.Item>
      {isMobile && <FlyoutEditorFooter />}
    </FlyoutPanels.Group>
  );
};

const componentStyles = {
  patternEditorForm: css({
    flexGrow: 1,
  }),
  loadingWrapper: ({ euiTheme }: UseEuiTheme) =>
    css({
      margin: euiTheme.size.l,
    }),
  skeletonTitle: css({
    width: '25vw',
  }),
};

export const IndexPatternEditorFlyoutContent = React.memo(IndexPatternEditorFlyoutContentComponent);
