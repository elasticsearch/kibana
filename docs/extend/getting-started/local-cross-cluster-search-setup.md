---
navigation_title: "Local cross cluster search setup"
description: "Local cross cluster search setup"
---

# Local cross cluster search setup

### Local CCS (cross cluster search) instructions
* Spin up a "remote" instance of Elasticsearch (this needs to start before the "local" instance for some odd reason):
```
yarn es snapshot -E http.port=9500 -E transport.port=9600 -E path.data=../remote
```

* Spin up the "local" instance of Elasticsearch:
```
yarn es snapshot
```

* Load data into both the "remote" and "local" clusters:
```
node scripts/makelogs.js -c 100000 -d 100/10 --url elastic:changeme@localhost:9500
node scripts/makelogs.js -c 100000 -d 100/10 --url elastic:changeme@localhost:9200
```

* Spin up Kibana:
```
yarn start
```

Once it is running, do the following:
* Open http://localhost:5601/app/management/data/remote_clusters
* Click "Add a remote cluster"
* Choose a name, put "localhost:9600" for "Seed nodes", and save (check "Yes, I have setup trust")
* Make sure the connection status is "Connected"
* Open http://localhost:5601/app/management/kibana/dataViews
* Click "Create data view"
* For "Index pattern", put "logstash-\*,\*:logstash-\*" (the asterisk indicates all remote clusters) and save
* Go to Discover and select your data view, and it should be querying using CCS