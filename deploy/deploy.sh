#!/bin/sh
# Deploy the site on the droplet: pull, install, build, restart.
# Run as root:  /srv/warships/deploy/deploy.sh [branch]
set -eu

APP_DIR=/srv/warships
APP_USER=warships
SERVICE=warships
BRANCH="${1:-main}"

if [ "$(id -u)" -ne 0 ]; then
    echo "deploy.sh must be run as root" >&2
    exit 1
fi

# git, npm and the build all run as the unprivileged service user.
as_app() {
    runuser -u "$APP_USER" -- env HOME="$APP_DIR" "$@"
}

cd "$APP_DIR"

as_app git fetch --prune origin
as_app git checkout "$BRANCH"
as_app git reset --hard "origin/$BRANCH"

as_app npm ci
as_app npm run build

# The server indexes dist/ at startup, so it has to be restarted to see a new build.
systemctl restart "$SERVICE"
systemctl --no-pager --lines=0 status "$SERVICE"

echo "Deployed $BRANCH at $(as_app git rev-parse --short HEAD)"
