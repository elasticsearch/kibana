/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiLoadingSpinner } from '@elastic/eui';
import { css } from '@emotion/react';
import {
  ResizableLayout,
  ResizableLayoutDirection,
  ResizableLayoutMode,
  ResizableLayoutOrder,
} from '@kbn/resizable-layout';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { TemplateYamlEditor } from './template_form';
import { TemplatePreview } from './template_preview';
import { componentStyles } from './template_form_layout.styles';
import { MIN_EDITOR_WIDTH, MIN_PREVIEW_WIDTH } from '../constants';

interface TemplateEditorLayoutProps {
  isLoading?: boolean;
  yamlValue: string;
  onYamlChange: (value: string) => void;
  onFieldDefaultChange?: (fieldName: string, value: string, control: string) => void;
  isYamlSaving: boolean;
  isYamlSaved: boolean;
  previewWidth: number;
  onPreviewWidthChange: (width: number) => void;
  savedValue?: string;
}

export const TemplateEditorLayout: React.FC<TemplateEditorLayoutProps> = ({
  isLoading,
  yamlValue,
  onYamlChange,
  onFieldDefaultChange,
  isYamlSaving,
  isYamlSaved,
  previewWidth,
  onPreviewWidthChange,
  savedValue,
}) => {
  const styles = useMemoCss(componentStyles);

  if (isLoading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" css={css({ height: '100%' })}>
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }

  return (
    <ResizableLayout
      className="eui-fullHeight"
      flexPanel={
        <div css={styles.editorPanel}>
          <TemplateYamlEditor
            value={yamlValue}
            onChange={onYamlChange}
            isSaving={isYamlSaving}
            isSaved={isYamlSaved}
            savedValue={savedValue}
          />
        </div>
      }
      minFlexPanelSize={MIN_EDITOR_WIDTH}
      fixedPanel={
        <div css={styles.previewPanel}>
          <TemplatePreview onFieldDefaultChange={onFieldDefaultChange} />
        </div>
      }
      fixedPanelSize={previewWidth}
      onFixedPanelSizeChange={onPreviewWidthChange}
      minFixedPanelSize={MIN_PREVIEW_WIDTH}
      fixedPanelOrder={ResizableLayoutOrder.End}
      mode={ResizableLayoutMode.Resizable}
      direction={ResizableLayoutDirection.Horizontal}
      resizeButtonClassName="templatePreviewResizeButton"
      data-test-subj="templateEditorWithPreviewLayout"
    />
  );
};

TemplateEditorLayout.displayName = 'TemplateEditorLayout';
