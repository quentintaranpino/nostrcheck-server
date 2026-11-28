#!/usr/bin/env bash
# nostrcheck-server installer
# https://github.com/quentintaranpino/nostrcheck-server
# License: MIT
#
# Sets up a standalone server on Debian/Ubuntu: system packages, Node.js, the
# app, the local moderation engine, MariaDB, Redis, nginx and a systemd unit.
# The app and its service belong to the user running this (under root or sudo:
# to the owner of the install directory).
# Safe to re-run: an existing config/local.json, its database, the systemd unit
# and a TLS-enabled nginx site are kept as they are.

set -Eeuo pipefail

readonly REPO_URL="https://github.com/quentintaranpino/nostrcheck-server.git"
readonly SERVICE="nostrcheck"
readonly NODE_MAJOR=24          # installed when Node is missing or too old
readonly NODE_MIN=20            # oldest Node the server runs on
readonly UV_PYTHON="3.12"       # used when the system Python is not 3.10-3.12
readonly TORCH_VERSION="2.4.1"
readonly TRANSFORMERS_VERSION="4.44.2"
readonly FLASK_VERSION="3.0.3"
readonly PILLOW_VERSION="10.4.0"
readonly STEPS=10

usage() {
    cat <<EOF
Usage: install.sh [options]

Installs nostrcheck-server on Debian or Ubuntu. Run it as root or as a user
with sudo; the server runs as the owner of the install directory. Re-running
it is safe.

Options:
  --host <hostname>      Public hostname, e.g. example.com. Asked if missing.
  -y, --non-interactive  Never prompt. Needs --host.
  --email <address>      Let's Encrypt account email. Lets certbot run unattended.
  --no-ssl               Don't request TLS certificates.
  --no-systemd           Don't create or start the systemd service.
  --no-moderation        Skip the local moderation engine (Python, torch).
  --gpu, --cpu           Force the CUDA or the CPU build of torch (default: CUDA
                         only when nvidia-smi is present).
  --dir <path>           Install directory (default: this checkout, or ./nostrcheck-server).
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
as_user() { if [ "$(id -un)" = "${RUN_USER}" ]; then "$@"; else sudo -H -u "${RUN_USER}" -- "$@"; fi; }
apt_get() { as_root env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -o DPkg::Lock::Timeout=120 "$@"; }

is_repo() { [ -f "$1/package.json" ] && grep -q '"name": "nostrcheck-server"' "$1/package.json"; }

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

    while [ $# -gt 0 ]; do
        case "$1" in
            --host)               host="${2:-}"; shift 2 ;;
            --email)              email="${2:-}"; shift 2 ;;
            --dir)                dir="${2:-}"; shift 2 ;;
            --branch)             branch="${2:-}"; shift 2 ;;
            --db)                 db="${2:-}"; shift 2 ;;
            --user)               db_user="${2:-}"; shift 2 ;;
            --media-path)         media_path="${2:-}"; shift 2 ;;
            --pubkey)             pubkey="${2:-}"; shift 2 ;;
            --secret)             secretkey="${2:-}"; shift 2 ;;
            -y|--yes|--non-interactive) assume_yes="yes"; shift ;;
            --no-ssl)             ssl="no"; shift ;;
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

    if [ "${assume_yes}" != "yes" ] && { : </dev/tty; } 2>/dev/null; then
        INTERACTIVE="yes"
    fi

    local self_dir
    self_dir=$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd) || self_dir="${PWD}"
    if [ -z "${dir}" ]; then
        if is_repo "${self_dir}/.."; then dir=$(cd "${self_dir}/.." && pwd)
        elif is_repo "${PWD}"; then dir="${PWD}"
        else dir="${PWD}/nostrcheck-server"
        fi
    fi
    case "${dir}" in /*) ;; *) dir="${PWD}/${dir}" ;; esac

    # Under root (or sudo) the server belongs to whoever owns the place it is
    # installed in, so "sudo ./install.sh" from a home directory doesn't leave a
    # root-owned tree, and the service doesn't run as root there.
    if [ "$(id -u)" -eq 0 ]; then
        local probe="${dir}"
        while [ ! -e "${probe}" ]; do probe=$(dirname "${probe}"); done
        RUN_USER=$(stat -c '%U' "${probe}")
        id "${RUN_USER}" >/dev/null 2>&1 || RUN_USER="root"
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
    printf '%s%s, %s, running as %s%s\n\n' "${DIM}" "${os_name}" "$(uname -m)" "${RUN_USER}" "${RESET}"
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

    printf '  Host        %s  (also cdn.%s and relay.%s)\n' "${host}" "${host}" "${host}"
    printf '  Directory   %s\n' "${dir}"
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

    LOG_FILE="${LOG_FILE:-${PWD}/install.log}"
    : 2>/dev/null >"${LOG_FILE}" || LOG_FILE="/tmp/nostrcheck-install.log"
    : >"${LOG_FILE}"
    trap on_error ERR
    local started=${SECONDS}
    log "nostrcheck-server install, $(date -u '+%Y-%m-%d %H:%M:%S UTC'), ${os_name}, user ${RUN_USER}"

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
    if node_ok "${NODE_MIN}"; then
        info "Node $(node -v) already installed"
    else
        note "installing Node ${NODE_MAJOR} from NodeSource$(command -v node >/dev/null 2>&1 && echo " (replaces $(node -v), not supported)")"
        run bash -c "set -o pipefail; curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | $([ "$(id -u)" -eq 0 ] || echo sudo -E) bash -"
        run apt_get install -y --no-install-recommends nodejs
        node_ok "${NODE_MIN}" || die "Node ${NODE_MAJOR} did not install. Install an LTS release of Node (${NODE_MIN} or newer) and run the installer again."
        info "Node $(node -v) installed"
    fi

    # --- 3. Source -------------------------------------------------------------
    step "Source code"
    if is_repo "${dir}"; then
        info "using the code already in ${dir}"
        note "not pulled; scripts/update.sh updates an existing install"
    elif [ -e "${dir}" ] && [ -n "$(ls -A "${dir}" 2>/dev/null)" ]; then
        die "${dir} exists and is not a nostrcheck-server checkout. Pick another place with --dir."
    else
        note "git clone ${REPO_URL} (${branch})"
        as_user mkdir -p "$(dirname "${dir}")" 2>/dev/null || die "${RUN_USER} cannot write to $(dirname "${dir}")."
        run as_user git clone --branch "${branch}" --single-branch "${REPO_URL}" "${dir}"
        info "cloned into ${dir}"
    fi
    cd "${dir}"
    local version
    version=$(jq -r '.version' package.json)
    if [ "${reuse_config}" = "yes" ]; then
        host=$(jq -r --arg d "${host}" '.server.host // $d' "${config}")
        port=$(jq -r '.server.port // 3000' "${config}")
        db=$(jq -r '.database.database // ""' "${config}")
        db_user=$(jq -r '.database.user // ""' "${config}")
        db_pass=$(jq -r '.database.password // ""' "${config}")
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
    local py_check='import torch, transformers, flask, PIL'
    if [ "${moderation}" != "yes" ]; then
        info "skipped (--no-moderation); local moderation stays unavailable until you re-run without it"
    elif [ -x .venv/bin/python ] && as_user .venv/bin/python -c "${py_check}" >/dev/null 2>&1; then
        info "existing .venv is complete, kept"
    else
        local py="" candidate
        for candidate in python3 python3.12 python3.11 python3.10; do
            if command -v "${candidate}" >/dev/null 2>&1 \
                && "${candidate}" -c 'import sys, venv, ensurepip; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)' >/dev/null 2>&1; then
                py="${candidate}"
                break
            fi
        done
        if [ -n "${py}" ]; then
            note "virtualenv from system $("${py}" -V 2>&1)"
            run as_user "${py}" -m venv --clear .venv
        else
            # torch has no wheels for this system's Python: fetch a standalone one with uv.
            local user_home uv
            user_home=$(getent passwd "${RUN_USER}" | cut -d: -f6)
            uv="${user_home}/.local/bin/uv"
            note "system Python is not 3.10-3.12, using uv to provide Python ${UV_PYTHON}"
            if [ ! -x "${uv}" ]; then
                run as_user sh -c 'set -e; curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh'
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
                server:   { host: $host, port: 3000, pubkey: $pubkey, secretKey: $secretkey, tosFilePath: "resources/tos.md" },
                database: { host: "127.0.0.1", database: $db, user: $dbuser, password: $dbpass },
                media:    { mediaPath: $media },
                session:  { secret: $secret }
            }' | as_user tee config/local.json >/dev/null
        info "config/local.json written (readable by ${RUN_USER} only)"
        [ -n "${pubkey}" ] || note "no server keys given: a keypair is generated on first start"
    fi

    # --- 8. nginx --------------------------------------------------------------
    step "nginx"
    local site="/etc/nginx/sites-available/${host}.conf" tls_present="no"
    if as_root test -f "${site}" && as_root grep -q 'managed by Certbot' "${site}"; then
        tls_present="yes"
        info "${site} already has TLS set up by certbot, kept"
    else
        local site_backup=""
        if as_root test -f "${site}"; then
            site_backup="${site}.bak.$(date +%Y%m%d%H%M%S)"
            as_root cp -p "${site}" "${site_backup}"
        fi
        as_root tee "${site}" >/dev/null <<EOF
# nostrcheck-server, written by scripts/install.sh. Re-running the installer
# rewrites this file until certbot has added TLS to it.

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
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
        as_root ln -sf "${site}" "/etc/nginx/sites-enabled/${host}.conf"
        if ! run as_root nginx -t; then
            # Don't leave nginx unable to reload because of our file.
            if [ -n "${site_backup}" ]; then as_root cp -p "${site_backup}" "${site}"; else as_root rm -f "${site}" "/etc/nginx/sites-enabled/${host}.conf"; fi
            die "nginx rejected the generated site (see ${LOG_FILE}). The previous nginx setup was restored."
        fi
        [ -z "${site_backup}" ] || note "previous site saved as ${site_backup}"
        info "${site} written"
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
        if [ -f "${unit}" ]; then
            info "${unit} exists, kept"
        else
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
ExecStart=$(command -v npm) run start
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

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
        printf '  Start       cd %s && npm run start\n' "${dir}"
    fi
    printf '  Update      %s/scripts/update.sh\n' "${dir}"
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

main "$@"
