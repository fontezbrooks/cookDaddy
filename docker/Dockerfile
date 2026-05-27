# Linux runner for the recipe-seeding pipeline. System deps only — the app code
# is bind-mounted at /app and pnpm install runs in the entrypoint.
FROM node:20-bookworm-slim

ENV TZ=UTC \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH

# git + curl + PowerShell prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gnupg apt-transport-https libicu72 \
    && rm -rf /var/lib/apt/lists/*

# PowerShell Core (Debian 12 / bookworm) — runs test-spoon.ps1 unchanged
RUN curl -fsSL https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -o /tmp/ms.deb \
    && dpkg -i /tmp/ms.deb && rm /tmp/ms.deb \
    && apt-get update && apt-get install -y --no-install-recommends powershell \
    && rm -rf /var/lib/apt/lists/*

# supercronic (in-container cron). amd64 = Windows/WSL2 default.
# Pin a version, and (recommended) set SUPERCRONIC_SHA1SUM to the checksum published
# on the release page to enable integrity verification — leave empty to skip the check.
#   https://github.com/aptible/supercronic/releases
ARG SUPERCRONIC_VERSION=v0.2.33
ARG SUPERCRONIC_SHA1SUM=
RUN curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
      -o /usr/local/bin/supercronic \
    && { [ -z "$SUPERCRONIC_SHA1SUM" ] || echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c -; } \
    && chmod +x /usr/local/bin/supercronic

RUN corepack enable

WORKDIR /app
ENTRYPOINT ["/app/docker/entrypoint.sh"]
