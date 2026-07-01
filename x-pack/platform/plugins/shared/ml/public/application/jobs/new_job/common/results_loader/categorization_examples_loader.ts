/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import { CATEGORY_EXAMPLES_VALIDATION_STATUS } from '@kbn/ml-category-validator';
import type { IndexPatternTitle } from '@kbn/ml-common-types/kibana';
import { NUMBER_OF_CATEGORY_EXAMPLES } from '../../../../../../common/constants/new_job';
import type { CategorizationJobCreator } from '../job_creator';

export class CategorizationExamplesLoader {
  private _jobCreator: CategorizationJobCreator;
  private _indexPatternTitle: IndexPatternTitle = '';
  private _timeFieldName: string = '';
  private _query: object = {};

  constructor(jobCreator: CategorizationJobCreator, indexPattern: DataView, query: object) {
    this._jobCreator = jobCreator;
    this._indexPatternTitle = indexPattern.title;
    this._query = query;

    if (typeof indexPattern.timeFieldName === 'string') {
      this._timeFieldName = indexPattern.timeFieldName;
    }
  }

  public async loadExamples() {
    const analyzer = this._jobCreator.categorizationAnalyzer;
    const categorizationFieldName = this._jobCreator.categorizationFieldName;
    if (categorizationFieldName === null) {
      return {
        examples: [],
        sampleSize: 0,
        overallValidStatus: CATEGORY_EXAMPLES_VALIDATION_STATUS.INVALID,
        validationChecks: [],
      };
    }

    const resp = await this._jobCreator.mlApi.jobs.categorizationFieldExamples(
      this._indexPatternTitle,
      this._query,
      NUMBER_OF_CATEGORY_EXAMPLES,
      categorizationFieldName,
      this._timeFieldName,
      this._jobCreator.start,
      this._jobCreator.end,
      analyzer,
      this._jobCreator.runtimeMappings ?? undefined,
      this._jobCreator.datafeedConfig.indices_options,
      this._jobCreator.projectRouting ?? undefined
    );
    return resp;
  }
}
