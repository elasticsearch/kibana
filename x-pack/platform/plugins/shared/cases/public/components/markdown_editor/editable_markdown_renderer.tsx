/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiButtonSize } from '@elastic/eui';
import React, { forwardRef, useCallback, useImperativeHandle } from 'react';

import type { FormSchema } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { Form, UseField, useForm } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { MarkdownEditorForm } from '.';
import { removeItemFromSessionStorage } from '../utils';
import { getMarkdownEditorStorageKey } from './utils';
import { EditableMarkdownFooter } from './editable_markdown_footer';
import { useCasesContext } from '../cases_context/use_cases_context';

export interface EditableMarkdownRefObject {
  setComment: (newComment: string) => void;
}
interface EditableMarkdownRendererProps {
  content: string;
  id: string;
  caseId: string;
  fieldName: string;
  onChangeEditable: (id: string) => void;
  onSaveContent: (content: string) => void;
  editorRef: React.MutableRefObject<undefined | null | EditableMarkdownRefObject>;
  formSchema: FormSchema<{ content: string }> | undefined;
  footerButtonSize?: EuiButtonSize;
}

const EditableMarkDownRenderer = forwardRef<
  EditableMarkdownRefObject,
  EditableMarkdownRendererProps
>(
  (
    {
      id,
      content,
      caseId,
      fieldName,
      onChangeEditable,
      onSaveContent,
      editorRef,
      formSchema,
      footerButtonSize,
    },
    ref
  ) => {
    const { owner } = useCasesContext();
    const draftStorageKey = getMarkdownEditorStorageKey({ appId: owner[0], caseId, commentId: id });

    const initialState = { content };

    const { form } = useForm({
      defaultValue: initialState,
      options: { stripEmptyFields: false },
      schema: formSchema,
    });
    const { submit, setFieldValue, isValid: isFormValid } = form;

    const setComment = useCallback(
      (newComment: string) => {
        setFieldValue(fieldName, newComment);
      },
      [setFieldValue, fieldName]
    );

    useImperativeHandle(ref, () => ({
      setComment,
      editor: editorRef.current,
    }));

    const handleCancelAction = useCallback(() => {
      onChangeEditable(id);
      removeItemFromSessionStorage(draftStorageKey);
    }, [id, onChangeEditable, draftStorageKey]);

    const handleSaveAction = useCallback(async () => {
      const { isValid, data } = await submit();

      if (isValid && data.content !== content) {
        onSaveContent(data.content);
      }
      onChangeEditable(id);
      removeItemFromSessionStorage(draftStorageKey);
    }, [content, id, onChangeEditable, onSaveContent, submit, draftStorageKey]);

    return (
      <Form form={form} data-test-subj="editable-markdown-form">
        <UseField
          path={fieldName}
          component={MarkdownEditorForm}
          componentProps={{
            ref: editorRef,
            'aria-label': 'Cases markdown editor',
            value: content,
            id,
            caseId,
            draftStorageKey,
            bottomRightContent: (
              <EditableMarkdownFooter
                handleSaveAction={handleSaveAction}
                handleCancelAction={handleCancelAction}
                isSaveDisabled={isFormValid !== undefined && !isFormValid}
                buttonSize={footerButtonSize}
              />
            ),
            initialValue: content,
          }}
        />
      </Form>
    );
  }
);

EditableMarkDownRenderer.displayName = 'EditableMarkDownRenderer';

export const EditableMarkdown = React.memo(EditableMarkDownRenderer);
