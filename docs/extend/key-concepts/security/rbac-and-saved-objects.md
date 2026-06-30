---
navigation_title: "RBAC and the Saved Objects client"
description: "How role-based access control is enforced through the Saved Objects client, and how Kibana privileges map to Elasticsearch application privileges."
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/development-security.html
---

# RBAC and the Saved Objects client [development-security]

{{kib}} has generally been able to implement security transparently to core and plugin developers, and this largely remains the case. {{kib}} relies on two methods that the {{es}} `Cluster` provides: `callWithRequest` and `callWithInternalUser`.

`callWithRequest` executes requests against {{es}} using the authentication credentials of the {{kib}} end-user. So, if you log into {{kib}} with the user of `foo` when `callWithRequest` is used, {{kib}} executes the request against {{es}} as the user `foo`. Historically, `callWithRequest` has been used extensively to perform actions that are initiated at the request of {{kib}} end-users.

`callWithInternalUser` executes requests against {{es}} using the internal {{kib}} server user, and has historically been used for performing actions that aren't initiated by {{kib}} end users; for example, creating the initial `.kibana` index or performing health checks against {{es}}.

However, with the changes that role-based access control (RBAC) introduces, this is no longer cut and dry. {{kib}} now requires all access to the `.kibana` index to go through the `SavedObjectsClient`. This used to be a best practice, as the `SavedObjectsClient` was responsible for translating the documents stored in {{es}} to and from Saved Objects, but RBAC is now taking advantage of this abstraction to implement access control and determine when to use `callWithRequest` versus `callWithInternalUser`.

## Role-based access control [development-rbac]

Role-based access control (RBAC) in {{kib}} relies upon the [application privileges](elasticsearch://reference/elasticsearch/security-privileges.md#application-privileges) that {{es}} exposes. This allows {{kib}} to define the privileges that {{kib}} wishes to grant to users, assign them to the relevant users using roles, and then authorize the user to perform a specific action. This is handled within a secured instance of the `SavedObjectsClient` and available transparently to consumers when using `request.getSavedObjectsClient()` or `savedObjects.getScopedSavedObjectsClient()`.

### {{kib}} privileges [development-rbac-privileges]

When {{kib}} first starts up, it executes the following `POST` request against {{es}}. This synchronizes the definition of the privileges with various `actions` which are later used to authorize a user:

```js subs=true
POST /_security/privilege
Content-Type: application/json
Authorization: Basic {{kib}} changeme

{
   "kibana-.kibana":{
       "all":{
           "application":"kibana-.kibana",
           "name":"all",
           "actions":[
               "version:7.0.0-alpha1-SNAPSHOT",
               "action:login",
               "action:*"
           ],
           "metadata":{}
       },
       "read":{
           "application":"kibana-.kibana",
           "name":"read",
           "actions":[
               "version:7.0.0-alpha1-SNAPSHOT",
               "action:login",
               "saved_object:dashboard/get",
               "saved_object:dashboard/bulk_get",
               "saved_object:dashboard/find",
               ...
           ],"metadata":{}}
   }
}
```

::::{note}
The application is created by concatenating the prefix of `kibana-` with the value of `kibana.index` from the `kibana.yml`, so different {{kib}} tenants are isolated from one another.
::::

### Assigning {{kib}} privileges [development-rbac-assigning-privileges]

{{kib}} privileges are assigned to specific roles using the `applications` element. For example, the following role assigns the [all](docs-content://deploy-manage/users-roles/cluster-or-deployment-auth/kibana-privileges.md#kibana-privileges-all) privilege at `*` `resources` (which will in the future be used to secure spaces) to the default {{kib}} `application`:

```js
"new_kibana_user": {
   "applications": [
     {
       "application": "kibana-.kibana",
       "privileges": [
         "all"
       ],
       "resources": [
         "*"
       ]
     }
   ]
 }
```

Roles that grant [{{kib}} privileges](docs-content://deploy-manage/users-roles/cluster-or-deployment-auth/kibana-privileges.md) should be managed using the [role APIs](https://www.elastic.co/docs/api/doc/kibana/group/endpoint-roles) or the **Management → Security → Roles** page, not directly using the {{es}} [role management API](https://www.elastic.co/docs/api/doc/elasticsearch/group/endpoint-security). This role can then be assigned to users using the {{es}} [user management APIs](https://www.elastic.co/docs/api/doc/elasticsearch/group/endpoint-security).

### Authorization [development-rbac-authorization]

The {{es}} [has privileges API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-has-privileges) determines whether the user is authorized to perform a specific action:

```js
POST /_security/user/_has_privileges
Content-Type: application/json
Authorization: Basic foo_read_only_user password

{
   "applications":[
       {
           "application":"kibana-.kibana",
           "resources":["*"],
           "privileges":[
             "saved_object:dashboard/save",
           ]
       }
   ]
}
```

{{es}} checks if the user is granted a specific action. If the user is assigned a role that grants a privilege, {{es}} uses the [{{kib}} privileges](#development-rbac-privileges) definition to associate this with the actions, which makes authorizing users more intuitive and flexible programmatically.

Once we have authorized the user to perform a specific action, we can execute the request using `callWithInternalUser`.

## Related topics

- [Feature privileges](./feature-privileges.md) — register features and define the privileges that map to them.
- [API authorization](./api-authorization.md) — how API routes declare required privileges.
- [Kibana system user](./system-user.md) — what the `kibana_system` service account can and cannot do.
