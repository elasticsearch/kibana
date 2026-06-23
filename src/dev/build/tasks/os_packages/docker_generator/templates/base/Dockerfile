################################################################################
# This Dockerfile was generated from the template at:
#   src/dev/build/tasks/os_packages/docker_generator/templates/Dockerfile
#
# Beginning of multi stage Dockerfile
################################################################################

################################################################################
# Build stage 0 `builder`:
# Extract Kibana artifact
################################################################################
FROM {{{baseImageName}}} AS builder

{{#ubi}}
RUN microdnf install -y findutils tar gzip{{#tarZstd}} zstd{{/tarZstd}}
{{/ubi}}
{{#wolfi}}
RUN for iter in 1 2 3 4 5; do \
      apk --no-cache add curl gnutar=1.35-r8{{#tarZstd}} zstd{{/tarZstd}} && break; \
      echo "apk add failed (attempt $iter/5), retrying in $((iter * 10))s..."; \
      sleep $((iter * 10)); \
      [ $iter -eq 5 ] && exit 1; \
    done
{{/wolfi}}

{{#usePublicArtifact}}
RUN cd /tmp && \
  {{#wolfi}}arch="$(apk --print-arch)"{{/wolfi}}{{#ubi}}arch="$(rpm --query --queryformat='%{ARCH}' rpm)"{{/ubi}} && \
  curl -f --retry 8 -s -L \
    --output kibana.tar.gz \
     https://{{publicArtifactSubdomain}}.elastic.co/downloads/kibana/{{artifactPrefix}}-${arch}.tar.gz && \
  cd -
{{/usePublicArtifact}}
{{^usePublicArtifact}}
COPY {{artifactTarball}} /tmp/kibana.{{tarExt}}
{{/usePublicArtifact}}

RUN mkdir /usr/share/kibana
WORKDIR /usr/share/kibana
RUN tar \
  --strip-components=1 \
  {{#tarZstd}}-I zstd -xf{{/tarZstd}}{{^tarZstd}}-zxf{{/tarZstd}} /tmp/kibana.{{tarExt}}

# Ensure that group permissions are the same as user permissions.
# This will help when relying on GID-0 to run Kibana, rather than UID-1000.
# OpenShift does this, for example.
# REF: https://docs.openshift.org/latest/creating_images/guidelines.html
RUN chmod -R g=u /usr/share/kibana

# Add an init process, check the checksum to make sure it's a match
RUN set -e ; \
    TINI_BIN="" ; \
    {{#wolfi}}arch="$(apk --print-arch)"{{/wolfi}}{{#ubi}}arch="$(rpm --query --queryformat='%{ARCH}' rpm)"{{/ubi}}; \
    case "$arch" in \
        aarch64) \
            TINI_BIN='tini-arm64' ; \
            TINI_CHECKSUM='07952557df20bfd2a95f9bef198b445e006171969499a1d361bd9e6f8e5e0e81' ; \
            ;; \
        x86_64) \
            TINI_BIN='tini-amd64' ; \
            TINI_CHECKSUM='93dcc18adc78c65a028a84799ecf8ad40c936fdfc5f2a57b1acda5a8117fa82c' ; \
            ;; \
        *) echo >&2 "Unsupported architecture $arch" ; exit 1 ;; \
    esac ; \
  TINI_VERSION='v0.19.0' ; \
  curl -f --retry 8 -S -L -O "https://github.com/krallin/tini/releases/download/${TINI_VERSION}/${TINI_BIN}" ; \
  echo "${TINI_CHECKSUM} ${TINI_BIN}" | sha256sum -c - ; \
  mv "${TINI_BIN}" /bin/tini ; \
  chmod +x /bin/tini
{{^serverless}}
RUN mkdir -p /usr/share/fonts/local && \
  curl --retry 8 -S -L -o /usr/share/fonts/local/NotoSansCJK-Regular.ttc https://github.com/googlefonts/noto-cjk/raw/NotoSansV2.001/NotoSansCJK-Regular.ttc && \
  echo "5dcd1c336cc9344cb77c03a0cd8982ca8a7dc97d620fd6c9c434e02dcb1ceeb3  /usr/share/fonts/local/NotoSansCJK-Regular.ttc" | sha256sum -c -
{{/serverless}}

{{#cloud}}
COPY {{filebeatTarball}} /tmp/filebeat.tar.gz
COPY {{metricbeatTarball}} /tmp/metricbeat.tar.gz

RUN mkdir -p /opt/filebeat /opt/metricbeat && \
  tar xf /tmp/filebeat.tar.gz -C /opt/filebeat --strip-components=1 && \
  tar xf /tmp/metricbeat.tar.gz -C /opt/metricbeat --strip-components=1
{{/cloud}}

################################################################################
# Build stage 1 (the actual Kibana image):
#
# Copy kibana from stage 0
# Add entrypoint
################################################################################
FROM {{{baseImageName}}}
EXPOSE 5601

{{#ubi}}
RUN microdnf install --setopt=tsflags=nodocs -y \
      fontconfig liberation-fonts-common freetype shadow-utils nss findutils && \
      microdnf clean all
{{/ubi}}
{{#wolfi}}
# Wolfi updated glibc from 2.42 to 2.43, which changed memory allocation behavior. This flag disables the new behavior.
ENV GLIBC_TUNABLES=glibc.malloc.hugetlb=0

RUN for iter in 1 2 3 4 5; do \
      apk --no-cache add bash curl fontconfig font-liberation libstdc++ libnss findutils shadow ca-certificates{{#serverless}} libjemalloc2 mimalloc2{{/serverless}} && break; \
      echo "apk add failed (attempt $iter/5), retrying in $((iter * 10))s..."; \
      sleep $((iter * 10)); \
      [ $iter -eq 5 ] && exit 1; \
    done
{{/wolfi}}

# Bring in Kibana from the initial stage.
COPY --from=builder --chown=1000:0 /usr/share/kibana /usr/share/kibana
COPY --from=builder --chown=0:0 /bin/tini /bin/tini
{{#cloud}}
COPY --from=builder --chown=0:0 /opt /opt
{{/cloud}}
{{^serverless}}
# Load reporting fonts
COPY --from=builder --chown=0:0 /usr/share/fonts/local/NotoSansCJK-Regular.ttc /usr/share/fonts/local/NotoSansCJK-Regular.ttc
RUN fc-cache -v
{{/serverless}}
WORKDIR /usr/share/kibana

RUN ln -s /usr/share/kibana /opt/kibana

{{! Please notify @elastic/kibana-security if you want to remove or change this environment variable. }}
{{! Kibana applications may depend on the ELASTIC_CONTAINER value. Screenshotting uses this to conditionally disable the Chromium sandbox when launching Puppeteer. }}
ENV ELASTIC_CONTAINER=true
ENV PATH=/usr/share/kibana/bin:$PATH

# Set some Kibana configuration defaults.
COPY --chown=1000:0 config/kibana.yml /usr/share/kibana/config/kibana.yml
{{#serverless}}
ENV PROFILER_SIGNAL=SIGUSR1
{{/serverless}}
{{#fips}}

RUN /bin/echo -e '\n--enable-fips' >> config/node.options
COPY --chown=1000:0 openssl/nodejs.cnf "/usr/share/kibana/config/nodejs.cnf"
ENV OPENSSL_CONF=/usr/share/kibana/config/nodejs.cnf
ENV OPENSSL_MODULES=/usr/lib64/ossl-modules
RUN /bin/echo -e '\nxpack.security.fipsMode.enabled: true' >> config/kibana.yml

{{/fips}}

# Add the launcher/wrapper script. It knows how to interpret environment
# variables and translate them to Kibana CLI options.
COPY bin/kibana-docker /usr/local/bin/

# Ensure gid 0 write permissions for OpenShift.
RUN chmod g+ws /usr/share/kibana && \
    find /usr/share/kibana -gid 0 -and -not -perm /g+w -exec chmod g+w {} \;

# Remove the suid bit everywhere to mitigate "Stack Clash"
RUN find / -xdev -perm -4000 -exec chmod u-s {} +

# Provide a non-root user to run the process.
RUN groupadd --gid 1000 kibana && \
    useradd --uid 1000 --gid 1000{{^serverless}} -G 0{{/serverless}} \
      --home-dir /usr/share/kibana --no-create-home \
      kibana

LABEL org.label-schema.build-date="{{dockerBuildDate}}" \
  org.label-schema.license="{{license}}" \
  org.label-schema.name="Kibana" \
  org.label-schema.schema-version="1.0" \
  org.label-schema.url="https://www.elastic.co/products/kibana" \
  org.label-schema.usage="https://www.elastic.co/guide/en/kibana/reference/index.html" \
  org.label-schema.vcs-ref="{{revision}}" \
  org.label-schema.vcs-url="https://github.com/elastic/kibana" \
  org.label-schema.vendor="Elastic" \
  org.label-schema.version="{{version}}" \
  org.opencontainers.image.created="{{dockerBuildDate}}" \
  org.opencontainers.image.documentation="https://www.elastic.co/guide/en/kibana/reference/index.html" \
  org.opencontainers.image.licenses="{{license}}" \
  org.opencontainers.image.revision="{{revision}}" \
  org.opencontainers.image.source="https://github.com/elastic/kibana" \
  org.opencontainers.image.title="Kibana" \
  org.opencontainers.image.url="https://www.elastic.co/products/kibana" \
  org.opencontainers.image.vendor="Elastic" \
  org.opencontainers.image.version="{{version}}"

{{#ubi}}
LABEL name="Kibana" \
  maintainer="infra@elastic.co" \
  vendor="Elastic" \
  version="{{version}}" \
  release="1" \
  summary="Kibana" \
  description="Your window into the Elastic Stack."

RUN mkdir /licenses && ln LICENSE.txt /licenses/LICENSE
{{/ubi}}

ENTRYPOINT ["/bin/tini", "--"]

{{#cloud}}
CMD ["/app/kibana.sh"]
# Generate a stub command that will be overwritten at runtime
RUN mkdir /app && \
    /bin/echo -e '#!/bin/bash\nexec /usr/local/bin/kibana-docker' > /app/kibana.sh && \
    chmod 0555 /app/kibana.sh
{{/cloud}}

{{^cloud}}
CMD ["/usr/local/bin/kibana-docker"]
{{/cloud}}


USER 1000
