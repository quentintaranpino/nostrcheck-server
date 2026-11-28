#!/usr/bin/env bash
# nostrcheck-server installer
# https://github.com/quentintaranpino/nostrcheck-server
# License: MIT
#
# Sets up a standalone server on Debian/Ubuntu: system packages, Node.js, the
# app, the local moderation engine, MariaDB, Redis, nginx and a systemd unit.
# The app and its service belong to the user running this (under sudo: to the
# owner of the install directory). Run as root with nothing installed yet, it
# creates a system user "nostrcheck" and installs into /opt/nostrcheck-server,
# so the server never runs as root.
# Safe to re-run: an existing config/local.json, its database, the systemd unit
# and an nginx site with TLS are kept as they are.

# The script ends in an explicit exit, which makes shellcheck take the functions
# that only run through trap or wait_for for dead code.
# shellcheck disable=SC2317
set -Eeuo pipefail

readonly REPO_URL="https://github.com/quentintaranpino/nostrcheck-server.git"
readonly SERVICE="nostrcheck"
readonly NODE_MAJOR=24          # installed when Node is missing or too old
readonly NODE_MIN=20            # oldest Node the server runs on
readonly NPM_MIN="10.4.0"       # engines.npm in package.json; npm ci refuses anything older
readonly UV_VERSION="0.9.9" # standalone Python provider, pinned
readonly UV_PYTHON="3.12"       # used when the system Python is not 3.10-3.12
readonly SYSTEM_USER="nostrcheck"
readonly SYSTEM_DIR="/opt/nostrcheck-server"
readonly SYSTEM_HOME="/var/lib/nostrcheck"
readonly LOG_PATH="/var/log/nostrcheck-install.log"
readonly CF_SNIPPET="/etc/nginx/snippets/nostrcheck-cloudflare.conf"
# Cloudflare's published ranges (https://www.cloudflare.com/ips/), used when
# they cannot be fetched at install time.
readonly CF_FALLBACK_V4="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"
readonly CF_FALLBACK_V6="2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
readonly TORCH_VERSION="2.4.1"
readonly TRANSFORMERS_VERSION="4.44.2"
readonly FLASK_VERSION="3.0.3"
readonly PILLOW_VERSION="10.4.0"
readonly STEPS=10

usage() {
    cat <<EOF
Usage: install.sh [options]

Installs nostrcheck-server on Debian or Ubuntu. Run it as root or as a user
with sudo. As a user, the server is installed for and runs as that user. As
root, it goes to ${SYSTEM_DIR} and runs as the system user "${SYSTEM_USER}".
Re-running it is safe: an existing install is found and kept where it is.

Options:
  --host <hostname>      Public hostname, e.g. example.com. Asked if missing.
  -y, --non-interactive  Never prompt. Needs --host.
  --email <address>      Let's Encrypt account email. Lets certbot run unattended.
  --no-ssl               Don't request TLS certificates.
  --cloudflare           The server sits behind Cloudflare: nginx takes the client
                         address from CF-Connecting-IP, for Cloudflare's ranges only.
                         Without it that header is dropped, as anyone can send it.
  --rewrite-nginx        Rewrite an nginx site that already has TLS (a copy is kept).
  --no-systemd           Don't create or start the systemd service.
  --rewrite-unit         Rewrite an existing systemd unit (a copy is kept).
  --no-moderation        Skip the local moderation engine (Python, torch).
  --gpu, --cpu           Force the CUDA or the CPU build of torch (default: CUDA
                         only when nvidia-smi is present).
  --dir <path>           Install directory (default: this checkout or the existing
                         install; else ./nostrcheck-server, ${SYSTEM_DIR} as root).
  --branch <name>        Branch to clone (default: main).
  --db <name>            Database name (default: nostrcheck).
  --user <name>          Database user (default: nostrcheck).
  --media-path <path>    Media storage path (default: files/).
  --pubkey <hex>         Server public key. Generated on first start if omitted.
  --secret <hex>         Server secret key. Required with --pubkey.
  -v, --verbose          Show command output instead of only logging it.
  -h, --help             Show this help.

Environment (flags win): NOSTRCHECK_HOST, NOSTRCHECK_EMAIL, NOSTRCHECK_DB,
NOSTRCHECK_USER, NOSTRCHECK_MEDIAPATH, NOSTRCHECK_PUBKEY, NOSTRCHECK_SECRETKEY.

Examples:
  ./install.sh
  ./install.sh -y --host example.com --email admin@example.com
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

log()  { [ -z "${LOG_FILE}" ] || printf '%s\n' "$*" >>"${LOG_FILE}"; }
step() { STEP=$((STEP + 1)); STEP_NAME="$*"; printf '\n%s[%2d/%d]%s %s\n' "${BOLD}" "${STEP}" "${STEPS}" "${RESET}" "$*"; log ""; log "== [${STEP}/${STEPS}] $*"; }
info() { printf '        %s\n' "$*"; log "$*"; }
note() { printf '        %s%s%s\n' "${DIM}" "$*" "${RESET}"; log "$*"; }
warn() { printf '        %swarning:%s %s\n' "${YELLOW}" "${RESET}" "$*"; log "warning: $*"; WARNINGS+=("$*"); }
die()  { printf '\n%serror:%s %s\n' "${RED}" "${RESET}" "$*" >&2; log "error: $*"; exit 1; }

# Runs a command with its output in the log (and on screen with --verbose).
# stdin is closed so nothing swallows what the user types ahead of a prompt.
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
    printf '  Nothing is removed on failure. Fix the cause and run the installer again.\n' >&3
    exit "${code}"
}

# --- Helpers -----------------------------------------------------------------
RUN_USER=""
HAS_SYSTEMD="no"

as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
# runuser under root: a minimal system has no sudo, and it needs no login shell.
as_user() {
    if [ "$(id -un)" = "${RUN_USER}" ]; then
        "$@"
    elif [ "$(id -u)" -eq 0 ]; then
        runuser -u "${RUN_USER}" -- env -u XDG_RUNTIME_DIR HOME="$(user_home "${RUN_USER}")" USER="${RUN_USER}" LOGNAME="${RUN_USER}" "$@"
    else
        sudo -H -u "${RUN_USER}" -- "$@"
    fi
}
user_home() { getent passwd "$1" | cut -d: -f6; }
apt_get() { as_root env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -o DPkg::Lock::Timeout=120 "$@"; }

is_repo() { [ -f "$1/package.json" ] && grep -q '"name": "nostrcheck-server"' "$1/package.json"; }
# Where the systemd unit of a previous install points, if there is one.
unit_dir() { { sed -n 's/^WorkingDirectory=//p' "/etc/systemd/system/${SERVICE}.service" 2>/dev/null || true; } | head -n 1; }

random_str() { ( set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}" ); }

wait_for() {
    local tries="$1"; shift
    until "$@" >/dev/null 2>&1; do
        tries=$((tries - 1))
        [ "${tries}" -gt 0 ] || return 1
        sleep 1
    done
}

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true; }
# Even majors from NODE_MIN up. Odd ones (21, 23) are short-lived and half the
# dependency tree refuses to install on them.
node_ok() {
    local major
    major=$(node_major)
    [ -n "${major}" ] && [ "${major}" -ge "$1" ] && [ $((major % 2)) -eq 0 ]
}
# Distro packages of Node come with an old npm, or with none at all.
npm_ok() {
    local version
    version=$(npm -v 2>/dev/null || true)
    [ -n "${version}" ] && dpkg --compare-versions "${version}" ge "${NPM_MIN}"
}

# The log lives in /var/log, which only root can write: nobody else can plant a
# symlink there for root to follow. It belongs to whoever runs the installer.
open_log() {
    LOG_FILE="${LOG_PATH}"
    if as_root test -L "${LOG_FILE}"; then
        die "${LOG_FILE} is a symlink. Remove it and run the installer again."
    fi
    # Removed and created again, never opened: whatever sat at that path is gone.
    if as_root rm -f -- "${LOG_FILE}" 2>/dev/null \
        && as_root install -m 600 -o "$(id -u)" -g "$(id -g)" /dev/null "${LOG_FILE}" 2>/dev/null; then
        return 0
    fi
    LOG_FILE=$(mktemp "${TMPDIR:-/tmp}/nostrcheck-install.XXXXXXXX")
}

# Prints the nginx snippet that trusts CF-Connecting-IP from Cloudflare's
# ranges: the live list, or the pinned one when it cannot be fetched or doesn't
# look like a list of networks.
cloudflare_snippet() {
    local v4 v6 source="cloudflare.com/ips-v4 and ips-v6" range
    v4=$(curl -fsS -m 15 https://www.cloudflare.com/ips-v4 2>/dev/null || true)
    v6=$(curl -fsS -m 15 https://www.cloudflare.com/ips-v6 2>/dev/null || true)
    if [ "$(printf '%s\n' "${v4}" | grep -cE '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$')" -lt 5 ] \
        || printf '%s\n' "${v4}" | grep -qvE '^([0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2})?$' \
        || [ "$(printf '%s\n' "${v6}" | grep -cE '^[0-9a-fA-F:]+/[0-9]{1,3}$')" -lt 3 ] \
        || printf '%s\n' "${v6}" | grep -qvE '^([0-9a-fA-F:]+/[0-9]{1,3})?$'; then
        source="the list pinned in scripts/install.sh (could not fetch the live one)"
        v4="${CF_FALLBACK_V4}"
        v6="${CF_FALLBACK_V6}"
    fi
    printf '# nostrcheck-server, written by scripts/install.sh --cloudflare on %s.\n' "$(date -u +%Y-%m-%d)"
    printf '# Source: %s. Re-run the installer with --cloudflare to refresh it.\n' "${source}"
    # shellcheck disable=SC2086
    for range in ${v4} ${v6}; do printf 'set_real_ip_from %s;\n' "${range}"; done
    printf 'real_ip_header CF-Connecting-IP;\n'
}

http_up() {
    local code
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$1/" || true)
    [ -n "${code}" ] && [ "${code}" != "000" ]
}

svc_start() {
    if [ "${HAS_SYSTEMD}" = "yes" ]; then
        run as_root systemctl enable --now "$1"
    else
        run as_root service "$1" start
    fi
}

INTERACTIVE="no"
ask() {
    local reply=""
    printf '  %s ' "$1" >/dev/tty
    IFS= read -r reply </dev/tty || true
    printf '%s' "${reply}"
}

main() {
    local host="${NOSTRCHECK_HOST:-}" email="${NOSTRCHECK_EMAIL:-}"
    local db="${NOSTRCHECK_DB:-nostrcheck}" db_user="${NOSTRCHECK_USER:-nostrcheck}" db_pass=""
    local media_path="${NOSTRCHECK_MEDIAPATH:-files/}"
    local pubkey="${NOSTRCHECK_PUBKEY:-}" secretkey="${NOSTRCHECK_SECRETKEY:-}"
    local branch="main" dir="" port=3000
    local assume_yes="no" ssl="yes" systemd="yes" moderation="yes" gpu="auto"
    local cloudflare="no" rewrite_nginx="no" rewrite_unit="no" explicit_dir="no"

    while [ $# -gt 0 ]; do
        case "$1" in
            --host)               host="${2:-}"; shift 2 ;;
            --email)              email="${2:-}"; shift 2 ;;
            --dir)                dir="${2:-}"; explicit_dir="yes"; shift 2 ;;
            --branch)             branch="${2:-}"; shift 2 ;;
            --db)                 db="${2:-}"; shift 2 ;;
            --user)               db_user="${2:-}"; shift 2 ;;
            --media-path)         media_path="${2:-}"; shift 2 ;;
            --pubkey)             pubkey="${2:-}"; shift 2 ;;
            --secret)             secretkey="${2:-}"; shift 2 ;;
            -y|--yes|--non-interactive) assume_yes="yes"; shift ;;
            --no-ssl)             ssl="no"; shift ;;
            --cloudflare)         cloudflare="yes"; shift ;;
            --rewrite-nginx)      rewrite_nginx="yes"; shift ;;
            --rewrite-unit)       rewrite_unit="yes"; shift ;;
            --no-systemd)         systemd="no"; shift ;;
            --no-moderation)      moderation="no"; shift ;;
            --gpu)                gpu="yes"; shift ;;
            --cpu)                gpu="no"; shift ;;
            -v|--verbose)         VERBOSE="yes"; shift ;;
            -q|--quiet)           VERBOSE="no"; shift ;;
            # Accepted for old command lines: there is no build toolchain to purge any more.
            --purge-build-deps|--keep-build-deps) shift ;;
            -h|--help)            usage; exit 0 ;;
            *) printf 'Unknown option: %s\nRun with --help for usage.\n' "$1" >&2; exit 64 ;;
        esac
    done

    # --- Preflight (no side effects yet) --------------------------------------
    command -v apt-get >/dev/null 2>&1 || die "This installer supports Debian and Ubuntu only (apt-get not found). Use the Docker setup on other systems."
    if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
        die "Run this as root, or install sudo first."
    fi
    RUN_USER=$(id -un)
    [ -d /run/systemd/system ] && HAS_SYSTEMD="yes"

    local os_id="" os_version="" os_name="unknown system"
    if [ -r /etc/os-release ]; then
        # shellcheck disable=SC1091
        os_id=$(. /etc/os-release; printf '%s' "${ID:-}")
        # shellcheck disable=SC1091
        os_version=$(. /etc/os-release; printf '%s' "${VERSION_ID:-}")
        # shellcheck disable=SC1091
        os_name=$(. /etc/os-release; printf '%s' "${PRETTY_NAME:-${ID:-unknown}}")
    fi
    local os_tested="no"
    case "${os_id}:${os_version}" in
        ubuntu:22.04|ubuntu:24.04|debian:12|debian:13) os_tested="yes" ;;
    esac
    case "$(uname -m)" in
        x86_64|aarch64) ;;
        *) die "Unsupported architecture $(uname -m). x86_64 and aarch64 are supported." ;;
    esac

    # Oracle MySQL owns the same port, socket and /var/lib/mysql as MariaDB, and
    # apt would swap one for the other with the data in place.
    local mysql_pkg
    mysql_pkg=$(dpkg-query -W -f='${Package} ${db:Status-Status}\n' mysql-server 'mysql-server-[0-9]*' mysql-community-server 2>/dev/null \
        | awk '$2 == "installed" { print $1; exit }' || true)
    [ -z "${mysql_pkg}" ] || die "Oracle MySQL is installed (${mysql_pkg}). This installer sets up MariaDB, which cannot live next to it.
  Back up its databases, remove it (sudo apt-get purge 'mysql-*') and run the installer again, or use the Docker setup."
    local mysqld_pid mysqld_exe
    for mysqld_pid in $(pgrep -x mysqld 2>/dev/null || true); do
        mysqld_exe=$(as_root readlink "/proc/${mysqld_pid}/exe" 2>/dev/null || true)
        [ -n "${mysqld_exe}" ] || continue
        if ! "${mysqld_exe%% (deleted)}" --version 2>/dev/null | grep -qi mariadb; then
            die "A MySQL server that is not MariaDB is running (${mysqld_exe}, pid ${mysqld_pid}). This installer sets up MariaDB on the same port.
  Stop and remove it first, or use the Docker setup."
        fi
    done

    if [ "${assume_yes}" != "yes" ] && { : </dev/tty; } 2>/dev/null; then
        INTERACTIVE="yes"
    fi

    # Where to install. An existing checkout or install is never moved: the one
    # this script sits in (or is run from), then whatever the systemd unit of a
    # previous install points at.
    local self_dir found="" candidate previous clone_from="" create_user="no"
    self_dir=$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd) || self_dir="${PWD}"
    previous=$(unit_dir)
    if [ -n "${previous}" ] && ! is_repo "${previous}"; then previous=""; fi
    if [ "${explicit_dir}" = "yes" ]; then
        [ -n "${dir}" ] || die "--dir needs a path."
        case "${dir}" in /*) ;; *) dir="${PWD}/${dir}" ;; esac
    else
        for candidate in "${self_dir}/.." "${PWD}" "${PWD}/nostrcheck-server"; do
            if is_repo "${candidate}"; then found=$(cd "${candidate}" && pwd); break; fi
        done
        if [ -z "${found}" ]; then
            if [ -n "${previous}" ]; then dir="${previous}"
            elif [ "$(id -u)" -eq 0 ]; then dir="${SYSTEM_DIR}"
            else dir="${PWD}/nostrcheck-server"
            fi
        elif [ "$(id -u)" -ne 0 ] || [ -f "${found}/config/local.json" ] || [ "$(stat -c '%u' "${found}")" -ne 0 ]; then
            dir="${found}"
        elif [ -n "${previous}" ]; then
            # A root-owned copy of the code next to an install that lives elsewhere.
            dir="${previous}"
        else
            # A fresh root-owned checkout: the server is installed from it, not in it.
            dir="${SYSTEM_DIR}"
            clone_from="${found}"
        fi
    fi

    [[ "${dir}" =~ ^/[A-Za-z0-9._/@+-]+$ ]] || die "Unsupported install directory: ${dir} (letters, digits and . _ - + @ only)"
    if [ -e "${dir}" ] && [ -n "$(ls -A "${dir}" 2>/dev/null)" ] && ! is_repo "${dir}"; then
        die "${dir} exists and is not a nostrcheck-server checkout. Pick another place with --dir."
    fi

    # Under root (or sudo) the server belongs to whoever owns the place it is
    # installed in, so "sudo ./install.sh" from a home directory doesn't leave a
    # root-owned tree. When that owner would be root, a new install gets its own
    # unprivileged system user instead; an install that already runs as root is
    # left as it is.
    local root_install="no"
    if [ "$(id -u)" -eq 0 ]; then
        local probe="${dir}"
        while [ ! -e "${probe}" ]; do probe=$(dirname "${probe}"); done
        RUN_USER=$(stat -c '%U' "${probe}")
        id "${RUN_USER}" >/dev/null 2>&1 || RUN_USER="root"
        if [ "${RUN_USER}" = "root" ]; then
            if [ -f "${dir}/config/local.json" ]; then
                root_install="yes"
            elif [ ! -e "${dir}" ] || [ -z "$(ls -A "${dir}" 2>/dev/null)" ]; then
                RUN_USER="${SYSTEM_USER}"
                create_user="yes"
            elif is_repo "${dir}"; then
                die "${dir} is a checkout owned by root, and the server must not run as root.
  Leave --dir out to install into ${SYSTEM_DIR} as the system user ${SYSTEM_USER}, or give the checkout to an unprivileged user (chown -R)."
            fi
        fi
    fi

    # An existing config always wins: it holds the database password and the server keys.
    local config="${dir}/config/local.json" reuse_config="no"
    if [ -f "${config}" ]; then
        reuse_config="yes"
        if command -v jq >/dev/null 2>&1; then
            local cfg_host
            cfg_host=$(jq -r '.server.host // ""' "${config}")
            if [ -n "${host}" ] && [ -n "${cfg_host}" ] && [ "${host}" != "${cfg_host}" ]; then
                printf '%swarning:%s --host %s ignored, the existing config uses %s\n' "${YELLOW}" "${RESET}" "${host}" "${cfg_host}"
            fi
            [ -z "${cfg_host}" ] || host="${cfg_host}"
        fi
    fi

    printf '\n%snostrcheck-server%s installer\n' "${BOLD}" "${RESET}"
    printf '%s%s, %s%s\n\n' "${DIM}" "${os_name}" "$(uname -m)" "${RESET}"
    [ "${os_tested}" = "yes" ] || printf '%swarning:%s %s is not a tested system (Debian 12/13, Ubuntu 22.04/24.04). Continuing anyway.\n\n' "${YELLOW}" "${RESET}" "${os_name}"

    if [ -z "${host}" ]; then
        [ "${INTERACTIVE}" = "yes" ] || die "--host <hostname> is required in non-interactive mode (or set NOSTRCHECK_HOST)."
        while [ -z "${host}" ]; do host=$(ask "Public hostname (e.g. example.com):"); done
        printf '\n'
    fi
    [[ "${host}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "Invalid hostname: ${host}"
    [[ "${db}" =~ ^[A-Za-z0-9_]+$ ]] || die "Invalid database name: ${db} (letters, digits and _ only)"
    [[ "${db_user}" =~ ^[A-Za-z0-9_]+$ ]] || die "Invalid database user: ${db_user} (letters, digits and _ only)"
    if [ -n "${pubkey}" ] || [ -n "${secretkey}" ]; then
        [[ "${pubkey}" =~ ^[0-9a-fA-F]{64}$ ]] || die "--pubkey must be 64 hex characters."
        [[ "${secretkey}" =~ ^[0-9a-fA-F]{64}$ ]] || die "--secret must be 64 hex characters, and is required with --pubkey."
    fi
    if [ "${ssl}" = "yes" ] && [ "${INTERACTIVE}" != "yes" ] && [ -z "${email}" ]; then
        ssl="no"
        local ssl_skipped="no --email given"
    fi
    # Checked again where the site is written; here it costs nothing yet.
    if [ "${rewrite_nginx}" = "yes" ] && [ "${ssl}" != "yes" ] \
        && as_root grep -Eqs '^[^#]*(listen[^;]*[^0-9]443([^0-9]|$)|ssl_certificate)' "/etc/nginx/sites-available/${host}.conf"; then
        die "--rewrite-nginx would leave /etc/nginx/sites-available/${host}.conf without TLS: certificates are not requested in this run${ssl_skipped:+ (${ssl_skipped})}. Add --email, or drop --no-ssl."
    fi

    printf '  Host        %s  (also cdn.%s and relay.%s)\n' "${host}" "${host}" "${host}"
    printf '  Directory   %s%s\n' "${dir}" "$([ -z "${clone_from}" ] || echo "  (cloned from ${clone_from})")"
    printf '  Runs as     %s%s\n' "${RUN_USER}" "$([ "${create_user}" != "yes" ] || echo "  (system user, created if missing)")"
    if [ "${reuse_config}" = "yes" ]; then
        printf '  Config      existing config/local.json, kept as it is\n'
    else
        printf '  Database    %s (user %s, password generated)\n' "${db}" "${db_user}"
    fi
    printf '  Moderation  %s\n' "$([ "${moderation}" = "yes" ] && echo "local engine (Python, torch)" || echo "skipped")"
    printf '  Service     %s\n' "$([ "${systemd}" = "yes" ] && [ "${HAS_SYSTEMD}" = "yes" ] && echo "systemd unit ${SERVICE}" || echo "none")"
    printf '  TLS         %s\n' "$([ "${ssl}" = "yes" ] && echo "Let's Encrypt via certbot" || echo "skipped${ssl_skipped:+ (${ssl_skipped})}")"

    if [ "${INTERACTIVE}" = "yes" ]; then
        local go
        printf '\n'
        go=$(ask "Continue? [Y/n]")
        case "${go}" in ""|y|Y|yes) ;; *) printf 'Aborted.\n'; exit 0 ;; esac
    fi

    open_log
    trap on_error ERR
    local started=${SECONDS}
    log "nostrcheck-server install, $(date -u '+%Y-%m-%d %H:%M:%S UTC'), ${os_name}, user ${RUN_USER}, ${dir}"
    [ "${root_install}" != "yes" ] || warn "this install belongs to root, so the server runs as root. It is left that way; the readme (standalone installation) has the steps to hand it to an unprivileged user"

    # --- 1. System packages ----------------------------------------------------
    step "System packages"
    local packages="ca-certificates curl git jq nginx mariadb-server mariadb-client redis-server ffmpeg"
    [ "${moderation}" = "yes" ] && packages="${packages} python3 python3-venv"
    [ "${ssl}" = "yes" ] && packages="${packages} certbot python3-certbot-nginx"
    note "${packages}"
    run apt_get update
    # shellcheck disable=SC2086
    run apt_get install -y --no-install-recommends ${packages}

    # --- 2. Node.js ------------------------------------------------------------
    step "Node.js"
    if node_ok "${NODE_MIN}" && npm_ok; then
        info "Node $(node -v) with npm $(npm -v) already installed"
    elif node_ok "${NODE_MIN}" && ! dpkg -s nodejs >/dev/null 2>&1; then
        # Not from a package (nvm, a tarball): replacing it is not ours to do.
        die "Node $(node -v) is fine but npm $(npm -v 2>/dev/null || echo "is missing"): ${NPM_MIN} or newer is needed. Run: npm install -g npm@latest"
    else
        local why=""
        if ! command -v node >/dev/null 2>&1; then why=""
        elif ! node_ok "${NODE_MIN}"; then why=" (replaces $(node -v), not supported)"
        else why=" (replaces $(node -v): its npm is $(npm -v 2>/dev/null || echo missing), ${NPM_MIN}+ needed)"
        fi
        note "installing Node ${NODE_MAJOR} from NodeSource${why}"
        run bash -c "set -o pipefail; curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | $([ "$(id -u)" -eq 0 ] || echo sudo -E) bash -"
        run apt_get install -y --no-install-recommends nodejs
        hash -r
        node_ok "${NODE_MIN}" || die "Node ${NODE_MAJOR} did not install. Install an LTS release of Node (${NODE_MIN} or newer) and run the installer again."
        npm_ok || die "npm $(npm -v 2>/dev/null || echo "is missing") after installing Node: ${NPM_MIN} or newer is needed."
        info "Node $(node -v) with npm $(npm -v) installed"
    fi

    # --- 3. Source -------------------------------------------------------------
    step "Source code"
    if [ "${create_user}" = "yes" ]; then
        if id "${SYSTEM_USER}" >/dev/null 2>&1; then
            note "system user ${SYSTEM_USER} already exists"
        else
            run useradd --system --user-group --home-dir "${SYSTEM_HOME}" --create-home --shell /usr/sbin/nologin "${SYSTEM_USER}"
            info "system user ${SYSTEM_USER} created (no login, home ${SYSTEM_HOME})"
        fi
    fi
    if is_repo "${dir}"; then
        info "using the code already in ${dir}"
        note "not pulled; scripts/update.sh updates an existing install"
    elif [ -e "${dir}" ] && [ -n "$(ls -A "${dir}" 2>/dev/null)" ]; then
        die "${dir} exists and is not a nostrcheck-server checkout. Pick another place with --dir."
    elif [ "${create_user}" = "yes" ]; then
        # Cloned by root into a directory nobody else can touch yet, then handed over.
        run mkdir -p "${dir}"
        if [ -n "${clone_from}" ]; then
            local src_branch src_url
            src_branch=$(git -C "${clone_from}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)
            src_url=$(git -C "${clone_from}" remote get-url origin 2>/dev/null || true)
            note "git clone ${clone_from} (${src_branch}); uncommitted changes there are not carried over"
            if [ "${src_branch}" = "HEAD" ]; then
                run git clone --no-hardlinks "${clone_from}" "${dir}"
            else
                run git clone --no-hardlinks --branch "${src_branch}" "${clone_from}" "${dir}"
            fi
            # Updates come from where that checkout came from, not from the checkout.
            run git -C "${dir}" remote set-url origin "${src_url:-${REPO_URL}}"
        else
            note "git clone ${REPO_URL} (${branch})"
            run git clone --branch "${branch}" --single-branch "${REPO_URL}" "${dir}"
        fi
        run chown -R "${RUN_USER}:" "${dir}"
        as_user test -x "${dir}" || die "${RUN_USER} cannot reach ${dir} (a parent directory is closed to it). Pick another place with --dir."
        info "cloned into ${dir}, owned by ${RUN_USER}"
    else
        note "git clone ${REPO_URL} (${branch})"
        as_user mkdir -p "$(dirname "${dir}")" 2>/dev/null || die "${RUN_USER} cannot write to $(dirname "${dir}")."
        run as_user git clone --branch "${branch}" --single-branch "${REPO_URL}" "${dir}"
        info "cloned into ${dir}"
    fi
    cd "${dir}"
    local version listen_host="127.0.0.1"
    version=$(jq -r '.version' package.json)
    if [ "${reuse_config}" = "yes" ]; then
        # The config is the owner's file: nothing read from it reaches nginx or
        # SQL without being checked first.
        host=$(jq -r --arg d "${host}" '.server.host // $d' "${config}")
        port=$(jq -r '.server.port // 3000' "${config}")
        listen_host=$(jq -r '.server.listenHost // ""' "${config}")
        db=$(jq -r '.database.database // ""' "${config}")
        db_user=$(jq -r '.database.user // ""' "${config}")
        db_pass=$(jq -r '.database.password // ""' "${config}")
        [[ "${host}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "Invalid server.host in ${config}: ${host}"
        { [[ "${port}" =~ ^[0-9]{1,5}$ ]] && [ "${port}" -ge 1 ] && [ "${port}" -le 65535 ]; } || die "Invalid server.port in ${config}: ${port}"
        [[ "${db}" =~ ^[A-Za-z0-9_]+$ ]] || die "Invalid database.database in ${config}: ${db} (letters, digits and _ only)"
        [[ "${db_user}" =~ ^[A-Za-z0-9_]+$ ]] || die "Invalid database.user in ${config}: ${db_user} (letters, digits and _ only)"
        [[ "${listen_host}" =~ ^[A-Za-z0-9.:-]*$ ]] || listen_host=""
    fi

    # --- 4. Dependencies and build ---------------------------------------------
    step "Dependencies and build (${version})"
    if [ -f package-lock.json ]; then
        note "npm ci"
        run as_user npm ci --include=optional --no-audit --no-fund
    else
        note "npm install"
        run as_user npm install --include=optional --no-audit --no-fund
    fi
    note "npm run build"
    run as_user npm run build

    # --- 5. Moderation engine --------------------------------------------------
    step "Moderation engine"
    # Whatever root runs here stays out of the checkout's reach: -I keeps the
    # current directory and the environment out of sys.path, and the venv's own
    # python only ever runs as the owner.
    local py_check='import torch, transformers, flask, PIL'
    if [ "${moderation}" != "yes" ]; then
        info "skipped (--no-moderation); local moderation stays unavailable until you re-run without it"
    elif [ -x .venv/bin/python ] && as_user .venv/bin/python -c "${py_check}" >/dev/null 2>&1; then
        info "existing .venv is complete, kept"
    else
        local py=""
        for candidate in python3 python3.12 python3.11 python3.10; do
            if command -v "${candidate}" >/dev/null 2>&1 \
                && (cd / && "${candidate}" -I -c 'import sys, venv, ensurepip; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)') >/dev/null 2>&1; then
                py="${candidate}"
                break
            fi
        done
        if [ -n "${py}" ]; then
            note "virtualenv from system $(cd / && "${py}" -I -V 2>&1)"
            run as_user "${py}" -m venv --clear .venv
        else
            # torch has no wheels for this system's Python: fetch a standalone one with uv.
            local uv
            uv="$(user_home "${RUN_USER}")/.local/bin/uv"
            note "system Python is not 3.10-3.12, using uv ${UV_VERSION} to provide Python ${UV_PYTHON}"
            if ! as_user test -x "${uv}" || [ "$(as_user "${uv}" --version 2>/dev/null | awk '{ print $2 }')" != "${UV_VERSION}" ]; then
                run as_user bash -c "set -eo pipefail; curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | env UV_NO_MODIFY_PATH=1 sh"
            fi
            run as_user "${uv}" venv --clear --seed --python "${UV_PYTHON}" .venv
        fi
        if [ "${gpu}" = "auto" ]; then
            if command -v nvidia-smi >/dev/null 2>&1; then gpu="yes"; else gpu="no"; fi
        fi
        run as_user .venv/bin/python -m pip install --no-cache-dir --upgrade pip
        if [ "${gpu}" = "no" ] && [ "$(uname -m)" = "x86_64" ]; then
            note "torch ${TORCH_VERSION} (CPU build)"
            run as_user .venv/bin/python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==${TORCH_VERSION}"
        else
            note "torch ${TORCH_VERSION}"
            run as_user .venv/bin/python -m pip install --no-cache-dir "torch==${TORCH_VERSION}"
        fi
        note "transformers ${TRANSFORMERS_VERSION}, Flask ${FLASK_VERSION}, Pillow ${PILLOW_VERSION}"
        run as_user .venv/bin/python -m pip install --no-cache-dir \
            "transformers==${TRANSFORMERS_VERSION}" "Flask==${FLASK_VERSION}" "Pillow==${PILLOW_VERSION}"
        run as_user .venv/bin/python -c "${py_check}"
        info "engine ready in .venv"
    fi

    # --- 6. Database -----------------------------------------------------------
    step "MariaDB and Redis"
    svc_start redis-server
    svc_start mariadb
    local mysql
    mysql=$(command -v mariadb || command -v mysql || true)
    [ -n "${mysql}" ] || die "MariaDB client not found after installing mariadb-client."
    wait_for 30 as_root "${mysql}" -uroot -e 'SELECT 1' || die "MariaDB is not answering on its local socket. Check: systemctl status mariadb"
    if [ "${reuse_config}" = "yes" ]; then
        if MYSQL_PWD="${db_pass}" "${mysql}" -h 127.0.0.1 -u"${db_user}" "${db}" -e 'SELECT 1' >/dev/null 2>&1; then
            info "database ${db} reachable with the credentials in config/local.json"
        else
            warn "cannot open database '${db}' as '${db_user}' with the credentials in config/local.json"
        fi
    else
        db_pass=$(random_str 32)
        [ "${#db_pass}" -eq 32 ] || die "Could not generate a database password."
        # IF NOT EXISTS + ALTER USER: converges whether or not the user was there.
        as_root "${mysql}" -uroot >>"${LOG_FILE}" 2>&1 <<SQL
CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${db_user}'@'localhost' IDENTIFIED BY '${db_pass}';
ALTER USER '${db_user}'@'localhost' IDENTIFIED BY '${db_pass}';
GRANT ALL ON \`${db}\`.* TO '${db_user}'@'localhost';
FLUSH PRIVILEGES;
SQL
        info "database ${db} and user ${db_user} ready"
    fi

    # --- 7. Configuration ------------------------------------------------------
    step "Configuration"
    if [ "${reuse_config}" = "yes" ]; then
        info "config/local.json kept"
        case "${listen_host}" in
            127.0.0.1|localhost|::1) ;;
            "") warn "server.listenHost is not set in config/local.json: port ${port} is open on every interface, and whoever reaches it directly skips nginx and can fake its client address. Set it to \"127.0.0.1\" and restart the service" ;;
            *)  note "the server listens on ${listen_host} (server.listenHost)" ;;
        esac
    else
        local session_secret
        session_secret=$(random_str 48)
        [ "${#session_secret}" -eq 48 ] || die "Could not generate a session secret."
        as_user mkdir -p config
        as_user touch config/local.json
        as_user chmod 600 config/local.json
        jq -n \
            --arg host "${host}" --arg pubkey "${pubkey}" --arg secretkey "${secretkey}" \
            --arg db "${db}" --arg dbuser "${db_user}" --arg dbpass "${db_pass}" \
            --arg media "${media_path}" --arg secret "${session_secret}" \
            '{
                server:   { host: $host, port: 3000, listenHost: "127.0.0.1", pubkey: $pubkey, secretKey: $secretkey, tosFilePath: "resources/tos.md" },
                database: { host: "127.0.0.1", database: $db, user: $dbuser, password: $dbpass },
                media:    { mediaPath: $media },
                session:  { secret: $secret }
            }' | as_user tee config/local.json >/dev/null
        info "config/local.json written (readable by ${RUN_USER} only)"
        [ -n "${pubkey}" ] || note "no server keys given: a keypair is generated on first start"
    fi

    # --- 8. nginx --------------------------------------------------------------
    step "nginx"
    local site="/etc/nginx/sites-available/${host}.conf" tls_present="no" site_has_tls="no"
    # The app believes CF-Connecting-IP before anything else, and any client can
    # send it. nginx drops it; behind Cloudflare it first turns it into the
    # connection's address, for connections that do come from Cloudflare.
    local cf_line="# Not behind Cloudflare. If that changes, re-run the installer with --cloudflare."
    if [ "${cloudflare}" != "yes" ] && as_root grep -qs "^[^#]*include ${CF_SNIPPET};" "${site}"; then
        cloudflare="yes"
        note "the site is set up for Cloudflare, kept that way"
    fi
    if [ "${cloudflare}" = "yes" ]; then
        local cf_snippet
        cf_snippet=$(cloudflare_snippet)
        as_root mkdir -p "$(dirname "${CF_SNIPPET}")"
        printf '%s\n' "${cf_snippet}" | as_root tee "${CF_SNIPPET}" >/dev/null
        cf_line="include ${CF_SNIPPET};"
        info "${CF_SNIPPET} written ($(printf '%s\n' "${cf_snippet}" | grep -c '^set_real_ip_from') ranges)"
        note "$(printf '%s\n' "${cf_snippet}" | sed -n 's/^# Source: \(.*\)\. Re-run.*/from \1/p')"
    fi
    if as_root grep -Eqs '^[^#]*(listen[^;]*[^0-9]443([^0-9]|$)|ssl_certificate)' "${site}"; then
        site_has_tls="yes"
    fi
    if [ "${site_has_tls}" = "yes" ] && [ "${rewrite_nginx}" = "yes" ] && [ "${ssl}" != "yes" ]; then
        die "--rewrite-nginx would leave ${site} without TLS: certificates are not requested in this run${ssl_skipped:+ (${ssl_skipped})}. Add --email, or drop --no-ssl."
    fi
    if [ "${site_has_tls}" = "yes" ] && [ "${rewrite_nginx}" != "yes" ]; then
        tls_present="yes"
        info "${site} already has TLS, kept (--rewrite-nginx replaces it)"
        if ! as_root grep -q '^[^#]*proxy_set_header[[:space:]]\+CF-Connecting-IP' "${site}"; then
            warn "${site} passes the CF-Connecting-IP header of any client on to the server, which lets them fake their address. Add 'proxy_set_header CF-Connecting-IP \"\";' to each server block, or re-run with --rewrite-nginx (and --cloudflare if the server is behind Cloudflare)"
        fi
        if [ "${cloudflare}" = "yes" ] && ! as_root grep -q "^[^#]*include ${CF_SNIPPET};" "${site}"; then
            warn "${site} does not include ${CF_SNIPPET} yet: add 'include ${CF_SNIPPET};' to each server block, or re-run with --rewrite-nginx"
        fi
    else
        local site_backup="" site_conf
        site_conf=$(cat <<EOF
# nostrcheck-server, written by scripts/install.sh. Re-running the installer
# rewrites this file until it has TLS (after that, only with --rewrite-nginx).

map \$http_upgrade \$nostrcheck_connection {
    default upgrade;
    ''      close;
}

# Web, API, uploads and the relay on /relay
server {
    listen 80;
    listen [::]:80;
    server_name ${host};

    client_max_body_size 100M;

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    ${cf_line}
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header CF-Connecting-IP "";
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$nostrcheck_connection;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:${port};
    }
}

# Media: cdn.${host}/<hash> -> /api/v2/media/<hash>
server {
    listen 80;
    listen [::]:80;
    server_name cdn.${host};

    client_max_body_size 100M;

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    ${cf_line}
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header CF-Connecting-IP "";
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location /static {
        proxy_pass http://127.0.0.1:${port}/static;
    }

    location / {
        proxy_pass http://127.0.0.1:${port}/api/v2/media/;
    }
}

# Relay: wss://relay.${host}
server {
    listen 80;
    listen [::]:80;
    server_name relay.${host};

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    ${cf_line}
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header CF-Connecting-IP "";
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$nostrcheck_connection;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location /static {
        proxy_pass http://127.0.0.1:${port}/static;
    }

    location / {
        proxy_pass http://127.0.0.1:${port}/api/v2/relay/;
    }
}
EOF
)
        if as_root test -f "${site}" && as_root test -e "/etc/nginx/sites-enabled/${host}.conf" \
            && [ "$(as_root cat "${site}")" = "${site_conf}" ]; then
            info "${site} is up to date"
        else
            if as_root test -f "${site}"; then
                site_backup="${site}.bak.$(date +%Y%m%d%H%M%S)"
                as_root cp -p "${site}" "${site_backup}"
            fi
            printf '%s\n' "${site_conf}" | as_root tee "${site}" >/dev/null
            as_root ln -sf "${site}" "/etc/nginx/sites-enabled/${host}.conf"
            if ! run as_root nginx -t; then
                # Don't leave nginx unable to reload because of our file.
                if [ -n "${site_backup}" ]; then as_root cp -p "${site_backup}" "${site}"; else as_root rm -f "${site}" "/etc/nginx/sites-enabled/${host}.conf"; fi
                die "nginx rejected the generated site (see ${LOG_FILE}). The previous nginx setup was restored."
            fi
            [ -z "${site_backup}" ] || note "previous site saved as ${site_backup}"
            info "${site} written"
            [ "${site_has_tls}" != "yes" ] || note "the previous site had TLS: certbot puts it back in the last step"
        fi
        [ "${cloudflare}" = "yes" ] || note "client addresses come from the connection; behind Cloudflare, re-run with --cloudflare"
    fi
    if [ "${HAS_SYSTEMD}" = "yes" ]; then
        run as_root systemctl enable nginx
        run as_root systemctl reload-or-restart nginx
    else
        run as_root service nginx restart
    fi

    # --- 9. Service ------------------------------------------------------------
    step "Service"
    local unit="/etc/systemd/system/${SERVICE}.service" service_up="no"
    if [ "${systemd}" != "yes" ]; then
        info "skipped (--no-systemd)"
    elif [ "${HAS_SYSTEMD}" != "yes" ]; then
        warn "systemd is not running here, no service created"
    else
        if [ -f "${unit}" ] && [ "${rewrite_unit}" != "yes" ]; then
            info "${unit} exists, kept"
            grep -q '^NoNewPrivileges=' "${unit}" || note "it predates the hardened unit; --rewrite-unit replaces it (a copy is kept)"
        else
            if [ -f "${unit}" ]; then
                local unit_backup
                unit_backup="${unit}.bak.$(date +%Y%m%d%H%M%S)"
                as_root cp -p "${unit}" "${unit_backup}"
                note "previous unit saved as ${unit_backup}"
            fi
            # node itself rather than npm, so systemd signals and watches the
            # server and not a wrapper. Only when "start" is a plain node command.
            local start_cmd exec_start media_abs rw_paths
            start_cmd=$(jq -r '.scripts.start // ""' package.json)
            if [[ "${start_cmd}" =~ ^node\ [A-Za-z0-9\ ./=_-]+$ ]]; then
                exec_start="$(command -v node) ${start_cmd#node }"
            else
                exec_start="$(command -v npm) run start"
            fi
            rw_paths="ReadWritePaths=${dir}"
            media_abs=$(jq -r '.storage.local.mediaPath // .media.mediaPath // ""' "${config}" 2>/dev/null || true)
            if [[ "${media_abs}" =~ ^/[A-Za-z0-9._/@+-]+$ ]]; then
                rw_paths="${rw_paths}"$'\n'"ReadWritePaths=-${media_abs}"
            fi
            as_root tee "${unit}" >/dev/null <<EOF
[Unit]
Description=nostrcheck-server
Documentation=https://github.com/quentintaranpino/nostrcheck-server
After=network-online.target mariadb.service redis-server.service
Wants=network-online.target mariadb.service redis-server.service

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${dir}
# nostrcheck: ExecStart tracks "start" in package.json, scripts/update.sh keeps it in step.
ExecStart=${exec_start}
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
${rw_paths}

[Install]
WantedBy=multi-user.target
EOF
            info "${unit} written, runs as ${RUN_USER}"
        fi
        run as_root systemctl daemon-reload
        run as_root systemctl enable "${SERVICE}"
        run as_root systemctl restart "${SERVICE}"
        note "waiting for the server on port ${port}"
        # The first start writes missing config keys and exits once so systemd restarts it.
        if wait_for 120 http_up "${port}"; then
            service_up="yes"
            info "server is answering on http://127.0.0.1:${port}"
        else
            as_root journalctl -u "${SERVICE}" --no-pager -n 40 >>"${LOG_FILE}" 2>&1 || true
            die "The service did not answer on port ${port} within 2 minutes. Check: journalctl -u ${SERVICE} -n 100"
        fi
    fi

    # --- 10. TLS ---------------------------------------------------------------
    step "TLS certificates"
    local scheme="http"
    if [ "${tls_present}" = "yes" ]; then
        scheme="https"
        info "already set up, certbot renews them on its own"
    elif [ "${ssl}" != "yes" ]; then
        info "skipped${ssl_skipped:+ (${ssl_skipped})}"
    else
        local want="y"
        [ "${INTERACTIVE}" != "yes" ] || [ -n "${email}" ] || want=$(ask "      Request Let's Encrypt certificates now? DNS must already point here. [Y/n]")
        case "${want}" in
            ""|y|Y|yes)
                local d domains=()
                for d in "${host}" "cdn.${host}" "relay.${host}"; do
                    if getent hosts "${d}" >/dev/null 2>&1; then domains+=("-d" "${d}"); else warn "${d} does not resolve, left without a certificate"; fi
                done
                if [ "${#domains[@]}" -eq 0 ]; then
                    warn "no hostname resolves yet, TLS skipped"
                else
                    local certbot_args=(--nginx --redirect --keep-until-expiring --expand "${domains[@]}") certbot_ok="no"
                    if [ -n "${email}" ]; then
                        run as_root certbot "${certbot_args[@]}" --non-interactive --agree-tos -m "${email}" && certbot_ok="yes"
                    else
                        # certbot asks for the email and the terms itself.
                        log "\$ certbot ${certbot_args[*]}"
                        as_root certbot "${certbot_args[@]}" </dev/tty && certbot_ok="yes"
                    fi
                    if [ "${certbot_ok}" = "yes" ]; then
                        scheme="https"
                        info "certificates installed, renewal is automatic"
                    else
                        warn "certbot failed (see ${LOG_FILE}); the server keeps working over http"
                    fi
                fi
                ;;
            *) info "skipped" ;;
        esac
    fi
    [ "${scheme}" = "https" ] || note "later: sudo certbot --nginx -d ${host} -d cdn.${host} -d relay.${host}"

    # --- Summary ---------------------------------------------------------------
    local elapsed=$((SECONDS - started)) ws="ws"
    [ "${scheme}" = "https" ] && ws="wss"
    printf '\n%s%snostrcheck-server %s installed%s in %dm%02ds\n\n' "${BOLD}" "${GREEN}" "${version}" "${RESET}" $((elapsed / 60)) $((elapsed % 60))
    printf '  Web         %s://%s\n' "${scheme}" "${host}"
    printf '  Media       %s://cdn.%s\n' "${scheme}" "${host}"
    printf '  Relay       %s://relay.%s  (also %s://%s/relay)\n' "${ws}" "${host}" "${ws}" "${host}"
    printf '  Local       http://127.0.0.1:%s\n\n' "${port}"
    printf '  Directory   %s\n' "${dir}"
    printf '  Config      %s  (most settings: admin panel, Settings)\n' "${config}"
    if [ "${service_up}" = "yes" ]; then
        printf '  Service     sudo systemctl status|restart|stop %s\n' "${SERVICE}"
        printf '  Logs        sudo journalctl -u %s -f\n' "${SERVICE}"
    else
        printf '  Start       cd %s && %snpm run start\n' "${dir}" "$([ "$(id -un)" = "${RUN_USER}" ] || echo "sudo -u ${RUN_USER} ")"
    fi
    printf '  Update      %s%s/scripts/update.sh\n' "$([ "$(id -un)" = "${RUN_USER}" ] || echo "sudo ")" "${dir}"
    printf '  Install log %s\n\n' "${LOG_FILE}"
    if [ "${reuse_config}" != "yes" ]; then
        printf '  First login: the server sends the admin password as a Nostr DM to its own\n'
        printf '  pubkey (server.pubkey in the config). Log in once before closing this session.\n'
        printf '  It starts in development mode: switch the environment to production in\n'
        printf '  Settings once it is reachable over HTTPS.\n\n'
    fi
    if [ "${#WARNINGS[@]}" -gt 0 ]; then
        printf '  %sWarnings%s\n' "${YELLOW}" "${RESET}"
        local w
        for w in "${WARNINGS[@]}"; do printf '    - %s\n' "${w}"; done
        printf '\n'
    fi
}

# In one group with exit: bash reads a script as it runs it, and must not go on
# reading a file that changed underneath it.
{ main "$@"; exit $?; }
