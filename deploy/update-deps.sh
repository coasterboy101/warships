#!/bin/sh
# Update the npm packages that `npm audit` reports as vulnerable, rebuild, restart.
# Run as root:  /srv/warships/deploy/update-deps.sh [--dry-run]
#
# Vulnerable direct dependencies go to their latest release, even a new major
# version. Vulnerable transitive dependencies go to the newest version their
# dependents' ranges allow. If an install, the build or the tests fail,
# package.json and package-lock.json are restored and the old versions rebuilt.
#
# deploy.sh resets the checkout to origin, so commit the updated package.json
# and package-lock.json to the repository or the next deploy undoes this.
set -eu

APP_DIR=/srv/warships
APP_USER=warships
SERVICE=warships
DRY_RUN=0

case "${1:-}" in
    "") ;;
    -n|--dry-run) DRY_RUN=1 ;;
    *)
        echo "usage: update-deps.sh [--dry-run]" >&2
        exit 2
        ;;
esac

if [ "$(id -u)" -ne 0 ]; then
    echo "update-deps.sh must be run as root" >&2
    exit 1
fi

# git, npm and the build all run as the unprivileged service user.
as_app() {
    runuser -u "$APP_USER" -- env HOME="$APP_DIR" "$@"
}

# Prints one "direct <name>" or "transitive <name>" line per vulnerable package.
vulnerable() {
    # npm audit exits non-zero whenever it finds something, so its status is ignored
    # and errors are read from the JSON report instead.
    { as_app npm audit --json || true; } | node -e '
        let json = "";
        process.stdin.on("data", (chunk) => (json += chunk)).on("end", () => {
            const report = JSON.parse(json);
            if (report.error) {
                console.error("npm audit failed: " + (report.error.summary || JSON.stringify(report.error)));
                process.exit(1);
            }
            for (const [name, vuln] of Object.entries(report.vulnerabilities || {})) {
                console.log((vuln.isDirect ? "direct " : "transitive ") + name);
            }
        });
    '
}

cd "$APP_DIR"

# A failed update is undone with git checkout, which would also throw away local edits.
if ! as_app git diff --quiet -- package.json package-lock.json; then
    echo "package.json or package-lock.json has local changes; run deploy.sh first" >&2
    exit 1
fi

VULNS="$(vulnerable)"
if [ -z "$VULNS" ]; then
    echo "npm audit found no vulnerable packages"
    exit 0
fi
DIRECT="$(printf '%s\n' "$VULNS" | awk '$1 == "direct" { print $2 }' | tr '\n' ' ')"
TRANSITIVE="$(printf '%s\n' "$VULNS" | awk '$1 == "transitive" { print $2 }' | tr '\n' ' ')"

echo "Vulnerable direct dependencies:     ${DIRECT:-none}"
echo "Vulnerable transitive dependencies: ${TRANSITIVE:-none}"

if [ "$DRY_RUN" -eq 1 ]; then
    as_app npm audit || true
    exit 0
fi

# Runs on any exit until the update is known to be good.
restore() {
    status=$?
    trap - EXIT
    echo "Update failed; restoring package.json and package-lock.json" >&2
    as_app git checkout -- package.json package-lock.json
    as_app npm ci
    as_app npm run build
    systemctl restart "$SERVICE"
    exit "$status"
}
trap restore EXIT
trap 'exit 1' HUP INT TERM

# Package names never contain spaces, so word splitting gives one argument per package.
if [ -n "$DIRECT" ]; then
    # shellcheck disable=SC2046
    as_app npm install $(for pkg in $DIRECT; do printf '%s@latest ' "$pkg"; done)
fi
if [ -n "$TRANSITIVE" ]; then
    # shellcheck disable=SC2086
    as_app npm update $TRANSITIVE
fi

if as_app git diff --quiet -- package.json package-lock.json; then
    trap - EXIT HUP INT TERM
    echo "No newer versions are available within the current dependency ranges"
    as_app npm audit || true
    exit 0
fi

as_app npm run build
as_app npm test
trap - EXIT HUP INT TERM

# The server indexes dist/ at startup, so it has to be restarted to see a new build.
systemctl restart "$SERVICE"
systemctl --no-pager --lines=0 status "$SERVICE"

as_app git --no-pager diff --stat -- package.json package-lock.json
as_app git --no-pager diff -- package.json

echo "Remaining audit findings:"
as_app npm audit || true

echo "Updated packages in $APP_DIR; commit package.json and package-lock.json before the next deploy"
