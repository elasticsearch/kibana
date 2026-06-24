/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { UseEuiTheme } from '@elastic/eui';
import { EuiIconTip, EuiLoadingSpinner, useEuiTheme } from '@elastic/eui';
import { css, Global } from '@emotion/react';
import {
  getTemplateDefinitionJsonSchema,
  TEMPLATE_SCHEMA_URI,
} from '../utils/template_json_schema';
import { TemplateYamlEditorBase } from './template_yaml_editor';
import { TemplateYamlValidationAccordion } from './template_yaml_validation_accordion';
import { useValidationAccordionPositioning } from '../hooks/use_validation_accordion_positioning';
import { useFieldNameValidation } from '../hooks/use_field_name_validation';
import { useUserPickerValidation } from '../hooks/use_user_picker_validation';
import { useLineDifferencesDecorations } from '../hooks/use_line_differences_decorations';
import { useKibana } from '../../../common/lib/kibana';

export interface YamlEditorFormValues {
  definition: string;
}

export interface TemplateYamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  isSaving?: boolean;
  isSaved?: boolean;
  savedValue?: string;
}

const styles = {
  editorContainer: ({ euiTheme }: UseEuiTheme) =>
    css({
      height: '100%',
      width: '100%',
      padding: euiTheme.size.xs,
      position: 'relative',
    }),
  statusIndicator: ({ euiTheme }: UseEuiTheme) =>
    css({
      position: 'absolute',
      top: euiTheme.size.s,
      right: euiTheme.size.s,
      zIndex: 1,
    }),
  validationContainer: css({
    position: 'fixed',
    bottom: '57px',
    marginLeft: '-24px',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column-reverse',
    '& > *': {
      pointerEvents: 'auto',
    },
  }),
  changedLineGlobal: ({ euiTheme }: UseEuiTheme) =>
    css({
      '.templateChangedLineDecoration': {
        background: euiTheme.colors.warning,
        width: '3px !important',
        marginLeft: '3px',
      },
    }),
};

export const TemplateYamlEditor = ({
  value,
  onChange,
  isSaving = false,
  isSaved = false,
  savedValue,
}: TemplateYamlEditorProps) => {
  const euiTheme = useEuiTheme();
  const { security } = useKibana().services;

  const {
    containerRef,
    accordionRef,
    editorRef,
    containerBounds,
    accordionHeight,
    portalNode,
    validationErrors,
    isEditorMounted,
    handleValidationChange,
    handleEditorMount,
    handleErrorClick,
  } = useValidationAccordionPositioning();

  useFieldNameValidation(editorRef.current, value);
  useUserPickerValidation(editorRef.current, value, security);
  useLineDifferencesDecorations({
    editor: editorRef.current,
    savedValue,
    currentValue: value,
  });

  const schemas = useMemo(() => {
    const jsonSchema = getTemplateDefinitionJsonSchema();
    if (!jsonSchema) {
      return [];
    }
    return [
      {
        uri: TEMPLATE_SCHEMA_URI,
        fileMatch: ['*'],
        schema: jsonSchema,
      },
    ];
  }, []);

  const editorPaddingBottom = `${accordionHeight + 8}px`;

  return (
    <>
      <Global styles={styles.changedLineGlobal(euiTheme)} />
      <div
        ref={containerRef}
        css={styles.editorContainer(euiTheme)}
        style={{ paddingBottom: editorPaddingBottom }}
      >
        {isSaving && (
          <div css={styles.statusIndicator(euiTheme)}>
            <EuiLoadingSpinner size="m" />
          </div>
        )}
        {!isSaving && isSaved && (
          <div css={styles.statusIndicator(euiTheme)}>
            <EuiIconTip
              type="check"
              color="success"
              size="l"
              content="Template saved"
              anchorProps={{ 'data-test-subj': 'template-saved-icon' }}
            />
          </div>
        )}
        <TemplateYamlEditorBase
          value={value}
          onChange={onChange}
          schemas={schemas}
          onValidationChange={handleValidationChange}
          onEditorMount={handleEditorMount}
        />
      </div>
      {portalNode &&
        createPortal(
          <div
            ref={accordionRef}
            css={styles.validationContainer}
            style={{
              left: `${containerBounds.left}px`,
              width: `${containerBounds.width}px`,
            }}
          >
            <TemplateYamlValidationAccordion
              isMounted={isEditorMounted}
              validationErrors={validationErrors}
              onErrorClick={handleErrorClick}
            />
          </div>,
          portalNode
        )}
    </>
  );
};

TemplateYamlEditor.displayName = 'TemplateYamlEditor';
