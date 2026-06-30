/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { InboxAction } from '@kbn/inbox-common';
import { useRespondToInboxAction } from '../../../hooks/use_respond_to_inbox_action';
import { useActionDetailRenderer } from '../../../hooks/use_action_detail_renderer';
import * as i18n from '../translations';
import { InboxReasoning } from './inbox_reasoning';
import {
  SchemaForm,
  extractSchemaDefaults,
  validateSchemaValues,
  type InboxJsonSchema,
} from './schema_form';
import { TimeoutChip } from './timeout_chip';

const formatTimestamp = (iso?: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

export interface RespondFlyoutProps {
  action: InboxAction;
  onClose: () => void;
  onSuccess?: () => void;
}

export const RespondFlyout: React.FC<RespondFlyoutProps> = ({ action, onClose, onSuccess }) => {
  const schema = (action.input_schema ?? null) as InboxJsonSchema | null;
  const defaults = useMemo(() => extractSchemaDefaults(schema), [schema]);
  const [values, setValues] = useState<Record<string, unknown>>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useRespondToInboxAction();
  const DetailRenderer = useActionDetailRenderer(action.source_app);

  useEffect(() => {
    setValues(defaults);
    setErrors({});
  }, [action.id, defaults]);

  // Track whether we're still mounted so a long-running respond mutation
  // can't call `onSuccess` / `onClose` after the user has closed the flyout
  // (or worse, after they've reopened it for a *different* action — the
  // stale `onClose` would set `activeAction` back to null and unexpectedly
  // dismiss the new flyout).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isTimedOut = action.response_mode === 'timed_out';
  const submitDisabled = mutation.isLoading || isTimedOut;

  const onSubmit = useCallback(async () => {
    const validationErrors = validateSchemaValues(schema, values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    try {
      await mutation.mutateAsync({
        sourceApp: action.source_app,
        sourceId: action.source_id,
        input: values,
      });
      if (!mountedRef.current) return;
      onSuccess?.();
      onClose();
    } catch {
      // mutation.error is surfaced in the body below
    }
  }, [schema, values, mutation, action.source_app, action.source_id, onSuccess, onClose]);

  return (
    <EuiFlyout ownFocus onClose={onClose} aria-labelledby="inbox-respond-flyout-title" size="m">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="inbox-respond-flyout-title">{i18n.FLYOUT_TITLE}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <TimeoutChip timeoutAt={action.timeout_at} expired={isTimedOut} />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiText size="s">
          <strong>{action.title}</strong>
        </EuiText>
        {action.input_message ? (
          <EuiText color="subdued" size="s">
            <p>{action.input_message}</p>
          </EuiText>
        ) : null}
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {action.reasoning ? (
          <>
            <EuiFlexGroup direction="column" gutterSize="s">
              <InboxReasoning reasoning={action.reasoning} />
            </EuiFlexGroup>
            <EuiSpacer size="l" />
          </>
        ) : null}
        {isTimedOut ? (
          <EuiCallOut announceOnMount color="warning" iconType="clock">
            <p>
              {i18n.getTimedOutBannerText(
                formatTimestamp(action.responded_at ?? action.timeout_at)
              )}
            </p>
          </EuiCallOut>
        ) : (
          <>
            <SchemaForm
              schema={schema}
              values={values}
              onChange={setValues}
              errors={errors}
              disabled={mutation.isLoading}
            />
            {mutation.isError ? (
              <>
                <EuiSpacer size="m" />
                <EuiCallOut announceOnMount color="danger" iconType="warning">
                  <p>{i18n.getFlyoutSubmitErrorMessage(String(mutation.error))}</p>
                </EuiCallOut>
              </>
            ) : null}
          </>
        )}

        {DetailRenderer ? (
          <>
            <EuiSpacer size="l" />
            <DetailRenderer action={action} />
          </>
        ) : null}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose} flush="left">
              {i18n.FLYOUT_CANCEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={onSubmit}
              isLoading={mutation.isLoading}
              disabled={submitDisabled}
            >
              {i18n.FLYOUT_SUBMIT}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
