/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiFormRow, EuiIconTip } from '@elastic/eui';
import { Controller, useFormContext } from 'react-hook-form';
import { ESQLLangEditor } from '@kbn/esql/public';
import type { AggregateQuery } from '@kbn/es-query';
import type { FormValues } from '../types';

// Standard ES|QL editor heights matching @kbn/esql-editor
const EDITOR_HEIGHT_INLINE = 140; // For inline editing/flyouts
const EDITOR_HEIGHT_DEFAULT = 80; // Minimal editor

/** Allowed field paths for ES|QL query fields */
type EsqlQueryFieldPath = 'query.breach.query' | 'query.recovery.query';

export interface EsqlEditorFieldProps {
  /** The field path in the form - constrained to valid ES|QL query field paths */
  name: EsqlQueryFieldPath;
  /** Label displayed above the field */
  label?: React.ReactNode;
  /** Optional tooltip content displayed next to the label */
  labelTooltip?: string;
  /** Accessible label for screen readers (required if no visible label) */
  ariaLabel?: string;
  /** Optional help text displayed below the field */
  helpText?: React.ReactNode;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Height of the editor (default: 140 for flyouts) */
  height?: string | number;
  /** Whether the field should take full width */
  fullWidth?: boolean;
  /** Data test subject for testing */
  dataTestSubj?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is read-only */
  readOnly?: boolean;
  /** Validation rules for react-hook-form */
  rules?: {
    required?: string;
    /** Validation function - can be sync or async. Return true for valid, or error string for invalid. */
    validate?: (value: string | null | undefined) => string | boolean | Promise<string | boolean>;
  };
  /** Server-side errors to display in the editor */
  errors?: Error[];
  /** Server-side warning to display in the editor */
  warning?: string;
}

/**
 * An ES|QL editor field component using the full ESQLLangEditor with syntax highlighting,
 * autocomplete, and validation. Uses react-hook-form Controller for form integration.
 *
 * Features:
 * - Full ES|QL syntax highlighting and autocomplete
 * - Real-time client-side validation with error markers
 * - Server-side error/warning display
 * - Query history support
 * - Inline editing mode optimized for flyouts
 *
 * @example
 * ```tsx
 * <EsqlEditorField
 *   name="evaluation.query.base"
 *   label="Query"
 *   placeholder="FROM logs-* | WHERE ..."
 *   rules={{
 *     required: 'Query is required',
 *     validate: (value) => validateEsqlQuery(value) ?? true,
 *   }}
 * />
 * ```
 */
export const EsqlEditorField = ({
  name,
  label,
  labelTooltip,
  helpText,
  height = EDITOR_HEIGHT_INLINE,
  fullWidth = true,
  dataTestSubj,
  disabled = false,
  readOnly = false,
  rules,
  errors: serverErrors,
  warning: serverWarning,
}: EsqlEditorFieldProps) => {
  const { control } = useFormContext<FormValues>();

  const labelElement = label ? (
    labelTooltip ? (
      <>
        {label}
        &nbsp;
        <EuiIconTip position="right" type="question" content={labelTooltip} />
      </>
    ) : (
      label
    )
  ) : undefined;

  // Convert string value to AggregateQuery format for ESQLLangEditor
  const stringToQuery = useCallback((value: string | undefined): AggregateQuery => {
    return { esql: value ?? '' };
  }, []);

  // Convert AggregateQuery back to string for form storage
  const queryToString = useCallback((query: AggregateQuery): string => {
    return query.esql;
  }, []);

  // Memoize editor style to prevent unnecessary re-renders
  const editorStyle = useMemo(
    () => ({
      minHeight: typeof height === 'number' ? `${height}px` : height,
    }),
    [height]
  );

  // No-op submit handler - form submission is handled by parent
  const handleQuerySubmit = useCallback(async () => {}, []);

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => {
        const query = stringToQuery(field.value as string);

        const handleQueryChange = (newQuery: AggregateQuery) => {
          field.onChange(queryToString(newQuery));
        };

        // Combine form validation errors with server errors
        const combinedErrors: Error[] | undefined = (() => {
          const errs: Error[] = serverErrors ? [...serverErrors] : [];
          if (fieldState.error?.message) {
            errs.push(new Error(fieldState.error.message));
          }
          return errs.length > 0 ? errs : undefined;
        })();

        return (
          <EuiFormRow
            label={labelElement}
            helpText={helpText}
            isInvalid={!!fieldState.error}
            error={fieldState.error?.message}
            fullWidth={fullWidth}
          >
            <div style={editorStyle} data-test-subj={dataTestSubj}>
              <ESQLLangEditor
                query={query}
                onTextLangQueryChange={handleQueryChange}
                onTextLangQuerySubmit={handleQuerySubmit}
                errors={combinedErrors}
                warning={serverWarning}
                isLoading={false}
                isDisabled={disabled || readOnly}
                hideRunQueryButton
                editorIsInline
                hasOutline
                hideQueryHistory
                disableAutoFocus
                expandToFitQueryOnMount
                mergeExternalMessages
                dataTestSubj={`${dataTestSubj}-editor`}
              />
            </div>
          </EuiFormRow>
        );
      }}
    />
  );
};

// Export standard heights for consumers
export { EDITOR_HEIGHT_INLINE, EDITOR_HEIGHT_DEFAULT };
