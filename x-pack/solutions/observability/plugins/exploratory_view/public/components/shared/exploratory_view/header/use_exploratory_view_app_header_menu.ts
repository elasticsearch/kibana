/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { AppHeaderMenu } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { EMBED_LABEL } from './embed_action';

export const SAVE_BUTTON_TEST_SUBJ = 'o11yExpViewActionMenuContentSaveButton';
export const OPEN_IN_LENS_BUTTON_TEST_SUBJ = 'o11yExpViewActionMenuContentOpenInLensButton';
export const ADD_TO_CASE_BUTTON_TEST_SUBJ = 'o11yAddToCaseActionAddToCaseButton';
export const EMBED_BUTTON_TEST_SUBJ = 'o11yEmbedActionButton';

const saveLabel = i18n.translate('xpack.exploratoryView.expView.heading.saveLensVisualization', {
  defaultMessage: 'Save',
});

const openInLensLabel = i18n.translate('xpack.exploratoryView.expView.heading.openInLens', {
  defaultMessage: 'Open in Lens',
});

const addToCaseLabel = i18n.translate('xpack.exploratoryView.expView.heading.addToCase', {
  defaultMessage: 'Add to case',
});

export function useExploratoryViewAppHeaderMenu({
  canUseEditor,
  hasLensAttributes,
  hasTimeRange,
  isDev,
  onSave,
  onOpenInLens,
  onAddToCase,
  onEmbed,
}: {
  canUseEditor: boolean;
  hasLensAttributes: boolean;
  hasTimeRange: boolean;
  isDev: boolean;
  onSave: () => void;
  onOpenInLens: () => void;
  onAddToCase: () => void;
  onEmbed: () => void;
}): AppHeaderMenu {
  const editorUnavailable = !canUseEditor || !hasLensAttributes;

  return useMemo<AppHeaderMenu>(() => {
    return {
      items: [
        {
          id: 'openInLens',
          label: openInLensLabel,
          iconType: 'lensApp',
          testId: OPEN_IN_LENS_BUTTON_TEST_SUBJ,
          disableButton: editorUnavailable,
          run: onOpenInLens,
        },
        {
          id: 'addToCase',
          label: addToCaseLabel,
          iconType: 'casesApp',
          testId: ADD_TO_CASE_BUTTON_TEST_SUBJ,
          disableButton: !hasLensAttributes || !hasTimeRange,
          run: onAddToCase,
        },
        ...(isDev
          ? [
              {
                id: 'embed',
                label: EMBED_LABEL,
                iconType: 'code',
                testId: EMBED_BUTTON_TEST_SUBJ,
                disableButton: !hasLensAttributes,
                overflow: true as const,
                run: onEmbed,
              },
            ]
          : []),
      ],
      primaryActionItem: {
        id: 'save',
        label: saveLabel,
        iconType: 'save',
        testId: SAVE_BUTTON_TEST_SUBJ,
        disableButton: editorUnavailable,
        run: onSave,
      },
    };
  }, [
    editorUnavailable,
    hasLensAttributes,
    hasTimeRange,
    isDev,
    onAddToCase,
    onEmbed,
    onOpenInLens,
    onSave,
  ]);
}
