---
navigation_title: "Guidelines for Terraform friendly HTTP APIs"
description: "Guidelines for designing Terraform friendly HTTP APIs"
---

# Guidelines for Terraform friendly HTTP APIs

:::{note} Think Holistically
These guidelines are **recommended but not mandatory**. Deviating from them will increase the effort required on the Terraform provider side to consume your APIs effectively. Adhering to these guidelines ensures smoother integration and reduces the implementation burden for infrastructure-as-code consumers.
:::

Kibana's role has expanded beyond the UI. APIs have become the backbone for how customers automate their workflows, build custom scripts, and create their own integrations. With GitOps becoming the standard and Terraform establishing itself as the go-to infrastructure-as-code tool, HTTP APIs are now business-critical. The rise in Search AI means that it's more important than ever to make sure our APIs are easily understood by LLMs.

For Terraform to be a first class citizen, the provider needs to cover resources that weren't available before—think Dashboards, Visualizations, Data Views, and Detection Rules. This means we need to build REST APIs that follow the OpenAPI Specification properly, making it straightforward for teams to manage these resources as code through GitOps workflows.

These guidelines will help you build APIs that are easy to use, whether someone's automating with scripts or managing infrastructure at scale.

## Terraform provider developer-friendly API design

Terraform can work with any API, but some APIs are easier to deal with than others. Here are some tips to make your API more Terraform provider-friendly:

#### Example

The [Index Lifecycle Management API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ilm-put-lifecycle) (PUT /\_ilm/policy/\{policy\}) declaratively defines the desired lifecycle state rather than imperatively executing phase transitions:

```
PUT _ilm/policy/my_ilm_policy
{
  "policy": {
    "_meta": {
      "description": "used for nginx log",
      "project": {
        "name": "myProject",
        "department": "myDepartment"
      }
    },
    "phases": {
      "warm": {
        "min_age": "10d",
        "actions": {
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

[Corresponding resource configuration](https://registry.terraform.io/providers/elastic/elasticstack/latest/docs/resources/elasticsearch_index_lifecycle)

```
provider "elasticstack" {
  elasticsearch {}
}

resource "elasticstack_elasticsearch_index_lifecycle" "my_ilm" {
  name = "my_ilm_policy"

  warm {
    min_age = "10d"
    forcemerge {
      "max_num_segments": 1
    }
  }

  delete {
    min_age = "30d"
    delete {}
  }
}
```

#### API imposed challenges

API design decisions can create real challenges for Terraform resource implementation. The Elasticsearch [Index Settings API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-put-settings) (\`PUT /\{index\}/\_settings\`) treats static settings (which require index recreation) and dynamic settings (which can be updated in place) identically. This creates a complex situation forcing the implementation to handle all settings together because the API doesn't offer a way to distinguish them upfront.

```bash
{
  "error": {
    "reason": "Can't update non dynamic settings [[index.codec, index.number_of_shards]] for open indices"
}
```

[Index settings update bug](https://github.com/elastic/terraform-provider-elasticstack/issues/52)

A better API design would separate these concerns with different endpoints or provide metadata about which settings require recreation.

### Handle resource references and dependencies

Terraform configurations frequently define multiple resources that depend on each other. Your API design needs to account for these interdependencies in a way that enables Terraform's declarative model to work smoothly.

#### Use stable, predictable resource identifiers

Resource references must use identifiers that remain stable throughout a resource's lifecycle and across operations:

```json
// Resource reference using stable ID
{
  "name": "My Report",
  "space_id": "marketing",            // Reference to a space by ID
  "visualization_ids": ["vis-123"]    // References to visualizations by ID
}
```

Note: provide users with a way to choose their own ID when creating resources, otherwise use auto-generated UUIDs.

#### Support referencing resources by identifiers, not just names

Ensure your API accepts references by ID, not just by name or other properties that may change:

```typescript
// Good: Reference by ID
router.post(
  {
    path: '/api/alerting/rule',
    validate: {
      body: schema.object({
        name: schema.string(),
        space_id: schema.string(),       // Space ID reference
        actions: schema.arrayOf(schema.object({
          connector_id: schema.string(), // Connector ID reference
          group: schema.string(),
          // etc.
        }))
      })
    }
  },
  handler
);
```

#### Use consistent reference patterns across APIs

Apply the same patterns for referencing resources across all your APIs:

1. **Consistent naming**: Use the same suffix for IDs (e.g., `space_id`, `dashboard_id`, etc.).
2. **Consistent structure**: Use the same structure for referencing resources in all APIs.
3. **Consistent validation**: Apply the same validation rules across all APIs.

#### Example: Resource with dependencies

```typescript
// Generic object API that references other objects and spaces
router.post(
  {
    path: '/api/objects/object',
    validate: {
      body: schema.object({
        title: schema.string(),
        description: schema.maybe(schema.string()),
        // Reference to space by ID
        space_id: schema.string(),
        // References to other objects by ID
        other_objects: schema.arrayOf(
          schema.object({
            object_id: schema.string(),
          })
        )
      })
    }
  },
  async (context, request, response) => {
    // Implementation with dependency validation
    const validationResult = await validateDependencies(request);
    if (!validationResult.valid) {
      return response.badRequest({
        body: {
          message: 'Validation failed',
          validation: {
            dependencies: validationResult.errors
          }
        }
      });
    }

    // Proceed with creation
    // ...
  }
);
```

##### Complex configuration handling

Complex mappings (e.g. saved objects) make life difficult but not impossible. One *can* make complex mappings readable through JSON encoding:

```
mappings = jsonencode({
  properties = {
    user = {
      properties = {
        name = { type = "text" }
        age  = { type = "integer" }
      }
    }
  }
})
```

The hickup here is with validation. Terraform just isn't designed to do validation (or testing!) like we would with conventional languages.
It doesn’t validate what strings contain, only that they're parsable during terraform plan.
Resource developers often fall back to the API layer for validation checks, that can lead to plan/apply issues.

### Return errors early—and all at once

If your API can validate inputs upfront and return all the errors in one go, do it\! Terraform handles it and shows them in a helpful way:

```typescript
// PUT /api/alerting/rule/{id}
...
  response: {
    200: {
      body: () => ruleResponseSchemaV1,
      description: 'Indicates a successful call.',
    },
    400: {
      description: 'Indicates an invalid schema or parameters.',
    },
    403: {
      description: 'Indicates that this call is forbidden.',
    },
    404: {
      description: 'Indicates a rule with the given ID does not exist.',
    },
    409: {
      description: 'Indicates that the rule has already been updated by another user.',
    },
  },
...
```
When validation only happens during execution, catching errors early becomes impossible. For example, ILM policy structure errors only surface during API calls:

```bash
Error: Failed to build [allocate] after last required field arrived
Detail: [allocate] exclude doesn't support values of type: VALUE_STRING
```

[ILM import issues](https://github.com/elastic/terraform-provider-elasticstack/issues/87)

The cost of not catching errors early is interrupted workflow, repetitive plan/apply failures and frustrated consumers.

### Return as much as you can, and handle defaults carefully

Terraform needs complete information to track resource state effectively. If your API doesn't return enough details, Terraform can't properly detect changes or manage drift. For this reason, **the overall recommendation is to _return as much information as possible and define the optional attributes in the [Terraform provider](https://github.com/elastic/terraform-provider-elasticstack/tree/main/internal/kibana) as `Optional: true, Default: <default value>`._**

**The challenge with defaults**

Many Kibana APIs have extensive configuration options. Requiring users to specify every single value would create verbose, unwieldy configurations. We need to keep in mind that changing a default may cause Terraform to get out-of-sync and so view changes to defaults as a breaking change until we can update our provider.

[Our tests](https://github.com/elastic/kibana-team/issues/2001) show the following facts:

* Defining a resource attribute as `Optional: true, Default: <default value>` (_recommended_) provides a more consistent behavior to the user (it identifies external changes, and ensures a consistent default value fixed by their Terraform Provider's version), but can restrict the Terraform provider's version support matrix: if Kibana changes the default value, Terraform won't know about the change until the Terraform resource configuration gets updated. Keep in mind that our Terraform provider doesn't follow the Stack release cycle, so we can't guarantee that the default value will be the same as the one in the Stack. Also, the opposite can occur: a more recent version of the Terraform provider may have a default value that is not supported by an older version of Kibana. However, there is an easy workaround: the user can define a valid value if this occurs.
* Resource attributes defined as `Optional: true, Computed: true`: Terraform won't detect changes unless explicitly defined by the Terraform user. This means we can change the defaults, choose not to return it, and UI users can manually change that attribute without Terraform noticing the change if no explicit value is provided by the user in their terraform definition.
* The API can return fields that Terraform doesn't understand (e.g.: a new version of Kibana returns extra fields in the response, or it returns fields that Terraform users shouldn't be concerned about like `last_updated` or `created_by`): Terraform dismisses them when comparing the resource.

This is why the overall recommendation is to return as much information as possible and define the optional attributes in the [Terraform provider](https://github.com/elastic/terraform-provider-elasticstack/tree/main/internal/kibana) as `Optional: true, Default: <default value>`.

**So can't I return slimmed-down information?**

If you have a use case where you'd like your API to remove defaults from the response, you can do so, but we recommend that you add a query parameter to control stripping defaults so that Terraform can always retrieve them by requesting the full response.

### Be predictable

Terraform relies on the same input resulting in the same output. Avoid using fields like "last modified time"—Terraform can’t compare those meaningfully. This can be tricky with sensitive fields or when your API relies on randomness.

Constantly changing fields in API responses create a difficult situation for Terraform implementations because they cause constant drift.

Timestamps and other time-based fields aren’t predictable:

```
settings {
  setting {
    name = "index.creation_date"      # Timestamp varies
    value = "1643651976221"           # Unix timestamp changes
  }
}
```

The [Alerting Rules API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-alerting-rule-id) is another example, where execution status data changes on every read:

```
"execution_status": {
  "status": "active",
  "last_execution_date": "2023-12-07T22:36:41.358Z",  // Changes on every read
  "last_duration": 736
}
```

Users see Terraform detecting "changes" on every refresh, even when nothing in their configuration has actually changed!

An alternative is to separate volatile runtime data from stable configuration data in responses:

```json
{
  "config": {
    "name": "my-alert",
    "enabled": true,
    "params": {...}
  },
  "runtime_info": {
    "last_execution": "2023-12-07T22:36:41.358Z",
    "execution_count": 42
  }
}
```

Volatile fields create a challenging choice: include them (causing constant configuration drift) or exclude them (losing valuable runtime information).

Including and separating them makes it easier for the TF provider to specifically ignore sets of fields (marking them as [readonly](https://registry.terraform.io/providers/elastic/elasticstack/latest/docs/resources/kibana_alerting_rule#read-only)) but needs to be built into the client generator.

### Ignore the robustness principle: don’t normalize output

The robustness principle says to accept input in various formats but return output in a consistent format, for example converting strings to lowercase, ordering elements in a list or changing whitespace in \`json\` strings.

For Terraform, don’t do this.

Terraform does byte-for-byte comparisons, so normalized output forces provider developers to implement logic to handle different data formats, ordering, capitalization variations and other unnecessary complexity.

Fortunately, the kibana client hasn’t needed to handle complex normalization yet. Let’s keep it that way, return data exactly as you received it.
Follow these tips, and you'll make your API a dream to work with for Terraform provider developers.

### Example

The spaces API follows these guidelines and makes resource management with Terraform ideal.

Compare the [OAS specs](https://www.elastic.co/docs/api/doc/kibana/v9/operation/operation-get-spaces-space-id) with the [spaces resource configuration](https://registry.terraform.io/providers/elastic/elasticstack/latest/docs/resources/kibana_space) and you'll see why:

*Get a space*

```
GET /api/spaces/space/{id}
```

```
curl \
 --request GET 'http://localhost:5622/api/spaces/space/{id}' \
 --header "Authorization: $API_KEY" \
 --header "elastic-api-version: 2023-10-31"
```

Returns 200

```
{
  "id": "test_space",
  "name": "Test Space",
  "color": null,
  "imageUrl": "",
  "initials": "ts",
  "solution": "es",
  "description": "A fresh space for testing visualisati*ons",
  "disabledFeatures": [ingestManager", "enterpriseSearch"]
}
```

*elasticstack_kibana_space*

```
provider "elasticstack" {
  kibana {}
}

resource "elasticstack_kibana_space" "example" {
  space_id          = "test_space"
  name              = "Test Space"
  description       = "A fresh space for testing visualisations"
  disabled_features = ["ingestManager", "enterpriseSearch"]
  initials          = "ts"
}
```