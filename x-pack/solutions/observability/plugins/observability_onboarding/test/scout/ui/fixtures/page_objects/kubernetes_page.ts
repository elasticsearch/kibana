/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout-oblt';

export class KubernetesPage {
  constructor(private readonly page: ScoutPage) {}

  async gotoPath(path: string) {
    const normalized = path.replace(/^\//, '');
    await this.page.gotoApp(`observabilityOnboarding/${normalized}`);
  }

  layout(method: 'otel') {
    return this.page.getByTestId(`observabilityOnboardingKubernetesLayout-${method}`);
  }

  collectionMethodSelector() {
    return this.page.getByTestId('collectionMethodSelector');
  }

  returnLink() {
    return this.page.getByTestId('observabilityOnboardingKubernetesReturn');
  }

  emptyPrompt() {
    return this.page.getByTestId('observabilityOnboardingEmptyPrompt');
  }

  emptyPromptRetryButton() {
    return this.page.getByTestId('observabilityOnboardingEmptyPromptRetryButton');
  }

  collectorTab(id: 'edot' | 'existing') {
    return this.page.getByTestId(`observabilityOnboardingKubernetesCollectorTab-${id}`);
  }

  existingCollectorTitle() {
    return this.page.getByRole('heading', {
      name: /Add a managed OTLP exporter|Use a gateway collector configuration/,
    });
  }

  existingCollectorDescription() {
    return this.page.getByText(
      /Add the following OTLP exporter and resource processor|Managed OTLP is not available for this deployment/
    );
  }

  otelInstrumentationSwitch() {
    return this.page.getByTestId('observabilityOnboardingKubernetesOtelInstrumentationSwitch');
  }

  otelAnnotationCard(id: 'pods' | 'namespace') {
    return this.page.getByTestId(`observabilityOnboardingKubernetesOtelAnnotationMode-${id}`);
  }

  otelInstrumentationNamespaceSnippet() {
    return this.page.getByTestId(
      'observabilityOnboardingKubernetesOtelInstrumentationNamespaceSnippet'
    );
  }

  otelInstrumentationPodsSnippet() {
    return this.page.getByTestId('observabilityOnboardingKubernetesOtelInstrumentationPodsSnippet');
  }

  async clickOtelAnnotationCard(id: 'pods' | 'namespace') {
    await this.otelAnnotationCard(id).getByRole('radio').click();
  }
}
