/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPageHeader,
  EuiSpacer,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@kbn/react-query';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import { mapRuleResponseToFormValues } from '@kbn/alerting-v2-rule-form';
import type { RuleFormServices, FormValues } from '@kbn/alerting-v2-rule-form';
import { useKibana } from '../../common/lib/kibana';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { SecurityRuleForm } from '../components/security_rule_form';
import * as i18n from '../translations';

const MAX_WIDTH_CSS = css`
  max-width: 1600px;
`;

export const RulesV2CreatePage = () => {
  const { id: ruleId } = useParams<{ id?: string }>();

  if (ruleId) {
    return <EditRulePage ruleId={ruleId} />;
  }

  return <CreateRulePage />;
};

const VALID_V2_TYPES = ['esql', 'threshold'] as const;
type V2RuleType = (typeof VALID_V2_TYPES)[number];

const isValidV2Type = (value: string | null): value is V2RuleType =>
  value != null && (VALID_V2_TYPES as readonly string[]).includes(value);

const CreateRulePage = () => {
  const history = useHistory();
  const { search } = useLocation();
  const services = useRuleFormServices();

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const typeParam = searchParams.get('type');
  const returnTo = searchParams.get('returnTo');
  const initialRuleType = isValidV2Type(typeParam) ? typeParam : undefined;

  const handleSuccess = useCallback(
    (savedRuleId: string) => {
      history.push(`/rules_v2/view/${savedRuleId}`);
    },
    [history]
  );

  const handleCancel = useCallback(() => {
    history.push('/rules');
  }, [history]);

  const handleBackToV1 = useCallback(() => {
    history.push('/rules/create');
  }, [history]);

  return (
    <SecuritySolutionPageWrapper>
      <EuiFlexGroup justifyContent="center">
        <EuiFlexItem css={MAX_WIDTH_CSS}>
          {returnTo === 'rules' ? (
            <EuiButtonEmpty
              iconType="arrowLeft"
              onClick={handleBackToV1}
              flush="left"
              size="s"
              css={css`
                align-self: flex-start;
              `}
            >
              {i18n.BACK_TO_V1_CREATION}
            </EuiButtonEmpty>
          ) : (
            <EuiButtonEmpty
              iconType="arrowLeft"
              onClick={handleCancel}
              flush="left"
              size="s"
              css={css`
                align-self: flex-start;
              `}
            >
              {i18n.BACK_TO_RULES}
            </EuiButtonEmpty>
          )}
          <EuiSpacer size="m" />
          <EuiPageHeader pageTitle={i18n.CREATE_RULE} />
          <EuiSpacer size="m" />
          <SecurityRuleForm
            services={services}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            initialRuleType={initialRuleType}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </SecuritySolutionPageWrapper>
  );
};

const EditRulePage = ({ ruleId }: { ruleId: string }) => {
  const history = useHistory();
  const services = useRuleFormServices();

  const {
    data: rule,
    isLoading,
    isError,
    error,
  } = useQuery(
    ['rulesV2Edit', ruleId],
    () => services.http.get<RuleResponse>(`${ALERTING_V2_RULE_API_PATH}/${ruleId}`),
    { staleTime: 0, cacheTime: 0 }
  );

  const handleSuccess = useCallback(
    (savedRuleId: string) => {
      history.push(`/rules_v2/view/${savedRuleId}`);
    },
    [history]
  );

  const handleCancel = useCallback(() => {
    history.push(`/rules_v2/view/${ruleId}`);
  }, [history, ruleId]);

  if (isLoading) {
    return (
      <SecuritySolutionPageWrapper>
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </SecuritySolutionPageWrapper>
    );
  }

  if (isError || !rule) {
    return (
      <SecuritySolutionPageWrapper>
        <EuiCallOut title={i18n.RULE_LOAD_ERROR} color="danger" iconType="error">
          {error instanceof Error ? error.message : String(error)}
        </EuiCallOut>
      </SecuritySolutionPageWrapper>
    );
  }

  const initialValues: Partial<FormValues> = mapRuleResponseToFormValues(rule);
  const initialQuery = getBreachEsqlQuery(rule.query) || 'FROM logs-*';
  const initialParams = rule.params;
  const initialExceptions = rule.exceptions ?? [];

  return (
    <SecuritySolutionPageWrapper>
      <EuiFlexGroup justifyContent="center">
        <EuiFlexItem css={MAX_WIDTH_CSS}>
          <EuiButtonEmpty
            iconType="arrowLeft"
            onClick={() => history.push(`/rules_v2/view/${ruleId}`)}
            flush="left"
            size="s"
          >
            {i18n.BACK_TO_RULES}
          </EuiButtonEmpty>
          <EuiSpacer size="m" />
          <EuiPageHeader pageTitle={i18n.EDIT_RULE} />
          <EuiSpacer size="m" />
          <SecurityRuleForm
            key={ruleId}
            services={services}
            ruleId={ruleId}
            initialValues={initialValues}
            initialQuery={initialQuery}
            initialParams={initialParams}
            initialExceptions={initialExceptions}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </SecuritySolutionPageWrapper>
  );
};

const useRuleFormServices = (): RuleFormServices => {
  const { http, data, dataViews, notifications, application, lens } = useKibana().services;

  return useMemo(
    () => ({ http, data, dataViews, notifications, application, lens }),
    [http, data, dataViews, notifications, application, lens]
  );
};
