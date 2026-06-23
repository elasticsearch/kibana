/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonGroup,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiSwitch,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { OTEL_STACK_NAMESPACE } from '../../quickstart_flows/otel_kubernetes/constants';
import type { KubernetesCardOption } from './kubernetes_card_selector';
import { KubernetesCardSelector } from './kubernetes_card_selector';

type OtelAnnotationMode = 'pods' | 'namespace';
type OtelLanguageId = 'nodejs' | 'java' | 'python' | 'dotnet' | 'go';

const OTEL_LANGUAGE_OPTIONS: Array<{ id: OtelLanguageId; label: string }> = [
  {
    id: 'nodejs',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.nodejsLanguageLabel',
      { defaultMessage: 'Node.js' }
    ),
  },
  {
    id: 'java',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.javaLanguageLabel',
      { defaultMessage: 'Java' }
    ),
  },
  {
    id: 'python',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.pythonLanguageLabel',
      { defaultMessage: 'Python' }
    ),
  },
  {
    id: 'dotnet',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.dotnetLanguageLabel',
      { defaultMessage: '.NET' }
    ),
  },
  {
    id: 'go',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.goLanguageLabel',
      { defaultMessage: 'Go' }
    ),
  },
];

const getPodsAnnotationSnippet = (languageId: OtelLanguageId): string => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  ...
  template:
    metadata:
      annotations:
        instrumentation.opentelemetry.io/inject-${languageId}: "${OTEL_STACK_NAMESPACE}/elastic-instrumentation"
      ...
    spec:
      containers:
      - image: myapplication-image
        name: app
      ...`;

const ANNOTATION_MODE_OPTIONS: Array<KubernetesCardOption<OtelAnnotationMode>> = [
  {
    id: 'pods',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.specificPodsCardLabel',
      { defaultMessage: 'Annotate specific pods' }
    ),
    description: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.specificPodsCardDescription',
      { defaultMessage: 'Add annotations to selected deployment pod templates.' }
    ),
  },
  {
    id: 'namespace',
    label: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.namespaceCardLabel',
      { defaultMessage: 'Annotate entire namespace' }
    ),
    description: i18n.translate(
      'xpack.observability_onboarding.kubernetes.otelInstrumentation.namespaceCardDescription',
      { defaultMessage: 'Apply instrumentation annotations to all resources in a namespace.' }
    ),
  },
];

export const OtelInstrumentationStep: React.FC = () => {
  const [isInstrumentationEnabled, setIsInstrumentationEnabled] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<OtelAnnotationMode>('pods');
  const [languageId, setLanguageId] = useState<OtelLanguageId>('nodejs');

  return (
    <>
      <EuiSwitch
        label={i18n.translate(
          'xpack.observability_onboarding.kubernetes.otelInstrumentation.switchLabel',
          { defaultMessage: 'Instrument application (Optional)' }
        )}
        checked={isInstrumentationEnabled}
        onChange={(event) => setIsInstrumentationEnabled(event.target.checked)}
        data-test-subj="observabilityOnboardingKubernetesOtelInstrumentationSwitch"
      />

      {isInstrumentationEnabled ? (
        <>
          <EuiSpacer />
          <EuiText size="s">
            <p>
              {i18n.translate(
                'xpack.observability_onboarding.kubernetes.otelInstrumentation.introduction',
                {
                  defaultMessage:
                    'The Operator automates the injection of auto-instrumentation libraries into annotated pods for some languages.',
                }
              )}
            </p>
          </EuiText>
          <EuiSpacer />
          <KubernetesCardSelector
            legend={i18n.translate(
              'xpack.observability_onboarding.kubernetes.otelInstrumentation.annotationModeLegend',
              { defaultMessage: 'Select an annotation method' }
            )}
            selectedId={annotationMode}
            options={ANNOTATION_MODE_OPTIONS}
            onChange={setAnnotationMode}
            dataTestSubjPrefix="observabilityOnboardingKubernetesOtelAnnotationMode"
          />
          <EuiSpacer />
          <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiButtonGroup
                legend={i18n.translate(
                  'xpack.observability_onboarding.kubernetes.otelInstrumentation.languageSelectorLegend',
                  { defaultMessage: 'Programming language' }
                )}
                idSelected={languageId}
                onChange={(optionId) => setLanguageId(optionId as OtelLanguageId)}
                options={OTEL_LANGUAGE_OPTIONS}
                data-test-subj="observabilityOnboardingKubernetesOtelInstrumentationLanguageSelector"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiLink
                href="https://opentelemetry.io/docs/platforms/kubernetes/operator/automatic/"
                data-test-subj="observabilityOnboardingKubernetesOtelInstrumentationDocsLink"
                target="_blank"
                external
              >
                {i18n.translate(
                  'xpack.observability_onboarding.kubernetes.otelInstrumentation.docsLinkLabel',
                  { defaultMessage: 'Other languages documentation' }
                )}
              </EuiLink>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />
          {annotationMode === 'pods' ? (
            <EuiCodeBlock
              paddingSize="m"
              language="yaml"
              isCopyable={true}
              data-test-subj="observabilityOnboardingKubernetesOtelInstrumentationPodsSnippet"
            >
              {getPodsAnnotationSnippet(languageId)}
            </EuiCodeBlock>
          ) : (
            <EuiCodeBlock
              paddingSize="m"
              language="bash"
              isCopyable={true}
              data-test-subj="observabilityOnboardingKubernetesOtelInstrumentationNamespaceSnippet"
            >
              {`kubectl annotate namespace my-namespace instrumentation.opentelemetry.io/inject-${languageId}="${OTEL_STACK_NAMESPACE}/elastic-instrumentation"`}
            </EuiCodeBlock>
          )}
          <EuiSpacer />
          <EuiText size="s">
            <p>
              <strong>
                {i18n.translate(
                  'xpack.observability_onboarding.kubernetes.otelInstrumentation.applyManifestAndRestartLabel',
                  {
                    defaultMessage: 'Apply your updated manifest and restart the deployment:',
                  }
                )}
              </strong>
            </p>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiCodeBlock
            paddingSize="m"
            language="bash"
            isCopyable={true}
            data-test-subj="observabilityOnboardingKubernetesOtelInstrumentationRestartCommand"
          >
            {`kubectl rollout restart deployment myapp -n my-namespace

kubectl describe pod <myapp-pod-name> -n my-namespace`}
          </EuiCodeBlock>
        </>
      ) : null}
    </>
  );
};
