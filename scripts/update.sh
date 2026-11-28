#!/usr/bin/env bash
# nostrcheck-server updater
# https://github.com/quentintaranpino/nostrcheck-server
# License: MIT
#
# Updates a standalone install in place: pulls the current branch, reinstalls
# the npm dependencies, rebuilds and restarts the service. config/local.json,
# the database and the media files are never touched.

set -Eeuo pipefail

readonly SERVICE="nostrcheck"
readonly NODE_MAJOR=24          # installed only when the current Node is too old
readonly STEPS=4

usage() {
    cat <<EOF
Usage: update.sh [options]

Updates this nostrcheck-server checkout to the latest commit of its branch.
The server is stopped while it rebuilds and started again at the end.

Options:
  -y, --yes       Don't ask for confirmation.
  --force         Rebuild and restart even when the code is already up to date.
  --no-pull       Don't fetch new code, just rebuild what is checked out.
  --no-restart    Leave the service alone (restart it yourself afterwards).
  -v, --verbose   Show command output instead of only logging it.
  -h, --help      Show this help.

Docker installs update with: docker compose pull && docker compose up -d
EOF
}

# --- Output ------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
    BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi

exec 3>&2
STEP=0
STEP_NAME="startup"
LAST_CMD=""
LOG_FILE=""
VERBOSE="no"
WARNINGS=()
ROLLBACK_HINT=""

log()  { [ -z "${LOG_FILE}" ] || printf '%s\n' "$*" >>"${LOG_FILE}"; }
step() { STEP=$((STEP + 1)); STEP_NAME="$*"; printf '\n%s[%d/%d]%s %s\n' "${BOLD}" "${STEP}" "${STEPS}" "${RESET}" "$*"; log ""; log "== [${STEP}/${STEPS}] $*"; }
info() { printf '      %s\n' "$*"; log "$*"; }
note() { printf '      %s%s%s\n' "${DIM}" "$*" "${RESET}"; log "$*"; }
warn() { printf '      %swarning:%s %s\n' "${YELLOW}" "${RESET}" "$*"; log "warning: $*"; WARNINGS+=("$*"); }
die()  { printf '\n%serror:%s %s\n' "${RED}" "${RESET}" "$*" >&2; log "error: $*"; [ -z "${ROLLBACK_HINT}" ] || printf '%s\n' "${ROLLBACK_HINT}" >&2; exit 1; }

run() {
    LAST_CMD="$*"
    log "\$ $*"
    if [ "${VERBOSE}" = "yes" ]; then
        "$@" </dev/null 2>&1 | tee -a "${LOG_FILE}"
    else
        "$@" </dev/null >>"${LOG_FILE}" 2>&1
    fi
}

on_error() {
    local code=$?
    [ "${BASHPID}" = "$$" ] || exit "${code}"
    trap - ERR
    # A command run through run() fails with its output still pointed at the log:
    # fd 3 is the terminal.
    printf '\n%serror:%s step %d (%s) failed with exit code %d\n' "${RED}" "${RESET}" "${STEP}" "${STEP_NAME}" "${code}" >&3
    [ -z "${LAST_CMD}" ] || printf '  command: %s\n' "${LAST_CMD}" >&3
    if [ -n "${LOG_FILE}" ] && [ -s "${LOG_FILE}" ]; then
        if [ "${VERBOSE}" != "yes" ]; then
            printf '  last lines of the log:\n' >&3
            tail -n 15 "${LOG_FILE}" | sed 's/^/    /' >&3
        fi
        printf '  full log: %s\n' "${LOG_FILE}" >&3
    fi
    [ -z "${ROLLBACK_HINT}" ] || printf '%s\n' "${ROLLBACK_HINT}" >&3
    exit "${code}"
}

# --- Helpers -----------------------------------------------------------------
OWNER=""

as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
# git, npm and the build run as the owner of the checkout, so a root-run update
# doesn't leave root-owned files in an install that runs as another user.
as_user() { if [ "$(id -un)" = "${OWNER}" ]; then "$@"; else sudo -H -u "${OWNER}" -- "$@"; fi; }

wait_for() {
    local tries="$1"; shift
    until "$@" >/dev/null 2>&1; do
        tries=$((tries - 1))
        [ "${tries}" -gt 0 ] || return 1
        sleep 1
    done
}

http_up() {
    local code
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$1/" || true)
    [ -n "${code}" ] && [ "${code}" != "000" ]
}

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true; }
# Even majors from NODE_MIN up. Odd ones (21, 23) are short-lived and half the
# dependency tree refuses to install on them.
node_ok() {
    local major
    major=$(node_major)
    [ -n "${major}" ] && [ "${major}" -ge "$1" ] && [ $((major % 2)) -eq 0 ]
}
pkg_version() { sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1; }

main() {
    local args=("$@")
    local assume_yes="no" force="no" pull="yes" restart="yes"
    # Set when this is the freshly pulled copy of the script taking over.
    local resume_from="${NOSTRCHECK_UPDATE_RESUME:-}"
    local service_was_active="${NOSTRCHECK_UPDATE_WAS_ACTIVE:-no}"
    if [ -n "${NOSTRCHECK_UPDATE_WARNINGS:-}" ]; then
        mapfile -t WARNINGS <<<"${NOSTRCHECK_UPDATE_WARNINGS}"
    fi
    unset NOSTRCHECK_UPDATE_RESUME NOSTRCHECK_UPDATE_WAS_ACTIVE NOSTRCHECK_UPDATE_WARNINGS

    while [ $# -gt 0 ]; do
        case "$1" in
            -y|--yes|--non-interactive) assume_yes="yes"; shift ;;
            --force)        force="yes"; shift ;;
            --no-pull)      pull="no"; shift ;;
            --no-restart)   restart="no"; shift ;;
            -v|--verbose)   VERBOSE="yes"; shift ;;
            -h|--help)      usage; exit 0 ;;
            *) printf 'Unknown option: %s\nRun with --help for usage.\n' "$1" >&2; exit 64 ;;
        esac
    done

    # --- Preflight -------------------------------------------------------------
    local root
    root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
    cd "${root}"
    grep -qs '"name": "nostrcheck-server"' package.json || die "${root} is not a nostrcheck-server checkout."
    [ -d .git ] || die "${root} is not a git checkout. Docker installs update with: docker compose pull && docker compose up -d"

    OWNER=$(stat -c '%U' "${root}")
    if [ "$(id -u)" -ne 0 ]; then
        command -v sudo >/dev/null 2>&1 || [ "$(id -un)" = "${OWNER}" ] || die "Run this as ${OWNER} or as root."
    fi
    command -v node >/dev/null 2>&1 || die "node not found in PATH."
    command -v npm >/dev/null 2>&1 || die "npm not found in PATH."

    local has_service="no"
    if [ -d /run/systemd/system ] && systemctl cat "${SERVICE}.service" >/dev/null 2>&1; then
        has_service="yes"
    fi
    local port=""
    if [ -f config/local.json ] && command -v jq >/dev/null 2>&1; then
        port=$(as_user jq -r '.server.port // empty' config/local.json 2>/dev/null || true)
    fi
    [[ "${port}" =~ ^[0-9]+$ ]] || port=3000

    LOG_FILE="${LOG_FILE:-${root}/update.log}"
    if [ -z "${resume_from}" ]; then
        : 2>/dev/null >"${LOG_FILE}" || LOG_FILE="/tmp/nostrcheck-update.log"
        : >"${LOG_FILE}"
        as_root chown "${OWNER}" "${LOG_FILE}" 2>/dev/null || true
    fi
    trap on_error ERR
    local started="${NOSTRCHECK_UPDATE_STARTED:-$(date +%s)}"

    local old_commit old_version branch
    old_commit=$(as_user git rev-parse HEAD)
    old_version=$(pkg_version)
    branch=$(as_user git rev-parse --abbrev-ref HEAD)

    if [ -n "${resume_from}" ]; then
        old_commit="${resume_from}"
        old_version="${NOSTRCHECK_UPDATE_OLD_VERSION:-${old_version}}"
        STEP=1
    else
        printf '\n%snostrcheck-server%s update\n' "${BOLD}" "${RESET}"
        printf '%s%s, branch %s, version %s%s\n' "${DIM}" "${root}" "${branch}" "${old_version}" "${RESET}"
        log "nostrcheck-server update, $(date -u '+%Y-%m-%d %H:%M:%S UTC'), ${root}, ${branch} ${old_commit}"

        # --- 1. Fetch ----------------------------------------------------------
        step "Fetching updates"
        local target="${old_commit}"
        if [ "${pull}" != "yes" ]; then
            info "skipped (--no-pull)"
        else
            [ "${branch}" != "HEAD" ] || die "The checkout is on a detached HEAD. Switch to a branch first (git checkout main) or use --no-pull."
            as_user git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1 \
                || die "Branch ${branch} has no upstream to pull from. Set one: git branch --set-upstream-to=origin/${branch}"
            run as_user git fetch --quiet
            target=$(as_user git rev-parse '@{upstream}')
            if [ "${target}" = "${old_commit}" ]; then
                info "already up to date (${old_commit:0:8})"
            elif ! as_user git merge-base --is-ancestor "${old_commit}" "${target}"; then
                die "Branch ${branch} has local commits that are not upstream, so it cannot be fast-forwarded. Resolve that with git, then run the update again."
            else
                info "$(as_user git rev-list --count "${old_commit}..${target}") new commits (${old_commit:0:8} -> ${target:0:8})"
            fi
        fi

        if [ "${target}" = "${old_commit}" ] && [ "${pull}" = "yes" ] && [ "${force}" != "yes" ] && [ -d dist ] && [ -d node_modules ]; then
            printf '\nNothing to do. Use --force to rebuild anyway.\n\n'
            exit 0
        fi

        if [ "${assume_yes}" != "yes" ] && [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
            if { : </dev/tty; } 2>/dev/null; then
                local go=""
                printf '      The server will be down while it rebuilds (a few minutes). Continue? [Y/n] ' >/dev/tty
                IFS= read -r go </dev/tty || true
                case "${go}" in ""|y|Y|yes) ;; *) printf 'Aborted, nothing was changed.\n'; exit 0 ;; esac
            fi
        fi

        if [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
            if systemctl is-active --quiet "${SERVICE}"; then service_was_active="yes"; fi
            note "stopping ${SERVICE}"
            run as_root systemctl stop "${SERVICE}"
        fi
        ROLLBACK_HINT="  The service is stopped. To go back to the previous version:
    cd ${root} && git reset --hard ${old_commit:0:12} && npm ci && npm run build && sudo systemctl start ${SERVICE}"
        [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ] || ROLLBACK_HINT=""

        if [ -f config/local.json ]; then
            as_user cp -p config/local.json config/local.json.pre-update
        fi

        if [ "${target}" != "${old_commit}" ]; then
            # Local edits to tracked files are set aside and put back on top of the new code.
            local stashed="no"
            if [ -n "$(as_user git status --porcelain --untracked-files=no)" ]; then
                run as_user git stash push --quiet -m "update.sh $(date +%Y%m%d%H%M%S)"
                stashed="yes"
                note "local changes to tracked files set aside (git stash)"
            fi
            run as_user git merge --ff-only --quiet "${target}"
            if [ "${stashed}" = "yes" ]; then
                if run as_user git stash pop --quiet; then
                    note "local changes re-applied"
                else
                    run as_user git reset --hard --quiet "${target}"
                    warn "your local changes conflict with the update and were left in 'git stash' (see: git stash list)"
                fi
            fi
            # Hand over to the updater that came with the new code.
            if ! as_user git diff --quiet "${old_commit}" "${target}" -- scripts/update.sh; then
                log "re-executing the updated scripts/update.sh"
                export NOSTRCHECK_UPDATE_RESUME="${old_commit}" NOSTRCHECK_UPDATE_OLD_VERSION="${old_version}"
                export NOSTRCHECK_UPDATE_WAS_ACTIVE="${service_was_active}" NOSTRCHECK_UPDATE_STARTED="${started}" LOG_FILE
                NOSTRCHECK_UPDATE_WARNINGS=$(printf '%s\n' ${WARNINGS[@]+"${WARNINGS[@]}"})
                export NOSTRCHECK_UPDATE_WARNINGS
                exec bash "${root}/scripts/update.sh" ${args[@]+"${args[@]}"}
            fi
        fi
    fi
    if [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
        ROLLBACK_HINT="  The service is stopped. To go back to the previous version:
    cd ${root} && git reset --hard ${old_commit:0:12} && npm ci && npm run build && sudo systemctl start ${SERVICE}"
    fi

    # --- 2. Dependencies -------------------------------------------------------
    step "Dependencies"
    local need_node
    need_node=$(sed -n 's/.*"node"[[:space:]]*:[[:space:]]*">=[[:space:]]*\([0-9]*\).*/\1/p' package.json | head -n 1)
    need_node="${need_node:-20}"
    if ! node_ok "${need_node}"; then
        if dpkg -s nodejs >/dev/null 2>&1; then
            note "Node $(node -v) is not supported (needs an LTS release, ${need_node}+), installing Node ${NODE_MAJOR} from NodeSource"
            run bash -c "set -o pipefail; curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | $([ "$(id -u)" -eq 0 ] || echo sudo -E) bash -"
            run as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs
        fi
        node_ok "${need_node}" || die "This version needs an LTS release of Node (${need_node} or newer), found $(node -v). Upgrade Node and run the update again."
    fi
    note "Node $(node -v), npm ci"
    if [ -f package-lock.json ]; then
        run as_user npm ci --include=optional --no-audit --no-fund
    else
        run as_user npm install --include=optional --no-audit --no-fund
    fi
    if [ ! -x .venv/bin/python ]; then
        note "no .venv: the local moderation engine is not installed (scripts/install.sh sets it up)"
    elif ! as_user .venv/bin/python -c 'import torch, transformers, flask, PIL' >/dev/null 2>&1; then
        warn "the moderation engine in .venv is broken; remove .venv and run scripts/install.sh to rebuild it"
    fi

    # --- 3. Build --------------------------------------------------------------
    step "Build"
    note "npm run build"
    run as_user npm run build
    local new_version
    new_version=$(pkg_version)

    # --- 4. Restart ------------------------------------------------------------
    step "Restart"
    local state="not managed by systemd here, restart it yourself"
    if [ "${restart}" != "yes" ]; then
        info "skipped (--no-restart)"
        state="left as it was (--no-restart)"
    elif [ "${has_service}" != "yes" ]; then
        info "no ${SERVICE} systemd service on this machine; restart the server yourself"
    elif [ "${service_was_active}" != "yes" ]; then
        info "${SERVICE} was not running before the update, left stopped"
        state="stopped (it was not running before)"
        ROLLBACK_HINT=""
    else
        run as_root systemctl start "${SERVICE}"
        note "waiting for the server on port ${port}"
        # New config keys make the server exit once so systemd restarts it.
        if wait_for 180 http_up "${port}"; then
            info "server is answering on http://127.0.0.1:${port}"
            state="running"
            ROLLBACK_HINT=""
        elif systemctl is-active --quiet "${SERVICE}" && [ "$(systemctl show -p NRestarts --value "${SERVICE}")" -le 2 ]; then
            # Up and not crash-looping: a long database migration, most likely.
            warn "the service is running but not answering on port ${port} yet; follow it with: journalctl -u ${SERVICE} -f"
            state="starting"
            ROLLBACK_HINT=""
        else
            as_root journalctl -u "${SERVICE}" --no-pager -n 40 >>"${LOG_FILE}" 2>&1 || true
            ROLLBACK_HINT="  To go back to the previous version:
    cd ${root} && sudo systemctl stop ${SERVICE} && git reset --hard ${old_commit:0:12} && npm ci && npm run build && sudo systemctl start ${SERVICE}"
            die "The service did not answer on port ${port} within 3 minutes. Check: journalctl -u ${SERVICE} -n 100"
        fi
    fi

    local elapsed=$(($(date +%s) - started))
    printf '\n%s%snostrcheck-server updated%s in %dm%02ds\n\n' "${BOLD}" "${GREEN}" "${RESET}" $((elapsed / 60)) $((elapsed % 60))
    if [ "${old_version}" = "${new_version}" ]; then
        printf '  Version     %s\n' "${new_version}"
    else
        printf '  Version     %s -> %s\n' "${old_version}" "${new_version}"
    fi
    printf '  Service     %s\n' "${state}"
    printf '  Config      %s/config/local.json  (untouched, copy in local.json.pre-update)\n' "${root}"
    printf '  Update log  %s\n\n' "${LOG_FILE}"
    if [ "${#WARNINGS[@]}" -gt 0 ]; then
        printf '  %sWarnings%s\n' "${YELLOW}" "${RESET}"
        local w
        for w in "${WARNINGS[@]}"; do printf '    - %s\n' "${w}"; done
        printf '\n'
    fi
}

main "$@"
