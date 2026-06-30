---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/running-elasticsearch.html
---

# Running Elasticsearch during development [running-elasticsearch]

There are many ways to run {{es}} while you are developing.


### By snapshot [_by_snapshot]

This will run a snapshot of {{es}} that is usually built nightly. Snapshot status is available on the [dashboard](https://ci.kibana.dev/es-snapshots).

```bash
yarn es snapshot
```

By default, two users are added to Elasticsearch:

* A superuser with username: `elastic` and password: `changeme`, which can be used to log into Kibana with.
* A user with username: `kibana_system` and password `changeme`. This account is used by the Kibana server to authenticate itself to Elasticsearch, and to perform certain actions on behalf of the end user. These credentials should be specified in your kibana.yml as described in [Configure security](docs-content://deploy-manage/security/secure-your-cluster-deployment.md)

See all available options, like how to specify a specific license, with the `--help` flag.

```bash
yarn es snapshot --help
```

`--license trial` will give you access to all capabilities.

**Keeping data between snapshots**

If you want to keep the data inside your {{es}} between usages of this command, you should use the following command, to keep your data folder outside the downloaded snapshot folder:

```bash
yarn es snapshot -E path.data=../data
```

## By source [_by_source]

If you have the {{es}} repo checked out locally and wish to run against that, use `source`. By default, it will reference an {{es}} checkout which is a sibling to the {{kib}} directory named elasticsearch. If you wish to use a checkout in another location you can provide that by supplying --source-path

```bash
yarn es source
```


## From an archive [_from_an_archive]

Use this if you already have a distributable. For released versions, one can be obtained on the {{es}} downloads page.

```bash
yarn es archive <full_path_to_archive>
```

Each of these will run {{es}} with a basic license. Additional options are available, pass --help for more information.


## From a remote host [_from_a_remote_host]

You can save some system resources, and the effort of generating sample data, if you have a remote {{es}} cluster to connect to.

You’ll need to create a kibana.dev.yml ([Customizing `config/kibana.dev.yml`](/extend/getting-started/set-up-a-development-environment.md)) and add the following to it:

```bash
elasticsearch.hosts:
  - {{ url }}
elasticsearch.username: {{ username }}
elasticsearch.password: {{ password }}
elasticsearch.ssl.verificationMode: none
```

### Running remote clusters [_running_remote_clusters]

Setup remote clusters for cross cluster search (CCS) and cross cluster replication (CCR).

Start your primary cluster by running:

```bash
yarn es snapshot -E path.data=../data_prod1
```

Start your remote cluster by running:

```bash
yarn es snapshot -E transport.port=9500 -E http.port=9201 -E path.data=../data_prod2
```

Once both clusters are running, start {{kib}}. {{kib}} will connect to the primary cluster.

Setup the remote cluster in {{kib}} from either Management → {{es}} → Remote Clusters UI or by running the following script in Console.

```bash
PUT _cluster/settings
{
  "persistent": {
    "cluster": {
      "remote": {
        "cluster_one": {
          "seeds": [
            "localhost:9500"
          ]
        }
      }
    }
  }
}
```

Follow the cross-cluster search instructions for setting up index patterns to search across clusters ([Use {{data-sources}} with {{ccs}}](docs-content://explore-analyze/find-and-organize/data-views.md#management-cross-cluster-search)).
