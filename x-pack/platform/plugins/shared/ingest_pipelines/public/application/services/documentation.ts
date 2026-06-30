/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DocLinksStart } from '@kbn/core/public';

export class DocumentationService {
  private esDocBasePath: string = '';
  private ingestNodeUrl: string = '';
  private processorsUrl: string = '';
  private handlingFailureUrl: string = '';
  private createPipelineUrl: string = '';
  private fieldAccessPatternUrl: string = '';
  private createPipelineCSVUrl: string = '';
  private simulatePipelineApiUrl: string = '';
  private enrichDataUrl: string = '';
  private geoMatchUrl: string = '';
  private dissectKeyModifiersUrl: string = '';
  private classificationUrl: string = '';
  private regressionUrl: string = '';
  private documentationUrl: string = '';
  private createIndexParameters: string = '';
  private docLinks: DocLinksStart | undefined;

  public setup(docLinks: DocLinksStart): void {
    const { links } = docLinks;

    this.docLinks = docLinks;

    this.esDocBasePath = links.elasticsearch.docsBase;
    this.ingestNodeUrl = links.ingest.pipelines;
    this.processorsUrl = links.ingest.processors;
    this.handlingFailureUrl = links.ingest.pipelineFailure;
    this.createPipelineUrl = links.ingest.pipelineCreate;
    this.fieldAccessPatternUrl = links.ingest.fieldAccessPattern;
    this.createPipelineCSVUrl = links.ingest.csvPipelines;
    this.simulatePipelineApiUrl = links.apis.simulatePipeline;
    this.enrichDataUrl = links.ingest.enrich;
    this.geoMatchUrl = links.ingest.geoMatch;
    this.dissectKeyModifiersUrl = links.ingest.dissectKeyModifiers;
    this.classificationUrl = links.ingest.inferenceClassification;
    this.regressionUrl = links.ingest.inferenceRegression;
    this.documentationUrl = links.ingest.inference;
    this.createIndexParameters = links.elasticsearch.createIndexParameters;
  }

  public getEsDocsBasePath() {
    return this.esDocBasePath;
  }

  public getIngestNodeUrl() {
    return this.ingestNodeUrl;
  }

  public getProcessorsUrl() {
    return this.processorsUrl;
  }

  public getHandlingFailureUrl() {
    return this.handlingFailureUrl;
  }

  public getCreatePipelineUrl() {
    return this.createPipelineUrl;
  }

  public getFieldAccessPatternUrl() {
    return this.fieldAccessPatternUrl;
  }

  public getCreatePipelineCSVUrl() {
    return this.createPipelineCSVUrl;
  }

  public getSimulatePipelineApiUrl() {
    return this.simulatePipelineApiUrl;
  }

  public getEnrichDataUrl() {
    return this.enrichDataUrl;
  }

  public getGeoMatchUrl() {
    return this.geoMatchUrl;
  }

  public getDissectKeyModifiersUrl() {
    return this.dissectKeyModifiersUrl;
  }

  public getClassificationUrl() {
    return this.classificationUrl;
  }

  public getRegressionUrl() {
    return this.regressionUrl;
  }

  public getDocumentationUrl() {
    return this.documentationUrl;
  }

  public getIndexParametersUrl() {
    return this.createIndexParameters;
  }

  public getDocLinks(): undefined | DocLinksStart {
    return this.docLinks;
  }
}

export const documentationService = new DocumentationService();
