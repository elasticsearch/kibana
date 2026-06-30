---
navigation_title: "Security Kibana System User"
description: "This guide provides an overview of `kibana_system` user"
---

# Security Kibana System User

## The `kibana_system` user

The Kibana server authenticates to Elasticsearch using the `elastic/kibana` [service account](https://www.elastic.co/guide/en/elasticsearch/reference/current/service-accounts.html#service-accounts-explanation). This service account has privileges that are equivilent to the `kibana_system` reserved role, whose descriptor is managed in the Elasticsearch repository ([source link](https://github.com/elastic/elasticsearch/blob/430cde6909eae12e1a90ac2bff29b71cbf4af18b/x-pack/plugin/core/src/main/java/org/elasticsearch/xpack/core/security/authz/store/KibanaOwnedReservedRoleDescriptors.java#L58)).
The vast majority of features will not require changes to the `kibana_system` user privileges. Changes to these privileges must be carefully considered, as we do not want the `kibana_system` account to have access to user data.

### Guiding principals

Consider these guidelines when reviewing changes to the `kibana_system` role descriptor.

#### 1. Kibana should only access system and hidden indices

- System indices are managed entirely by the stack, and should never be accessed by end users.
- Hidden indices are _typically_ managed by the stack, but _may_ be accessed by end users.
- Data indices are those which an end user could conceivably create on their own. As a general rule, users can create indices of any pattern so long as it does not begin with a \``.`\` (dot). Users can also create hidden indices, so it is important that documentation exists for any stack-managed hidden indices to reduce the chance of conflict with user-managed indices.

Therefore, Kibana should not have access to non-system indices which do not begin with a \``.`\` (dot).

Kibana should also not have the ability to modify system/hidden indices for which it is not the owner.

##### Examples
| Index Type | Allowed Permissions | Examples |
|-------|--------|-----
| User-defined data index | none | `my-data`, `kibana-metrics` |
| System index not owned by Kibana | `read` | `.security` |
| System indices owned by Kibana | `all` | `.kibana*`, '.fleet*' |

#### Decision tree

##### Exceptions for telemetry
Exceptions to this rule have been made in the past to aid in telemetry collection. This is not something we want to support long-term, but there aren't viable alternatives at the moment without a significant redesign. 

##### Exceptions for Fleet package lifecycle management
Fleet maintains the lifecycle of certain packages. These packages need to be upgraded during stack upgrades, and therefore have to happen in an automated fashion. The `kibana_system` user has elevated privileges to a set of **data incides** to facilitate this.

If the set of indices managed by Fleet changes, we should ensure that they update [the documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-templates.html) to make note of index naming collisions.

#### 2. Kibana should not have the ability to manage security constructs.

This includes:
- Users
- Roles
- Role Mappings

### Rationale

These guidelines exist for two primary reasons.

#### Reduce impact of account compromise
Compromised `kibana_system` credentials can severely impact an installation. We want to make sure that this doesn't become catastrophic. More privileges == more potential damage. We shouldn't add privileges unnecessarily. We should remove privileges as soon as they aren't needed anymore.

Credentials can be compromised in a number of ways:
1. Insecure storage (e.g. `kibana.yml`, a post-it note, etc.).
2. Kibana server host compromise.
3. Kibana server runtime compromise (e.g. RCE).

#### Reduce impact of developer error
Kibana allows engineers to call ES using different sets of credentials:
1. `kibana_system` credentials. 
2. End-user credentials.

An authorization bypass could occur if an engineer accidentally uses the `kibana_system` credentials when they intended to use end-user credentials. See [Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/).