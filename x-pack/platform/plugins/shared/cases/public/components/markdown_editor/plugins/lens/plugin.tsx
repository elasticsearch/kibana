/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { first } from 'rxjs';
import type { EuiMarkdownEditorUiPlugin, EuiMarkdownAstNodePosition } from '@elastic/eui';
import {
  EuiCodeBlock,
  EuiModalBody,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiMarkdownContext,
  EuiModalFooter,
  EuiButton,
  EuiFlexItem,
  EuiFlexGroup,
  EuiBetaBadge,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useContext, useMemo, useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useLocation } from 'react-router-dom';
import { css } from '@emotion/react';

import type { TypedLensByValueInput, LensSavedObjectAttributes } from '@kbn/lens-plugin/public';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { EmbeddablePackageState } from '@kbn/embeddable-plugin/public';
import { SavedObjectFinder } from '@kbn/saved-objects-finder-plugin/public';
import type { SavedObjectCommon } from '@kbn/saved-objects-finder-plugin/common';
import type { TimeRange } from '@kbn/data-plugin/common';
import { useKibana } from '../../../../common/lib/kibana';
import { DRAFT_COMMENT_STORAGE_ID, ID } from './constants';
import { CommentEditorContext } from '../../context';
import { useLensDraftComment } from './use_lens_draft_comment';
import { VISUALIZATION } from './translations';
import { useIsMainApplication } from '../../../../common/hooks';
import { convertToAbsoluteTimeRange } from '../../../attachments/lens/actions/convert_to_absolute_time_range';
import { toLensAttributes } from './to_lens_attributes';

const DEFAULT_TIMERANGE: TimeRange = {
  from: 'now-7d',
  to: 'now',
  mode: 'relative',
};

type LensIncomingEmbeddablePackage = EmbeddablePackageState<TypedLensByValueInput>;

type LensEuiMarkdownEditorUiPlugin = EuiMarkdownEditorUiPlugin<{
  timeRange: TypedLensByValueInput['timeRange'];
  position: EuiMarkdownAstNodePosition;
  attributes: TypedLensByValueInput['attributes'];
}>;

const LensEditorComponent: LensEuiMarkdownEditorUiPlugin['editor'] = ({
  node,
  onCancel,
  onSave,
}) => {
  const location = useLocation();
  const {
    application: { currentAppId$ },
    embeddable,
    lens,
    storage,
    contentManagement,
    uiSettings,
    data: {
      query: {
        timefilter: { timefilter },
      },
    },
  } = useKibana().services;
  const [currentAppId, setCurrentAppId] = useState<string | undefined>(undefined);
  const { draftComment, clearDraftComment } = useLensDraftComment();
  const commentEditorContext = useContext(CommentEditorContext);
  const markdownContext = useContext(EuiMarkdownContext);
  const isMainApplication = useIsMainApplication();
  const { euiTheme } = useEuiTheme();
  const handleClose = useCallback(() => {
    if (currentAppId) {
      embeddable?.getStateTransfer().getIncomingEmbeddablePackage(currentAppId, true);
      clearDraftComment();
    }
    onCancel();
  }, [clearDraftComment, currentAppId, embeddable, onCancel]);

  const handleAdd = useCallback(
    (_attributes: Record<string, unknown>, timeRange?: TimeRange) => {
      const attributes = toLensAttributes(_attributes);

      onSave(
        `!{${ID}${JSON.stringify({
          timeRange: convertToAbsoluteTimeRange(timeRange),
          attributes,
        })}}`,
        {
          block: true,
        }
      );

      handleClose();
    },
    [handleClose, onSave]
  );

  const handleUpdate = useCallback(
    (
      _attributes: Record<string, unknown>,
      timeRange: TimeRange | undefined,
      position: EuiMarkdownAstNodePosition
    ) => {
      const attributes = toLensAttributes(_attributes);

      markdownContext.replaceNode(
        position,
        `!{${ID}${JSON.stringify({
          timeRange: convertToAbsoluteTimeRange(timeRange),
          attributes,
        })}}`
      );

      handleClose();
    },
    [handleClose, markdownContext]
  );

  const originatingPath = useMemo(
    () =>
      isMainApplication
        ? `/insightsAndAlerting/cases${location.pathname}${location.search}`
        : `${location.pathname}${location.search}`,
    [isMainApplication, location.pathname, location.search]
  );

  const handleCreateInLensClick = useCallback(() => {
    storage.set(DRAFT_COMMENT_STORAGE_ID, {
      commentId: commentEditorContext?.editorId,
      comment: commentEditorContext?.value,
      position: node?.position,
      caseTitle: commentEditorContext?.caseTitle,
      caseTags: commentEditorContext?.caseTags,
    });

    lens?.navigateToPrefilledEditor(undefined, {
      originatingApp: currentAppId,
      originatingPath,
    });
  }, [
    storage,
    commentEditorContext?.editorId,
    commentEditorContext?.value,
    commentEditorContext?.caseTitle,
    commentEditorContext?.caseTags,
    node?.position,
    lens,
    currentAppId,
    originatingPath,
  ]);

  const handleEditInLensClick = useCallback(
    (lensAttributes?: Record<string, unknown>, timeRange: TimeRange = DEFAULT_TIMERANGE) => {
      storage.set(DRAFT_COMMENT_STORAGE_ID, {
        commentId: commentEditorContext?.editorId,
        comment: commentEditorContext?.value,
        position: node?.position,
        caseTitle: commentEditorContext?.caseTitle,
        caseTags: commentEditorContext?.caseTags,
      });

      lens?.navigateToPrefilledEditor(
        lensAttributes || node?.attributes
          ? {
              id: '',
              time_range: timeRange,
              attributes: (lensAttributes || node?.attributes) as LensSavedObjectAttributes,
            }
          : undefined,
        {
          originatingApp: currentAppId,
          originatingPath,
        }
      );
    },
    [
      storage,
      commentEditorContext?.editorId,
      commentEditorContext?.value,
      commentEditorContext?.caseTitle,
      commentEditorContext?.caseTags,
      node?.position,
      node?.attributes,
      lens,
      currentAppId,
      originatingPath,
    ]
  );

  const handleChooseLensSO = useCallback(
    (
      savedObjectId: string,
      savedObjectType: string,
      fullName: string,
      savedObject: SavedObjectCommon
    ) => {
      handleEditInLensClick({
        ...savedObject.attributes,
        title: '',
        references: savedObject.references,
      });
    },
    [handleEditInLensClick]
  );

  const savedObjectMetaData = useMemo(
    () => [
      {
        type: 'lens',
        getIconForSavedObject: () => 'lensApp',
        name: i18n.translate(
          'xpack.cases.markdownEditor.plugins.lens.insertLensSavedObjectModal.searchSelection.savedObjectType.lens',
          {
            defaultMessage: 'Lens',
          }
        ),
        includeFields: ['*'],
      },
    ],
    []
  );

  useEffect(() => {
    if (node?.attributes && currentAppId) {
      handleEditInLensClick(node.attributes, node.timeRange);
    }
  }, [handleEditInLensClick, node, currentAppId]);

  useEffect(() => {
    const getCurrentAppId = async () => {
      const appId = await currentAppId$.pipe(first()).toPromise();
      setCurrentAppId(appId);
    };
    getCurrentAppId();
  }, [currentAppId$]);

  useEffect(() => {
    if (!currentAppId) {
      return;
    }
    // `draftComment` hydrates asynchronously; wait for it so we don't drain the
    // package before the draft is ready and drop the edit.
    if (!draftComment) {
      return;
    }

    // Peek first so we only drain when we are committing an add/update.
    const incomingEmbeddablePackage = embeddable
      ?.getStateTransfer()
      .getIncomingEmbeddablePackage(currentAppId, false);

    const lensEmbeddablePackage = incomingEmbeddablePackage?.find(
      (pkg) => pkg.type === LENS_EMBEDDABLE_TYPE
    ) as LensIncomingEmbeddablePackage;

    if (!lensEmbeddablePackage?.serializedState?.attributes) {
      return;
    }

    embeddable?.getStateTransfer().getIncomingEmbeddablePackage(currentAppId, true);

    const lensTime = timefilter.getTime();
    const newTimeRange =
      lensTime?.from && lensTime?.to
        ? {
            from: lensTime.from,
            to: lensTime.to,
            mode: [lensTime.from, lensTime.to].join('').includes('now')
              ? ('relative' as const)
              : ('absolute' as const),
          }
        : undefined;

    if (draftComment.position) {
      handleUpdate(
        lensEmbeddablePackage.serializedState.attributes,
        newTimeRange,
        draftComment.position
      );
      return;
    }

    handleAdd(lensEmbeddablePackage.serializedState.attributes, newTimeRange);
  }, [embeddable, storage, timefilter, currentAppId, handleAdd, handleUpdate, draftComment]);

  const createLensButton = (
    <EuiButton onClick={handleCreateInLensClick} iconType="plusCircle">
      <FormattedMessage
        id="xpack.cases.markdownEditor.plugins.lens.createVisualizationButtonLabel"
        defaultMessage="Create new"
      />
    </EuiButton>
  );

  return (
    <EuiFlexGroup
      css={css`
        width: ${euiTheme.breakpoint.m};
        height: 100%;

        .euiModalBody {
          min-height: 300px;
        }
      `}
      direction="column"
      gutterSize="none"
    >
      <EuiModalHeader>
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiModalHeaderTitle>
              <FormattedMessage
                id="xpack.cases.markdownEditor.plugins.lens.addVisualizationModalTitle"
                defaultMessage="Add visualization"
              />
            </EuiModalHeaderTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <span
              css={css`
                display: inline-flex;

                .euiToolTipAnchor {
                  display: inline-flex;
                }
              `}
            >
              <EuiBetaBadge
                label={i18n.translate('xpack.cases.markdownEditor.plugins.lens.betaLabel', {
                  defaultMessage: 'Beta',
                })}
                tooltipContent={i18n.translate(
                  'xpack.cases.markdownEditor.plugins.lens.betaDescription',
                  {
                    defaultMessage:
                      'This module is not GA. You can only insert one lens per comment for now. Please help us by reporting bugs.',
                  }
                )}
              />
            </span>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalHeader>
      <EuiModalBody>
        <SavedObjectFinder
          key="searchSavedObjectFinder"
          id="casesMarkdownLens"
          onChoose={handleChooseLensSO}
          showFilter={false}
          noItemsMessage={
            <FormattedMessage
              id="xpack.cases.markdownEditor.plugins.lens.insertLensSavedObjectModal.searchSelection.notFoundLabel"
              defaultMessage="No matching lens found."
            />
          }
          savedObjectMetaData={savedObjectMetaData}
          fixedPageSize={10}
          services={{
            contentClient: contentManagement.client,
            uiSettings,
          }}
          leftChildren={createLensButton}
          helpText={i18n.translate(
            'xpack.cases.markdownEditor.plugins.lens.savedObjects.finder.searchInputHelpText',
            {
              defaultMessage:
                'Insert an existing lens visualization or create a new one. Any changes or new visualizations will only apply to this comment.',
            }
          )}
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButton onClick={handleClose} fill>
          <FormattedMessage
            id="xpack.cases.markdownEditor.plugins.lens.closeButtonLabel"
            defaultMessage="Close"
          />
        </EuiButton>
      </EuiModalFooter>
    </EuiFlexGroup>
  );
};
LensEditorComponent.displayName = 'LensEditor';

export const LensEditor = React.memo(LensEditorComponent);

export const plugin = {
  name: ID,
  button: {
    label: VISUALIZATION,
    iconType: 'lensApp',
  },
  helpText: (
    <EuiCodeBlock language="md" paddingSize="s" fontSize="l">
      {'!{lens<config>}'}
    </EuiCodeBlock>
  ),
  editor: LensEditor,
};
