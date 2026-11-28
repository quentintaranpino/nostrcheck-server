#!/usr/bin/env bash
# nostrcheck-server updater
# https://github.com/quentintaranpino/nostrcheck-server
# License: MIT
#
# Updates a standalone install in place: pulls the current branch, reinstalls
# the npm dependencies, rebuilds and restarts the service. config/local.json,
# the database and the media files are never touched.
#
# Trust model. The checkout belongs to one user (the "owner", who the service
# runs as) and so does this script, so running it as root trusts that user, and
# the branch the checkout follows, with root: there is no way around that for
# an updater that lives in the tree it updates. What it does about it:
#   - everything that reads or runs code from the checkout (git and its hooks,
#     npm and its lifecycle scripts, the build, the moderation venv) runs as the
#     owner, never as root;
#   - root is only used for systemctl, apt (a Node upgrade) and the log, which
#     lives in /var/log where the owner cannot plant a symlink;
#   - the copy of this script a pull brings in only takes over after checking
#     that it is byte for byte the one in the commit that was just pulled.
# When the owner has sudo, run it as the owner. Run it as root for an install
# owned by a system user (/opt/nostrcheck-server, user nostrcheck).

# The script ends in an explicit exit, which makes shellcheck take the functions
# that only run through trap or wait_for for dead code.
# shellcheck disable=SC2317
set -Eeuo pipefail

readonly SERVICE="nostrcheck"
readonly NODE_MAJOR=24          # installed only when the current Node is too old
readonly STEPS=4
readonly LOG_PATH="/var/log/nostrcheck-update.log"

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
  --backup-db     Dump the database to backups/ before stopping the server.
  -v, --verbose   Show command output instead of only logging it.
  -h, --help      Show this help.

Run it as the owner of the checkout, or as root (git, npm and the build still
run as the owner). The previous commit is kept as refs/nostrcheck/pre-update-*.

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
STASH_HINT=""

log()  { [ -z "${LOG_FILE}" ] || printf '%s\n' "$*" >>"${LOG_FILE}"; }
step() { STEP=$((STEP + 1)); STEP_NAME="$*"; printf '\n%s[%d/%d]%s %s\n' "${BOLD}" "${STEP}" "${STEPS}" "${RESET}" "$*"; log ""; log "== [${STEP}/${STEPS}] $*"; }
info() { printf '      %s\n' "$*"; log "$*"; }
note() { printf '      %s%s%s\n' "${DIM}" "$*" "${RESET}"; log "$*"; }
warn() { printf '      %swarning:%s %s\n' "${YELLOW}" "${RESET}" "$*"; log "warning: $*"; WARNINGS+=("$*"); }
hints() {
    [ -z "${STASH_HINT}" ] || printf '%s\n' "${STASH_HINT}"
    [ -z "${ROLLBACK_HINT}" ] || printf '%s\n' "${ROLLBACK_HINT}"
}
die()  { printf '\n%serror:%s %s\n' "${RED}" "${RESET}" "$*" >&2; log "error: $*"; hints >&2; exit 1; }

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
    hints >&3
    exit "${code}"
}

# --- Helpers -----------------------------------------------------------------
OWNER=""

as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
# git, npm and the build run as the owner of the checkout: see the trust model
# at the top. runuser under root, as a system user has no sudo rights or shell.
as_user() {
    if [ "$(id -un)" = "${OWNER}" ]; then
        "$@"
    elif [ "$(id -u)" -eq 0 ]; then
        runuser -u "${OWNER}" -- env -u XDG_RUNTIME_DIR HOME="$(getent passwd "${OWNER}" | cut -d: -f6)" USER="${OWNER}" LOGNAME="${OWNER}" "$@"
    else
        sudo -H -u "${OWNER}" -- "$@"
    fi
}
# How to say "as the owner" in a command the user is told to type.
owner_prefix() {
    if [ "${OWNER}" = "root" ]; then
        [ "$(id -u)" -eq 0 ] || printf 'sudo '
    elif [ "$(id -un)" != "${OWNER}" ]; then
        printf 'sudo -u %s ' "${OWNER}"
    fi
}

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
version_ge() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" = "$2" ]; }
pkg_version() { sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1; }

# The log lives in /var/log, which only root can write: the owner of the
# checkout cannot plant a symlink there for root to follow. It belongs to
# whoever runs the update.
open_log() {
    LOG_FILE="${LOG_PATH}"
    if as_root test -L "${LOG_FILE}"; then
        die "${LOG_FILE} is a symlink. Remove it and run the update again."
    fi
    # Removed and created again, never opened: whatever sat at that path is gone.
    if as_root rm -f -- "${LOG_FILE}" 2>/dev/null \
        && as_root install -m 600 -o "$(id -u)" -g "$(id -g)" /dev/null "${LOG_FILE}" 2>/dev/null; then
        return 0
    fi
    LOG_FILE=$(mktemp "${TMPDIR:-/tmp}/nostrcheck-update.XXXXXXXX")
}

# Dumps the database in config/local.json to $1, as the owner: the credentials
# are the owner's and so is the file.
backup_db() {
    as_user bash -s -- "${PWD}/config/local.json" "$1" >>"${LOG_FILE}" 2>&1 <<'DUMP'
set -euo pipefail
umask 077
config="$1"; out="$2"
dump=$(command -v mariadb-dump || command -v mysqldump) || { echo "mariadb-dump not found"; exit 1; }
db_host=$(jq -r '.database.host // "127.0.0.1"' "${config}")
db_name=$(jq -r '.database.database // ""' "${config}")
db_user=$(jq -r '.database.user // ""' "${config}")
MYSQL_PWD=$(jq -r '.database.password // ""' "${config}")
export MYSQL_PWD
[ -n "${db_name}" ] && [ -n "${db_user}" ] || { echo "no database in ${config}"; exit 1; }
mkdir -p "$(dirname "${out}")"
"${dump}" --single-transaction --quick -h "${db_host}" -u "${db_user}" -- "${db_name}" | gzip >"${out}.part"
gzip -t "${out}.part"
mv "${out}.part" "${out}"
DUMP
}

# The installer's unit starts node with the arguments of "start" in
# package.json. When an update changes those, the unit follows.
sync_unit() {
    local unit="/etc/systemd/system/${SERVICE}.service" start_cmd node_bin have want
    grep -qs '^# nostrcheck: ExecStart tracks' "${unit}" || return 0
    start_cmd=$(sed -n 's/^[[:space:]]*"start"[[:space:]]*:[[:space:]]*"\(.*\)",\{0,1\}[[:space:]]*$/\1/p' package.json | head -n 1)
    have=$(sed -n 's/^ExecStart=//p' "${unit}" | head -n 1)
    node_bin=$(command -v node)
    # Owner-controlled text on its way into a root-owned unit: one plain node
    # command line or nothing.
    if ! [[ "${start_cmd}" =~ ^node\ [A-Za-z0-9\ ./=_-]+$ ]] || ! [[ "${node_bin}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
        [ "${have#*/npm run start}" != "${have}" ] || warn "the start command in package.json is no longer a plain node command; check ExecStart in ${unit}"
        return 0
    fi
    want="${node_bin} ${start_cmd#node }"
    [ "${have}" != "${want}" ] || return 0
    run as_root sed -i "s|^ExecStart=.*|ExecStart=${want}|" "${unit}"
    run as_root systemctl daemon-reload
    note "start command changed, ${unit} updated"
}

main() {
    local args=("$@")
    local assume_yes="no" force="no" pull="yes" restart="yes" backup="no"
    # Set when this is the freshly pulled copy of the script taking over.
    local resume_from="${NOSTRCHECK_UPDATE_RESUME:-}"
    local service_was_active="${NOSTRCHECK_UPDATE_WAS_ACTIVE:-no}"
    local resume_log="${NOSTRCHECK_UPDATE_LOG:-}"
    local pre_ref="${NOSTRCHECK_UPDATE_PRE_REF:-}" stash_ref="${NOSTRCHECK_UPDATE_STASH_REF:-}"
    if [ -n "${NOSTRCHECK_UPDATE_WARNINGS:-}" ]; then
        mapfile -t WARNINGS <<<"${NOSTRCHECK_UPDATE_WARNINGS}"
    fi
    unset NOSTRCHECK_UPDATE_RESUME NOSTRCHECK_UPDATE_WAS_ACTIVE NOSTRCHECK_UPDATE_WARNINGS
    unset NOSTRCHECK_UPDATE_LOG NOSTRCHECK_UPDATE_PRE_REF NOSTRCHECK_UPDATE_STASH_REF

    while [ $# -gt 0 ]; do
        case "$1" in
            -y|--yes|--non-interactive) assume_yes="yes"; shift ;;
            --force)        force="yes"; shift ;;
            --no-pull)      pull="no"; shift ;;
            --no-restart)   restart="no"; shift ;;
            --backup-db)    backup="yes"; shift ;;
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
    id "${OWNER}" >/dev/null 2>&1 || die "${root} belongs to an unknown user (uid $(stat -c '%u' "${root}")). Give it an owner: sudo chown -R <user> ${root}"
    if [ "$(id -u)" -ne 0 ]; then
        command -v sudo >/dev/null 2>&1 || [ "$(id -un)" = "${OWNER}" ] || die "Run this as ${OWNER} or as root."
    fi
    command -v node >/dev/null 2>&1 || die "node not found in PATH."
    command -v npm >/dev/null 2>&1 || die "npm not found in PATH."
    if [ "${backup}" = "yes" ]; then
        [ -f config/local.json ] || die "--backup-db: there is no config/local.json to take the database from."
        command -v jq >/dev/null 2>&1 || die "--backup-db needs jq. Install it: sudo apt-get install jq"
        command -v mariadb-dump >/dev/null 2>&1 || command -v mysqldump >/dev/null 2>&1 || die "--backup-db needs mariadb-dump (package mariadb-client)."
    fi

    local has_service="no"
    if [ -d /run/systemd/system ] && systemctl cat "${SERVICE}.service" >/dev/null 2>&1; then
        has_service="yes"
    fi
    local port=""
    if [ -f config/local.json ] && command -v jq >/dev/null 2>&1; then
        port=$(as_user jq -r '.server.port // empty' config/local.json 2>/dev/null || true)
    fi
    [[ "${port}" =~ ^[0-9]+$ ]] || port=3000

    # A resumed run goes on in the log its predecessor opened, provided that is
    # really a file of ours. The updater before this one logged inside the
    # checkout: that one is not picked up.
    if [ -n "${resume_from}" ] && [ -n "${resume_log}" ] && [ -f "${resume_log}" ] && [ ! -L "${resume_log}" ] && [ -O "${resume_log}" ]; then
        LOG_FILE="${resume_log}"
    else
        open_log
    fi
    trap on_error ERR
    local started="${NOSTRCHECK_UPDATE_STARTED:-$(date +%s)}"
    local stamp
    stamp=$(date +%Y%m%d-%H%M%S)

    local old_commit old_version branch
    old_commit=$(as_user git rev-parse HEAD)
    old_version=$(pkg_version)
    branch=$(as_user git rev-parse --abbrev-ref HEAD)
    local as_owner
    as_owner=$(owner_prefix)

    # What to type to get the previous version back. reset --hard drops local
    # changes that were re-applied on top of the update: the last line restores them.
    rollback_hint() {
        local intro="$1" stop="$2"
        ROLLBACK_HINT="  ${intro} To go back to the previous version:
    cd ${root}${stop:+ && sudo systemctl stop ${SERVICE}} && ${as_owner}git reset --hard ${pre_ref:-${old_commit:0:12}} && ${as_owner}npm ci && ${as_owner}npm run build && sudo systemctl start ${SERVICE}"
        [ -z "${stash_ref}" ] || ROLLBACK_HINT="${ROLLBACK_HINT}
    and then, for your local changes: ${as_owner}git stash apply ${stash_ref}"
    }

    if [ -n "${resume_from}" ]; then
        old_commit="${resume_from}"
        old_version="${NOSTRCHECK_UPDATE_OLD_VERSION:-${old_version}}"
        STEP=1
        log "resumed by the updated scripts/update.sh"
    else
        printf '\n%snostrcheck-server%s update\n' "${BOLD}" "${RESET}"
        printf '%s%s, branch %s, version %s, owner %s%s\n' "${DIM}" "${root}" "${branch}" "${old_version}" "${OWNER}" "${RESET}"
        log "nostrcheck-server update, $(date -u '+%Y-%m-%d %H:%M:%S UTC'), ${root}, ${branch} ${old_commit}, owner ${OWNER}, run by $(id -un)"

        # --- 1. Fetch ----------------------------------------------------------
        step "Fetching updates"
        local target="${old_commit}" dirty="no"
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

        # Everything that can stop the update is checked while the server is
        # still running.
        local path stray=()
        for path in .git node_modules dist src scripts package.json package-lock.json; do
            [ -e "${path}" ] || continue
            path=$(find "${path}" ! -user "${OWNER}" -print -quit 2>/dev/null || true)
            [ -z "${path}" ] || stray+=("${path}")
        done
        if [ "${#stray[@]}" -gt 0 ]; then
            die "Some files in the checkout don't belong to its owner (${OWNER}), e.g. ${stray[0]}, so the update would fail half way.
  Fix it: sudo chown -R ${OWNER}: ${root}"
        fi
        if [ "${target}" != "${old_commit}" ]; then
            # Files the update adds, already there and unknown to git: the merge
            # would refuse to overwrite them (or silently replace an ignored one).
            local added=() blocking=()
            mapfile -d '' -t added < <(as_user git diff --name-only -z --diff-filter=A "${old_commit}" "${target}")
            for path in ${added[@]+"${added[@]}"}; do
                if { [ -e "${path}" ] || [ -L "${path}" ]; } && ! as_user git ls-files --error-unmatch -- "${path}" >/dev/null 2>&1; then
                    blocking+=("${path}")
                fi
            done
            if [ "${#blocking[@]}" -gt 0 ]; then
                die "The update adds files that already exist here and are not tracked by git:
$(printf '    %s\n' "${blocking[@]:0:10}")$([ "${#blocking[@]}" -le 10 ] || printf '\n    ... and %d more' $((${#blocking[@]} - 10)))
  Move them away and run the update again. Nothing was changed."
            fi
            [ -z "$(as_user git status --porcelain --untracked-files=no)" ] || dirty="yes"
        fi

        if [ "${assume_yes}" != "yes" ] && [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
            if { : </dev/tty; } 2>/dev/null; then
                local go=""
                printf '      The server will be down while it rebuilds (a few minutes). Continue? [Y/n] ' >/dev/tty
                IFS= read -r go </dev/tty || true
                case "${go}" in ""|y|Y|yes) ;; *) printf 'Aborted, nothing was changed.\n'; exit 0 ;; esac
            fi
        fi

        if [ "${backup}" = "yes" ]; then
            local dump_file="${root}/backups/db-${stamp}.sql.gz"
            note "dumping the database to ${dump_file}"
            LAST_CMD="mariadb-dump (as ${OWNER})"
            backup_db "${dump_file}"
            info "database saved ($(du -h "${dump_file}" | cut -f1)): ${dump_file}"
        fi

        if [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
            if systemctl is-active --quiet "${SERVICE}"; then service_was_active="yes"; fi
            note "stopping ${SERVICE}"
            run as_root systemctl stop "${SERVICE}"
        fi

        if [ -f config/local.json ]; then
            as_user cp -p config/local.json config/local.json.pre-update
        fi

        if [ "${target}" != "${old_commit}" ]; then
            # The way back, under a name that outlives the reflog.
            pre_ref="refs/nostrcheck/pre-update-${stamp}"
            run as_user git update-ref "${pre_ref}" "${old_commit}"
            note "previous commit kept as ${pre_ref}"
        fi
        if [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
            rollback_hint "The service is stopped." ""
        fi

        if [ "${target}" != "${old_commit}" ]; then
            # Local edits to tracked files are set aside and put back on top of
            # the new code. They also get a ref of their own: the stash entry is
            # gone once it is popped, and a rollback would take the edits with it.
            if [ "${dirty}" = "yes" ]; then
                run as_user git stash push --quiet -m "update.sh ${stamp}"
                stash_ref="refs/nostrcheck/local-changes-${stamp}"
                run as_user git update-ref "${stash_ref}" refs/stash
                STASH_HINT="  Your local changes were set aside before the update and are NOT applied now.
    They are in 'git stash' and in ${stash_ref}; to put them back: cd ${root} && ${as_owner}git stash pop"
                [ -z "${ROLLBACK_HINT}" ] || rollback_hint "The service is stopped." ""
                note "local changes to tracked files set aside (git stash, ${stash_ref})"
            fi
            run as_user git merge --ff-only --quiet "${target}"
            if [ "${dirty}" = "yes" ]; then
                if run as_user git stash pop --quiet; then
                    STASH_HINT=""
                    note "local changes re-applied"
                else
                    run as_user git reset --hard --quiet "${target}"
                    STASH_HINT=""
                    warn "your local changes conflict with the update and were NOT re-applied. They are in 'git stash' and in ${stash_ref} (see: ${as_owner}git stash show -p ${stash_ref})"
                fi
            fi
            # Hand over to the updater that came with the new code, but only to
            # that one: the file on disk has to be the blob of the commit that
            # was just pulled, not a symlink and not a locally edited copy. See
            # the trust model at the top for what this does and doesn't protect.
            if ! as_user git diff --quiet "${old_commit}" "${target}" -- scripts/update.sh; then
                local blob_want blob_have
                blob_want=$(as_user git rev-parse --verify --quiet "${target}:scripts/update.sh" || true)
                blob_have=$(as_user git hash-object --no-filters -- scripts/update.sh 2>/dev/null || true)
                if [ -n "${blob_want}" ] && [ "${blob_want}" = "${blob_have}" ] && [ ! -L scripts/update.sh ] \
                    && [ "$(as_user git rev-parse HEAD)" = "${target}" ]; then
                    log "re-executing the updated scripts/update.sh (${blob_want:0:12})"
                    export NOSTRCHECK_UPDATE_RESUME="${old_commit}" NOSTRCHECK_UPDATE_OLD_VERSION="${old_version}"
                    export NOSTRCHECK_UPDATE_WAS_ACTIVE="${service_was_active}" NOSTRCHECK_UPDATE_STARTED="${started}"
                    export NOSTRCHECK_UPDATE_LOG="${LOG_FILE}" NOSTRCHECK_UPDATE_PRE_REF="${pre_ref}" NOSTRCHECK_UPDATE_STASH_REF="${stash_ref}"
                    NOSTRCHECK_UPDATE_WARNINGS=$(printf '%s\n' ${WARNINGS[@]+"${WARNINGS[@]}"})
                    export NOSTRCHECK_UPDATE_WARNINGS
                    exec bash "${root}/scripts/update.sh" ${args[@]+"${args[@]}"}
                fi
                warn "scripts/update.sh on disk is not the one this update brought (local changes to it?), so the previous updater finished the job"
            fi
        fi
    fi
    if [ "${has_service}" = "yes" ] && [ "${restart}" = "yes" ]; then
        rollback_hint "The service is stopped." ""
    fi

    # --- 2. Dependencies -------------------------------------------------------
    step "Dependencies"
    local need_node need_npm
    need_node=$(sed -n 's/.*"node"[[:space:]]*:[[:space:]]*">=[[:space:]]*\([0-9]*\).*/\1/p' package.json | head -n 1)
    need_node="${need_node:-20}"
    need_npm=$(sed -n 's/.*"npm"[[:space:]]*:[[:space:]]*">=[[:space:]]*\([0-9][0-9.]*\)".*/\1/p' package.json | head -n 1)
    need_npm="${need_npm:-10.4.0}"
    # A distro Node can be new enough and still come with an npm that npm ci
    # (engine-strict) refuses.
    if ! node_ok "${need_node}" || ! version_ge "$(npm -v 2>/dev/null || echo 0)" "${need_npm}"; then
        if dpkg -s nodejs >/dev/null 2>&1; then
            note "Node $(node -v) with npm $(npm -v 2>/dev/null || echo "?") is not enough (needs an LTS release of Node ${need_node}+, npm ${need_npm}+), installing Node ${NODE_MAJOR} from NodeSource"
            run bash -c "set -o pipefail; curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | $([ "$(id -u)" -eq 0 ] || echo sudo -E) bash -"
            run as_root env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -o DPkg::Lock::Timeout=120 install -y --no-install-recommends nodejs
            hash -r
        fi
        node_ok "${need_node}" || die "This version needs an LTS release of Node (${need_node} or newer), found $(node -v). Upgrade Node and run the update again."
        version_ge "$(npm -v 2>/dev/null || echo 0)" "${need_npm}" || die "This version needs npm ${need_npm} or newer, found $(npm -v 2>/dev/null || echo none). Run: npm install -g npm@latest, then the update again."
    fi
    note "Node $(node -v), npm $(npm -v), npm ci"
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
    [ "${has_service}" != "yes" ] || sync_unit

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
            rollback_hint "" "stop"
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
    [ -z "${pre_ref}" ] || printf '  Previous    %s  (%sgit reset --hard to it, then rebuild)\n' "${pre_ref}" "${as_owner}"
    printf '  Update log  %s\n\n' "${LOG_FILE}"
    if [ "${#WARNINGS[@]}" -gt 0 ]; then
        printf '  %sWarnings%s\n' "${YELLOW}" "${RESET}"
        local w
        for w in "${WARNINGS[@]}"; do printf '    - %s\n' "${w}"; done
        printf '\n'
    fi
}

# In one group with exit: bash reads a script as it runs it, and must not go on
# reading a file that the update has just replaced.
{ main "$@"; exit $?; }
