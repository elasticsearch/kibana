/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { ExpressionsServerSetup } from '@kbn/expressions-plugin/server';
import type { PluginStart as DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type { FieldFormatsSetup, FieldFormatsStart } from '@kbn/field-formats-plugin/server';
import type { ConfigSchema } from './config';
import type { ISearchSetup, ISearchStart } from './search';
import { DatatableUtilitiesService } from './datatable_utilities';
import { SearchService } from './search/search_service';
import { QueryService } from './query/query_service';
import { ScriptsService } from './scripts';
import { KqlTelemetryService } from './kql_telemetry';
import { getUiSettings } from './ui_settings';
import type { QuerySetup } from './query';
import { dateRangePickerPresetsUserStorageRegistration } from './date_range_picker_presets';

export interface DataPluginSetup {
  search: ISearchSetup;
  query: QuerySetup;
  /**
   * @deprecated - use "fieldFormats" plugin directly instead
   */
  fieldFormats: FieldFormatsSetup;
}

export interface DataPluginStart {
  search: ISearchStart;
  /**
   * @deprecated - use "fieldFormats" plugin directly instead
   */
  fieldFormats: FieldFormatsStart;
  indexPatterns: DataViewsServerPluginStart;

  /**
   * Datatable type utility functions.
   */
  datatableUtilities: DatatableUtilitiesService;
}

export interface DataPluginSetupDependencies {
  expressions: ExpressionsServerSetup;
  usageCollection?: UsageCollectionSetup;
  fieldFormats: FieldFormatsSetup;
}

export interface DataPluginStartDependencies {
  fieldFormats: FieldFormatsStart;
  logger: Logger;
  dataViews: DataViewsServerPluginStart;
}

export class DataServerPlugin
  implements
    Plugin<
      DataPluginSetup,
      DataPluginStart,
      DataPluginSetupDependencies,
      DataPluginStartDependencies
    >
{
  private readonly searchService: SearchService;
  private readonly scriptsService: ScriptsService;
  private readonly kqlTelemetryService: KqlTelemetryService;
  private readonly queryService = new QueryService();
  private readonly logger: Logger;
  private readonly config: ConfigSchema;

  constructor(initializerContext: PluginInitializerContext<ConfigSchema>) {
    this.logger = initializerContext.logger.get('data');
    this.config = initializerContext.config.get();
    this.searchService = new SearchService(initializerContext, this.logger);
    this.scriptsService = new ScriptsService();
    this.kqlTelemetryService = new KqlTelemetryService(initializerContext);
  }

  public setup(
    core: CoreSetup<DataPluginStartDependencies, DataPluginStart>,
    { expressions, usageCollection, fieldFormats }: DataPluginSetupDependencies
  ) {
    this.scriptsService.setup(core);
    const querySetup = this.queryService.setup(core);
    this.kqlTelemetryService.setup(core, { usageCollection });

    core.uiSettings.register(getUiSettings(core.docLinks, this.config.enableUiSettingsValidations));
    core.userStorage.register(dateRangePickerPresetsUserStorageRegistration);

    const searchSetup = this.searchService.setup(core, {
      expressions,
      usageCollection,
    });

    return {
      search: searchSetup,
      query: querySetup,
      fieldFormats,
    };
  }

  public start(core: CoreStart, { fieldFormats, dataViews }: DataPluginStartDependencies) {
    const search = this.searchService.start(core, {
      fieldFormats,
      indexPatterns: dataViews,
    });
    const datatableUtilities = new DatatableUtilitiesService(
      search.aggs,
      dataViews,
      fieldFormats,
      core.uiSettings
    );

    return {
      datatableUtilities,
      search,
      fieldFormats,
      indexPatterns: dataViews,
    };
  }

  public stop() {
    this.searchService.stop();
  }
}

export { DataServerPlugin as Plugin };
