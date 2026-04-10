/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TutorialDefinition,
  TutorialStep,
  CleanupItem,
} from '../../../hooks/use_tutorial_content';
import { sampleTimeSeriesData } from './sample_data_sets';

const timeSeriesTutorialSteps: TutorialStep[] = [
  {
    id: 'create_template',
    type: 'apiCall',
    header: '## Step 1: Create an index template for time series',
    description:
      'Create an index template that configures a time series data stream (TSDS). The template defines dimension fields (for grouping), metric fields (for measurements), and a timestamp. The `index.mode: time_series` setting enables TSDS optimizations.',
    apiSnippet: `POST _index_template/kibana_sample_weather_index_template
{
  "index_patterns": [
    "kibana_sample_weather*"
  ],
  "data_stream": {},
  "priority": 100,
  "template": {
    "settings": {
      "index.mode": "time_series"
    },
    "mappings": {
      "properties": {
        "sensor_id": {
          "type": "keyword",
          "time_series_dimension": true
        },
        "location": {
          "type": "keyword",
          "time_series_dimension": true
        },
        "temperature": {
          "type": "float",
          "time_series_metric": "gauge"
        },
        "@timestamp": {
          "type": "date"
        }
      }
    }
  }
}`,
    valuesToInsert: [],
    valuesToSave: {
      template_acknowledged: 'acknowledged',
    },
    explanation:
      'Template creation acknowledged: {{template_acknowledged}}. The template maps `sensor_id` and `location` as dimensions (for grouping), `temperature` as a gauge metric, and `@timestamp` as the time field. Any data stream matching `kibana_sample_weather*` will use this configuration.',
  },
  {
    id: 'ingest_data',
    type: 'ingestData',
    header: '## Step 2: Ingest weather sensor data',
    description:
      'Create the `{{index_name}}` data stream by bulk-indexing sensor readings. The data stream is automatically created on first write because it matches the template pattern. Each sensor reading has the following shape:',
    apiSnippet: `POST /{{index_name}}/_bulk
{
  "@timestamp": "2026-03-01T08:00:00Z",
  "sensor_id": "STATION_1",
  "location": "base",
  "temperature": 24.1
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      bulk_items: 'items.length',
      has_errors: 'errors',
    },
    explanation:
      '{{bulk_items}} sensor readings were indexed. Errors: {{has_errors}}. The data stream `{{index_name}}` was created automatically on the first write. Data streams use `create` (not `index`) in bulk operations because they are append-only.',
  },
  {
    id: 'range_query',
    type: 'apiCall',
    header: '## Step 3: Query recent readings',
    description:
      'Search for the 5 most recent temperature readings sorted from highest to lowest. The `range` filter on `@timestamp` restricts results to a recent window.',
    apiSnippet: `GET kibana_sample_weather_data_stream/_search
{
  "size": 5,
  "query": {
    "range": {
      "@timestamp": {
        "gte": "2026-03-01T00:00:00Z",
        "lte": "2026-03-01T23:59:59Z"
      }
    }
  },
  "sort": [
    { "temperature": { "order": "desc" } }
  ]
}`,
    valuesToInsert: [],
    valuesToSave: {
      range_hits: 'hits.total.value',
      hottest_temp: 'hits.hits[0]._source.temperature',
      hottest_sensor: 'hits.hits[0]._source.sensor_id',
    },
    explanation:
      'Found **{{range_hits}}** readings in the time window. The hottest reading was **{{hottest_temp}}** from `{{hottest_sensor}}`. Sorting by temperature in descending order surfaces the highest values first.',
  },
  {
    id: 'sensor_aggregation',
    type: 'apiCall',
    header: '## Step 4: Aggregate temperature by sensor',
    description:
      'Use a `terms` aggregation on `sensor_id` with nested `date_histogram` and `avg`/`min`/`max` sub-aggregations to compute temperature statistics per sensor over daily intervals.',
    apiSnippet: `GET kibana_sample_weather_data_stream/_search
{
  "size": 0,
  "aggs": {
    "by_sensor": {
      "terms": {
        "field": "sensor_id"
      },
      "aggs": {
        "daily": {
          "date_histogram": {
            "field": "@timestamp",
            "calendar_interval": "1d"
          },
          "aggs": {
            "avg_temp": {
              "avg": {
                "field": "temperature"
              }
            },
            "min_temp": {
              "min": {
                "field": "temperature"
              }
            },
            "max_temp": {
              "max": {
                "field": "temperature"
              }
            }
          }
        }
      }
    }
  }
}`,
    valuesToInsert: [],
    valuesToSave: {
      sensor_bucket_count: 'aggregations.by_sensor.buckets.length',
      top_sensor: 'aggregations.by_sensor.buckets[0].key',
      top_sensor_docs: 'aggregations.by_sensor.buckets[0].doc_count',
    },
    explanation:
      'The aggregation grouped readings into **{{sensor_bucket_count}}** sensor buckets. The sensor with the most readings is `{{top_sensor}}` ({{top_sensor_docs}} readings). Each sensor bucket contains daily sub-buckets with average, min, and max temperature.',
  },
  {
    id: 'location_aggregation',
    type: 'apiCall',
    header: '## Step 5: Break down by sensor and location',
    description:
      'Add a nested `terms` aggregation on `location` inside each sensor bucket. This shows how dimension fields enable multi-level drill-down in time series data.',
    apiSnippet: `GET kibana_sample_weather_data_stream/_search
{
  "size": 0,
  "aggs": {
    "by_sensor": {
      "terms": {
        "field": "sensor_id"
      },
      "aggs": {
        "by_location": {
          "terms": {
            "field": "location"
          }
        },
        "daily": {
          "date_histogram": {
            "field": "@timestamp",
            "calendar_interval": "1d"
          },
          "aggs": {
            "avg_temp": {
              "avg": {
                "field": "temperature"
              }
            },
            "min_temp": {
              "min": {
                "field": "temperature"
              }
            },
            "max_temp": {
              "max": {
                "field": "temperature"
              }
            }
          }
        }
      }
    }
  }
}`,
    valuesToInsert: [],
    valuesToSave: {
      location_sensor_count: 'aggregations.by_sensor.buckets.length',
      first_sensor_locations: 'aggregations.by_sensor.buckets[0].by_location.buckets.length',
    },
    explanation:
      'Grouped into **{{location_sensor_count}}** sensor buckets, with the first sensor having **{{first_sensor_locations}}** distinct location(s). Nesting aggregations by dimension fields lets you slice data from broad (sensor) to narrow (location) — the foundation for monitoring dashboards.',
  },
  {
    id: 'pipeline_aggregation',
    type: 'apiCall',
    header: '## Step 6: Pipeline aggregation with moving function',
    description:
      'Use a pipeline aggregation to compute a moving sum over the last 3 hourly average temperatures. This demonstrates how to analyze trends in time series data by chaining aggregations together.',
    apiSnippet: `GET kibana_sample_weather_data_stream/_search
{
  "size": 0,
  "aggs": {
    "by_sensor": {
      "terms": {
        "field": "sensor_id",
        "size": 3
      },
      "aggs": {
        "hourly": {
          "date_histogram": {
            "field": "@timestamp",
            "calendar_interval": "1h"
          },
          "aggs": {
            "avg_temp": {
              "avg": {
                "field": "temperature"
              }
            },
            "moving_avg_temp": {
              "moving_fn": {
                "buckets_path": "avg_temp",
                "window": 3,
                "script": "MovingFunctions.sum(values)"
              }
            }
          }
        }
      }
    }
  }
}`,
    valuesToInsert: [],
    valuesToSave: {
      pipeline_sensors: 'aggregations.by_sensor.buckets.length',
    },
    explanation:
      'Computed moving temperature sums across **{{pipeline_sensors}}** top sensors. The `moving_fn` pipeline aggregation operates on the output of `avg_temp`, computing a rolling sum over a 3-bucket window. Pipeline aggregations are how you detect trends, anomalies, and patterns in time series data.',
  },
];

const timeSeriesTutorialCleanup: CleanupItem[] = [
  {
    label: 'Data stream: kibana_sample_weather_data_stream',
    apiSnippet: 'DELETE _data_stream/kibana_sample_weather_data_stream',
  },
  {
    label: 'Index template: kibana_sample_weather_index_template',
    apiSnippet: 'DELETE _index_template/kibana_sample_weather_index_template',
  },
];

export const timeSeriesTutorial: TutorialDefinition = {
  slug: 'time-series',
  title: 'Time series data streams',
  description:
    'Set up a time series data stream (TSDS) with dimension and metric fields, ingest sensor data, and run aggregations.',
  globalVariables: {
    index_name: 'kibana_sample_weather_data_stream',
  },
  sampleData: sampleTimeSeriesData,
  summary: {
    text: 'You created a time series data stream with dimension and metric fields, ingested sensor readings, queried by time range, and built multi-level aggregations including pipeline analytics. These patterns are the foundation for real-time monitoring dashboards.',
    links: [
      {
        label: 'Time series data streams (TSDS)',
        href: 'https://www.elastic.co/docs/manage-data/data-store/data-streams/time-series-data-stream-tsds',
      },
      {
        label: 'Aggregations guide',
        href: 'https://www.elastic.co/docs/explore-analyze/query-filter/aggregations',
      },
      {
        label: 'Create dashboards with Lens',
        href: 'https://www.elastic.co/docs/explore-analyze/visualize/lens',
      },
    ],
  },
  steps: timeSeriesTutorialSteps,
  cleanup: timeSeriesTutorialCleanup,
};
