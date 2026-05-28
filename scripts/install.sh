#!/usr/bin/env bash
# nostrcheck-server installer
# Project: https://github.com/quentintaranpino/nostrcheck-server
# License: MIT

set -euo pipefail

# --- Constants ---------------------------------------------------------------
readonly VERSION="0.3.0"
readonly DATE="20260528"
readonly REPO_URL="https://github.com/quentintaranpino/nostrcheck-server.git"
readonly REPO_BRANCH="main"
readonly NODE_MAJOR=20

readonly PYENV_PY_VERSION="3.12.4"
readonly TRANSFORMERS_VERSION="4.44.2"
readonly FLASK_VERSION="3.0.3"
readonly PILLOW_VERSION="10.4.0"
readonly TORCH_VERSION="2.4.1"

readonly PACKAGES="nginx git redis-server mariadb-server mariadb-client ffmpeg jq certbot python3-certbot-nginx python3 python3-pip python3-dev python3-venv pkg-config libjpeg-dev zlib1g-dev libssl-dev build-essential libbz2-dev libreadline-dev libsqlite3-dev libffi-dev liblzma-dev tk-dev uuid-dev libncurses5-dev libncursesw5-dev curl"

readonly E_BADARGS=65

# --- Arg parsing -------------------------------------------------------------
QUIET="yes"
PURGE_BUILD_DEPS="ask"   # ask|yes|no
NON_INTERACTIVE="no"
NO_SSL="no"
NO_SYSTEMD="no"
# Field defaults come from env vars when set; CLI flags override them.
FLAG_HOST="${NOSTRCHECK_HOST:-}"
FLAG_DB="${NOSTRCHECK_DB:-}"
FLAG_USER="${NOSTRCHECK_USER:-}"
FLAG_MEDIAPATH="${NOSTRCHECK_MEDIAPATH:-}"
FLAG_PUBKEY="${NOSTRCHECK_PUBKEY:-}"
FLAG_SECRETKEY="${NOSTRCHECK_SECRETKEY:-}"

while [ $# -gt 0 ]; do
    case "$1" in
        -v|--verbose)         QUIET="no"; shift ;;
        -q|--quiet)           QUIET="yes"; shift ;;
        --purge-build-deps)   PURGE_BUILD_DEPS="yes"; shift ;;
        --keep-build-deps)    PURGE_BUILD_DEPS="no"; shift ;;
        -y|--non-interactive) NON_INTERACTIVE="yes"; shift ;;
        --no-ssl)             NO_SSL="yes"; shift ;;
        --no-systemd)         NO_SYSTEMD="yes"; shift ;;
        --host)               FLAG_HOST="${2:-}"; shift 2 ;;
        --db)                 FLAG_DB="${2:-}"; shift 2 ;;
        --user)               FLAG_USER="${2:-}"; shift 2 ;;
        --media-path)         FLAG_MEDIAPATH="${2:-}"; shift 2 ;;
        --pubkey)             FLAG_PUBKEY="${2:-}"; shift 2 ;;
        --secret)             FLAG_SECRETKEY="${2:-}"; shift 2 ;;
        -h|--help)
            cat <<EOF
Usage: $(basename "$0") [options]

Output options:
  -v, --verbose            Show full command output on screen.
  -q, --quiet              Only show step summaries (default). Full log in install.log.

Non-interactive mode (for CI / Ansible / cloud-init):
  -y, --non-interactive    Don't prompt. Use defaults + values from flags below.
  --host <hostname>        Server hostname (required in --non-interactive unless
                           NOSTRCHECK_HOST env var is set).
  --db <name>              Database name (default: nostrcheck).
  --user <name>            Database user (default: nostrcheck).
  --media-path <path>      Local media path (default: files/).
  --pubkey <hex>           Server public key in hex. Leave unset to auto-generate.
  --secret <hex>           Server secret key in hex (required if --pubkey given).
  --no-ssl                 Skip certbot.
  --no-systemd             Skip systemd service creation.

Cleanup:
  --purge-build-deps       At the end, remove Rust and -dev headers without asking.
  --keep-build-deps        At the end, keep Rust and -dev headers without asking.

  -h, --help               Show this help.

Environment variables (lower precedence than flags):
  NOSTRCHECK_HOST, NOSTRCHECK_DB, NOSTRCHECK_USER, NOSTRCHECK_MEDIAPATH,
  NOSTRCHECK_PUBKEY, NOSTRCHECK_SECRETKEY.

Examples:
  Interactive install (default):
    $(basename "$0")

  Unattended CI install:
    $(basename "$0") --non-interactive --host nostrcheck.test \\
        --no-ssl --keep-build-deps --verbose
EOF
            exit 0
            ;;
        *)
            printf 'Unknown argument: %s\n' "$1" >&2
            printf 'Run with --help for usage.\n' >&2
            exit "${E_BADARGS}"
            ;;
    esac
done

# --non-interactive needs at least --host (or NOSTRCHECK_HOST). Validate now so
# we fail fast before any side-effects.
if [ "${NON_INTERACTIVE}" = "yes" ] && [ -z "${FLAG_HOST}" ]; then
    printf 'Error: --non-interactive requires --host <hostname> (or NOSTRCHECK_HOST env var).\n' >&2
    exit "${E_BADARGS}"
fi
if [ -n "${FLAG_PUBKEY}" ] && [ -z "${FLAG_SECRETKEY}" ]; then
    printf 'Error: --pubkey requires --secret (or NOSTRCHECK_SECRETKEY env var).\n' >&2
    exit "${E_BADARGS}"
fi

# In non-interactive mode, an unset PURGE_BUILD_DEPS becomes "no" (conservative).
if [ "${PURGE_BUILD_DEPS}" = "ask" ] && [ "${NON_INTERACTIVE}" = "yes" ]; then
    PURGE_BUILD_DEPS="no"
fi

# --- Color helpers -----------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
    BOLD=$(tput bold || true)
    DIM=$(tput dim || true)
    RED=$(tput setaf 1 || true)
    GREEN=$(tput setaf 2 || true)
    YELLOW=$(tput setaf 3 || true)
    BLUE=$(tput setaf 4 || true)
    RESET=$(tput sgr0 || true)
else
    BOLD="" DIM="" RED="" GREEN="" YELLOW="" BLUE="" RESET=""
fi

step()  { printf '\n%s==>%s %s\n' "${BOLD}${BLUE}" "${RESET}" "$*"; }
sub()   { printf '%s--%s  %s\n' "${DIM}" "${RESET}" "$*"; }
ok()    { printf '%s[OK]%s    %s\n' "${GREEN}" "${RESET}" "$*"; }
warn()  { printf '%s[WARN]%s  %s\n' "${YELLOW}" "${RESET}" "$*"; }
err()   { printf '%s[ERR]%s   %s\n' "${RED}" "${RESET}" "$*" >&2; }

# --- Logging + run helpers ---------------------------------------------------
LOG_FILE="${LOG_FILE:-$(pwd)/install.log}"
: > "${LOG_FILE}" 2>/dev/null || LOG_FILE="/tmp/nostrcheck-install.log"

# In verbose mode tee everything to the log AND keep it on screen.
# In quiet mode leave stdout to the terminal so step/ok/warn helpers show,
# and only the output of run()/run_sh() gets routed to the log.
if [ "${QUIET}" != "yes" ]; then
    exec > >(tee -a "${LOG_FILE}") 2>&1
fi

# Execute a single command, honoring QUIET.
run() {
    if [ "${QUIET}" = "yes" ]; then
        "$@" >>"${LOG_FILE}" 2>&1
    else
        "$@"
    fi
}

# Execute a shell pipeline (supports |, &&, redirects), honoring QUIET.
run_sh() {
    if [ "${QUIET}" = "yes" ]; then
        bash -c "$*" >>"${LOG_FILE}" 2>&1
    else
        bash -c "$*"
    fi
}

DB_CREATED=""
NGINX_CONF_CREATED=""
SYSTEMD_UNIT_CREATED=""
REPO_CLONED=""

on_error() {
    local exit_code=$?
    local lineno=${1:-?}
    echo ""
    err "Installation failed (exit ${exit_code}) at line ${lineno}"
    echo "      Full log: ${LOG_FILE}"
    if [ "${QUIET}" = "yes" ] && [ -s "${LOG_FILE}" ]; then
        echo "      Last 30 lines of the log:"
        tail -n 30 "${LOG_FILE}" | sed 's/^/        /'
    fi
    echo ""
    echo "      Resources that may have been partially created:"
    [ -n "${REPO_CLONED}" ]          && echo "        - repository clone: ${REPO_CLONED}"
    [ -n "${DB_CREATED}" ]           && echo "        - MySQL database/user: ${DB_CREATED}"
    [ -n "${NGINX_CONF_CREATED}" ]   && echo "        - nginx config: ${NGINX_CONF_CREATED}"
    [ -n "${SYSTEMD_UNIT_CREATED}" ] && echo "        - systemd unit: ${SYSTEMD_UNIT_CREATED}"
    echo ""
    exit "${exit_code}"
}
trap 'on_error $LINENO' ERR

# Resolve the real invoking user even when running under sudo so the systemd
# unit does not end up running as root.
INVOKING_USER="${SUDO_USER:-$(id -un)}"

# --- Variables ---------------------------------------------------------------
INSTALLED_NODE_MAJOR=0
HOST=""
DB="nostrcheck"
USER="nostrcheck"
MEDIAPATH="files/"
PUBKEY=""
SECRETKEY=""
PASS=""
SECRET=""
REUSE_CONFIG="no"
EXISTING_CONFIG=""

# --- Helpers -----------------------------------------------------------------

# Generate a random alphanumeric string (safe to embed in SQL literals).
# The subshell + `set +o pipefail` swallows the SIGPIPE that `tr` receives
# when `head` closes the pipe early; this is expected behaviour, not a fault.
random_str() {
    local len="${1:-32}"
    ( set +o pipefail
      LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c "${len}"
    )
}

install_node() {
    sub "Installing Node.js ${NODE_MAJOR} via NodeSource"
    run_sh "curl -fsSL 'https://deb.nodesource.com/setup_${NODE_MAJOR}.x' | sudo -E bash -"
    run sudo apt-get install -y --no-install-recommends nodejs
    if command -v node >/dev/null 2>&1; then
        INSTALLED_NODE_MAJOR=$(node -v | grep -oP '^v\K[0-9]+' || echo 0)
    fi
}

# --- Banner ------------------------------------------------------------------
echo ""
echo "  ${BOLD}nostrcheck-server${RESET} installer  v${VERSION}  (${DATE})"
echo "  https://github.com/quentintaranpino/nostrcheck-server"
echo "  License: MIT"
echo ""
echo "  Targets Debian/Ubuntu. Tested on Ubuntu 22.04 and 24.04."
if [ "${QUIET}" = "yes" ]; then
    echo "  re-run with --verbose to see commands on screen"
fi
echo ""

if [ "${NON_INTERACTIVE}" = "yes" ]; then
    sub "Non-interactive mode, proceeding without confirmation"
else
    read -r -p "Proceed with installation? [y/n] " input
    if [ "${input:-}" != "y" ]; then
        err "Aborted by user."
        exit "${E_BADARGS}"
    fi
fi

# --- Detect previous installation -------------------------------------------
for candidate in "config/local.json" "nostrcheck-server/config/local.json"; do
    if [ -f "${candidate}" ]; then
        EXISTING_CONFIG="${candidate}"
        break
    fi
done

if [ -n "${EXISTING_CONFIG}" ]; then
    step "Previous installation detected"
    sub "Found existing config at: ${EXISTING_CONFIG}"
    if [ "${NON_INTERACTIVE}" = "yes" ]; then
        # In non-interactive mode, default to reuse so re-runs are safe.
        input="y"
        sub "Non-interactive mode: reusing existing config"
    else
        echo "      [y] Reuse it (skip DB user creation and config rewrite)"
        echo "      [n] Start fresh (a timestamped backup will be created)"
        read -r -p "Reuse existing configuration? [y/n] " input
    fi
    if [ "${input:-}" = "y" ]; then
        REUSE_CONFIG="yes"
        if command -v jq >/dev/null 2>&1; then
            DB=$(jq -r '.database.database // "nostrcheck"' "${EXISTING_CONFIG}")
            USER=$(jq -r '.database.user // "nostrcheck"' "${EXISTING_CONFIG}")
            HOST=$(jq -r '.server.host // ""' "${EXISTING_CONFIG}")
            MEDIAPATH=$(jq -r '.media.mediaPath // "files/"' "${EXISTING_CONFIG}")
            ok "Reusing values from ${EXISTING_CONFIG} (host=${HOST}, db=${DB}, user=${USER})"
        else
            sub "jq not installed yet — config will be re-read after package install"
        fi
    else
        backup="${EXISTING_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
        cp "${EXISTING_CONFIG}" "${backup}"
        ok "Backup created at ${backup}"
    fi
fi

# --- Node.js -----------------------------------------------------------------
step "Checking Node.js"
if command -v node >/dev/null 2>&1; then
    INSTALLED_NODE_MAJOR=$(node -v | grep -oP '^v\K[0-9]+' || echo 0)
    sub "Node ${INSTALLED_NODE_MAJOR} detected in PATH"
elif [ -f "/usr/local/bin/node" ]; then
    INSTALLED_NODE_MAJOR=$(/usr/local/bin/node -v | grep -oP '^v\K[0-9]+' || echo 0)
    sub "Node ${INSTALLED_NODE_MAJOR} detected in /usr/local/bin"
else
    sub "Node.js not found"
fi

if [ "${INSTALLED_NODE_MAJOR:-0}" -ge "${NODE_MAJOR}" ]; then
    ok "Node ${INSTALLED_NODE_MAJOR} is recent enough (>= ${NODE_MAJOR})"
else
    sub "Installing Node ${NODE_MAJOR} (current: ${INSTALLED_NODE_MAJOR:-none})"
    install_node
    ok "Node ${INSTALLED_NODE_MAJOR} installed"
fi

# --- System packages ---------------------------------------------------------
step "Updating package list"
run sudo apt-get update
ok "Package list updated"

step "Installing system packages"
sub "${PACKAGES}"
# shellcheck disable=SC2086
run sudo apt-get install -y --no-install-recommends ${PACKAGES}
ok "System packages installed"

# --- Rust --------------------------------------------------------------------
step "Installing Rust toolchain (required by Python tokenizers)"
run_sh "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal"
# shellcheck disable=SC1091
source "${HOME}/.cargo/env"
if ! grep -q 'cargo/bin' "${HOME}/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> "${HOME}/.bashrc"
fi
sub "$(rustc --version)"
sub "$(cargo --version)"
ok "Rust toolchain ready"

# --- Repository --------------------------------------------------------------
step "Fetching repository"
if [ -f "package.json" ] && grep -q '"name": "nostrcheck-server"' package.json 2>/dev/null; then
    sub "Running from inside the repository, pulling latest"
    run git pull --ff-only origin "${REPO_BRANCH}" || warn "git pull failed, continuing with current code"
elif [ -d "nostrcheck-server/.git" ]; then
    sub "Repository already cloned, pulling latest"
    cd "nostrcheck-server"
    run git pull --ff-only origin "${REPO_BRANCH}" || warn "git pull failed, continuing with current code"
else
    sub "git clone ${REPO_URL} (branch ${REPO_BRANCH})"
    run git clone -b "${REPO_BRANCH}" --single-branch "${REPO_URL}"
    REPO_CLONED="$(pwd)/nostrcheck-server"
    cd "nostrcheck-server"
fi

# Re-read config if we deferred earlier because jq was missing.
if [ "${REUSE_CONFIG}" = "yes" ] && [ -f "config/local.json" ] && [ -z "${HOST}" ] && command -v jq >/dev/null 2>&1; then
    DB=$(jq -r '.database.database // "nostrcheck"' config/local.json)
    USER=$(jq -r '.database.user // "nostrcheck"' config/local.json)
    HOST=$(jq -r '.server.host // ""' config/local.json)
    MEDIAPATH=$(jq -r '.media.mediaPath // "files/"' config/local.json)
    ok "Reusing values from config/local.json (host=${HOST}, db=${DB}, user=${USER})"
fi
ok "Repository ready at $(pwd)"

# --- Python venv -------------------------------------------------------------
step "Setting up Python environment (${PYENV_PY_VERSION})"
# pyenv.run refuses to install over an existing ${HOME}/.pyenv, so we check
# the directory (not just PATH) to know whether pyenv is already there from
# a previous run on this box.
if [ -d "${HOME}/.pyenv" ]; then
    sub "pyenv already present at ${HOME}/.pyenv, reusing it"
    export PATH="${HOME}/.pyenv/bin:${PATH}"
    eval "$(pyenv init -)"
    # virtualenv-init may not be installed; ignore if missing.
    eval "$(pyenv virtualenv-init - 2>/dev/null || true)"
elif ! command -v pyenv >/dev/null 2>&1; then
    sub "Installing pyenv"
    run_sh "curl https://pyenv.run | bash"
    export PATH="${HOME}/.pyenv/bin:${PATH}"
    eval "$(pyenv init -)"
    eval "$(pyenv virtualenv-init - 2>/dev/null || true)"
    if ! grep -q 'pyenv init' "${HOME}/.bashrc" 2>/dev/null; then
        {
            echo 'export PATH="$HOME/.pyenv/bin:$PATH"'
            echo 'eval "$(pyenv init -)"'
            echo 'eval "$(pyenv virtualenv-init - 2>/dev/null || true)"'
        } >> "${HOME}/.bashrc"
    fi
else
    export PATH="${HOME}/.pyenv/bin:${PATH}"
    eval "$(pyenv init -)"
    eval "$(pyenv virtualenv-init - 2>/dev/null || true)"
fi

if [ ! -e "${HOME}/.pyenv/versions/${PYENV_PY_VERSION}/bin/python" ]; then
    sub "Installing Python ${PYENV_PY_VERSION} via pyenv (compiles from source, may take several minutes)"
    run pyenv install -s "${PYENV_PY_VERSION}"
fi

PY_CMD="${HOME}/.pyenv/versions/${PYENV_PY_VERSION}/bin/python"
VENV_DIR=".venv"
if [ ! -d "${VENV_DIR}" ]; then
    sub "Creating virtualenv at ${VENV_DIR}"
    run "${PY_CMD}" -m venv "${VENV_DIR}"
else
    sub "Virtualenv already exists at ${VENV_DIR}"
fi
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

sub "Installing Python packages (torch is ~900 MB, expect a few minutes)"
run pip install --no-cache-dir -U pip setuptools wheel
run pip install --no-cache-dir \
    "transformers==${TRANSFORMERS_VERSION}" \
    "Flask==${FLASK_VERSION}" \
    "Pillow==${PILLOW_VERSION}" \
    "torch==${TORCH_VERSION}"
ok "Python environment ready"

# --- npm ---------------------------------------------------------------------
step "Installing npm dependencies"
sub "Updating npm itself"
run sudo npm install -g npm@latest
if [ -f "package-lock.json" ]; then
    sub "npm ci --include=optional --no-audit --no-fund"
    run npm ci --include=optional --no-audit --no-fund
else
    sub "npm install --include=optional --no-audit --no-fund"
    run npm install --include=optional --no-audit --no-fund
fi
ok "npm dependencies installed"

# --- Build -------------------------------------------------------------------
step "Building project"
sub "npm run build"
run npm run build
ok "Build complete"

# --- MariaDB + Redis ---------------------------------------------------------
step "Starting MariaDB and Redis"
run sudo service redis-server start
run sudo service mariadb start
ok "Services started"

MYSQL=$(which mysql || true)
if [ -z "${MYSQL}" ]; then
    err "MySQL client not found in PATH"
    exit 1
fi

# --- Database ----------------------------------------------------------------
if [ "${REUSE_CONFIG}" = "yes" ]; then
    step "Reusing existing database configuration"
    sub "db=${DB} user=${USER} (skipping DB creation)"
else
    step "Database configuration"
    if [ -n "${FLAG_DB}" ]; then
        DB="${FLAG_DB}"
        sub "Database name: ${DB} (from flag/env)"
    elif [ "${NON_INTERACTIVE}" = "yes" ]; then
        sub "Database name: ${DB} (default)"
    else
        read -r -p "Database name [${DB}]: " inputDB
        [ -n "${inputDB:-}" ] && DB="${inputDB}"
    fi
    if [ -n "${FLAG_USER}" ]; then
        USER="${FLAG_USER}"
        sub "Database user: ${USER} (from flag/env)"
    elif [ "${NON_INTERACTIVE}" = "yes" ]; then
        sub "Database user: ${USER} (default)"
    else
        read -r -p "Database user [${USER}]: " inputUSER
        [ -n "${inputUSER:-}" ] && USER="${inputUSER}"
    fi

    PASS=$(random_str 32)
    SECRET=$(random_str 32)
    if [ "${#PASS}" -lt 16 ] || [ "${#SECRET}" -lt 16 ]; then
        err "Failed to generate random secrets"
        exit 1
    fi

    # Idempotent: CREATE USER IF NOT EXISTS + ALTER USER ensures both the
    # fresh-install and "reinstall with a new password" paths converge.
    SQL="CREATE DATABASE IF NOT EXISTS \`${DB}\`;
CREATE USER IF NOT EXISTS '${USER}'@'localhost' IDENTIFIED BY '${PASS}';
ALTER USER '${USER}'@'localhost' IDENTIFIED BY '${PASS}';
GRANT ALL ON \`${DB}\`.* TO '${USER}'@'localhost';
FLUSH PRIVILEGES;"

    if sudo "${MYSQL}" -uroot -e "${SQL}"; then
        DB_CREATED="${DB}/${USER}"
        ok "Database '${DB}' and user '${USER}' configured"
    else
        err "Failed to create database or user"
        exit 1
    fi
fi

# --- Hostname ----------------------------------------------------------------
if [ "${REUSE_CONFIG}" = "yes" ] && [ -n "${HOST}" ]; then
    step "Server hostname: ${HOST} (reused)"
elif [ -n "${FLAG_HOST}" ]; then
    HOST="${FLAG_HOST}"
    step "Server hostname: ${HOST} (from flag/env)"
else
    step "Server hostname"
    sub "Used for nginx server_name; SSL certs will be requested for HOST, cdn.HOST, relay.HOST"
    while [ -z "${HOST}" ]; do
        read -r -p "Enter hostname (e.g. nostrcheck.me): " HOST
        if [ -z "${HOST}" ]; then
            warn "Hostname is required"
        fi
    done
fi

# --- Media path --------------------------------------------------------------
if [ "${REUSE_CONFIG}" != "yes" ]; then
    if [ -n "${FLAG_MEDIAPATH}" ]; then
        MEDIAPATH="${FLAG_MEDIAPATH}"
        step "Media storage path: ${MEDIAPATH} (from flag/env)"
    elif [ "${NON_INTERACTIVE}" = "yes" ]; then
        step "Media storage path: ${MEDIAPATH} (default)"
    else
        step "Media storage path"
        sub "Where uploaded media files will be stored (local). S3 can be configured later in admin settings."
        read -r -p "Files path [${MEDIAPATH}]: " inputMEDIAPATH
        [ -n "${inputMEDIAPATH:-}" ] && MEDIAPATH="${inputMEDIAPATH}"
    fi
fi

# --- Server keypair ----------------------------------------------------------
if [ "${REUSE_CONFIG}" != "yes" ]; then
    if [ -n "${FLAG_PUBKEY}" ]; then
        PUBKEY="${FLAG_PUBKEY}"
        SECRETKEY="${FLAG_SECRETKEY}"
        step "Server keypair: provided via flag/env"
    elif [ "${NON_INTERACTIVE}" = "yes" ]; then
        step "Server keypair: none provided, will be auto-generated on first run"
    else
        step "Server keypair"
        sub "Leave empty to let the server generate one on first run"
        sub "Hex format. Convert npub→hex at https://nostrcheck.me/converter/"
        read -r -p "Public key (hex, optional): " PUBKEY
        if [ -n "${PUBKEY}" ]; then
            while [ -z "${SECRETKEY}" ]; do
                read -r -p "Secret key (hex, required if pubkey given): " SECRETKEY
                if [ -z "${SECRETKEY}" ]; then
                    warn "Secret key empty — discarding pubkey, server will generate one"
                    PUBKEY=""
                    break
                fi
            done
        fi
    fi
fi

# --- Write config ------------------------------------------------------------
if [ "${REUSE_CONFIG}" = "yes" ]; then
    step "Keeping existing config/local.json"
else
    step "Writing config/local.json"
    mkdir -p config
    jq -n \
        --arg a "${HOST}" --arg b "${PUBKEY}" --arg c "${SECRETKEY}" \
        --arg d "${DB}"   --arg e "${USER}"   --arg f "${PASS}" \
        --arg g "${MEDIAPATH}" --arg h "${SECRET}" \
        '{
            server:   { host: $a, port: 3000, pubkey: $b, secretKey: $c, tosFilePath: "resources/tos.md" },
            database: { host: "127.0.0.1", database: $d, user: $e, password: $f },
            media:    { mediaPath: $g },
            session:  { secret: $h }
        }' > config/local.json
    ok "config/local.json written"
fi

# --- nginx -------------------------------------------------------------------
step "Configuring nginx"
NGINX_CONF="/etc/nginx/sites-available/${HOST}.conf"
sudo tee "${NGINX_CONF}" > /dev/null <<EOF
server {
    listen 80;
    server_name ${HOST};
    client_max_body_size 100M;

    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}

server {
    listen 80;
    server_name cdn.${HOST};
    client_max_body_size 100M;

    location /static {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:3000/static;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:3000/api/v2/media/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name relay.${HOST};

    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:3000/api/v2/relay/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        keepalive_timeout 65s;
        keepalive_requests 10000;
    }

    location /static {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:3000/static;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
NGINX_CONF_CREATED="${NGINX_CONF}"
sudo ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/${HOST}.conf"
run sudo nginx -t
run sudo service nginx restart
ok "nginx configured for ${HOST}, cdn.${HOST}, relay.${HOST}"

# --- systemd -----------------------------------------------------------------
step "systemd service"
SYSTEMD_SERVICE_CREATED="no"
ABSOLUTE_PATH=$(realpath "$(pwd)")
if [ "${NO_SYSTEMD}" = "yes" ]; then
    input="n"
    sub "Skipping systemd service (--no-systemd)"
elif [ "${NON_INTERACTIVE}" = "yes" ]; then
    input="y"
    sub "Non-interactive mode: creating systemd service"
else
    read -r -p "Create a systemd service so the server starts on boot? [Y/n] " input
fi
if [ "${input:-y}" != "n" ] && [ "${input:-y}" != "N" ]; then
    sudo tee /etc/systemd/system/nostrcheck.service > /dev/null <<EOF
[Unit]
Description=Nostrcheck server
After=network.target

[Service]
Type=simple
User=${INVOKING_USER}
WorkingDirectory=${ABSOLUTE_PATH}
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    SYSTEMD_UNIT_CREATED="/etc/systemd/system/nostrcheck.service"
    run sudo systemctl daemon-reload
    run sudo systemctl enable nostrcheck
    run sudo systemctl start nostrcheck
    if sudo systemctl is-active --quiet nostrcheck; then
        SYSTEMD_SERVICE_CREATED="yes"
        ok "systemd service nostrcheck.service running as ${INVOKING_USER}"
    else
        warn "Service failed to start. Check: sudo systemctl status nostrcheck"
    fi
fi

# --- SSL (certbot) -----------------------------------------------------------
step "SSL via Let's Encrypt"
sub "Certbot will attempt to issue for ${HOST}, cdn.${HOST}, relay.${HOST}"
sub "DNS A/AAAA records must point to this server"
if [ "${NO_SSL}" = "yes" ]; then
    input_ssl="n"
    sub "Skipping SSL (--no-ssl)"
elif [ "${NON_INTERACTIVE}" = "yes" ]; then
    # Certbot needs email + ToS acceptance interactively, so skip in CI/unattended
    # unless the caller explicitly wants to handle it themselves (then drop --no-ssl).
    input_ssl="n"
    sub "Non-interactive mode: skipping certbot (pass an explicit cert manually if needed)"
else
    read -r -p "Proceed with Certbot now? [Y/n] " input_ssl
fi
if [ "${input_ssl:-y}" != "n" ] && [ "${input_ssl:-y}" != "N" ]; then
    CANDIDATES=("${HOST}" "cdn.${HOST}" "relay.${HOST}")
    RESOLVING=()
    for d in "${CANDIDATES[@]}"; do
        if getent hosts "${d}" >/dev/null; then
            RESOLVING+=("${d}")
        else
            warn "${d} does not resolve from this machine, will be skipped"
        fi
    done

    if [ "${#RESOLVING[@]}" -eq 0 ]; then
        warn "No resolvable domains, skipping SSL setup"
    else
        CB_ARGS=()
        for d in "${RESOLVING[@]}"; do CB_ARGS+=("-d" "${d}"); done

        CERT_ANY_OK=0
        sub "Attempting multi-domain certificate for: ${RESOLVING[*]}"
        if sudo certbot --nginx --redirect "${CB_ARGS[@]}"; then
            CERT_ANY_OK=1
            ok "Multi-domain certificate obtained"
        else
            warn "Multi-domain attempt failed, falling back to per-domain"
            for d in "${RESOLVING[@]}"; do
                sub "Trying ${d}"
                if sudo certbot --nginx --redirect -d "${d}"; then
                    CERT_ANY_OK=1
                    ok "Certificate obtained for ${d}"
                else
                    warn "Failed to obtain certificate for ${d}"
                fi
            done
        fi

        if [ "${CERT_ANY_OK}" -eq 1 ]; then
            if sudo nginx -t && sudo systemctl restart nginx; then
                ok "nginx restarted with SSL"
            else
                warn "nginx restart failed after certbot, check service status"
            fi
        else
            warn "No certificates issued, continuing without SSL"
        fi
    fi
fi

# --- Cleanup -----------------------------------------------------------------
step "Cleaning install-time caches"
sub "pip cache"
run_sh "pip cache purge || true"
sub "npm cache"
run npm cache clean --force
sub "apt downloaded .deb files"
run sudo apt-get clean
sub "pyenv tarball cache"
rm -rf "${HOME}/.pyenv/cache" 2>/dev/null || true
ok "Caches cleared (~500 MB-1 GB reclaimed)"

# Optional: drop Rust toolchain and -dev headers used only at compile time.
# Their runtime libraries (libssl3, libjpeg62-turbo, etc.) stay installed,
# so the running app is unaffected. If the user later updates a native
# dep and pip/npm need to rebuild, the toolchain will have to be reinstalled.
should_purge="no"
case "${PURGE_BUILD_DEPS}" in
    yes) should_purge="yes" ;;
    no)  should_purge="no" ;;
    ask)
        if [ "${NON_INTERACTIVE}" = "yes" ]; then
            should_purge="no"
        else
            step "Reclaim extra disk by removing build toolchains?"
            sub "Removes: Rust toolchain (~500 MB) and -dev headers (~300 MB)."
            sub "These are only needed to recompile native modules from source."
            sub "Runtime libraries stay. Re-running the installer reinstalls them if needed."
            read -r -p "Remove now? [y/N] " input
            case "${input:-}" in
                y|Y) should_purge="yes" ;;
                *)   should_purge="no" ;;
            esac
        fi
        ;;
esac

if [ "${should_purge}" = "yes" ]; then
    step "Removing build toolchains"
    sub "Removing -dev headers and build-essential"
    # shellcheck disable=SC2086
    run sudo apt-get remove --purge -y \
        libjpeg-dev zlib1g-dev libssl-dev libbz2-dev libreadline-dev \
        libsqlite3-dev libffi-dev liblzma-dev tk-dev uuid-dev \
        libncurses5-dev libncursesw5-dev python3-dev pkg-config build-essential
    run sudo apt-get autoremove -y
    sub "Removing Rust toolchain"
    rm -rf "${HOME}/.cargo" "${HOME}/.rustup" 2>/dev/null || true
    sudo rm -rf /usr/local/cargo /usr/local/rustup 2>/dev/null || true
    sed -i '/cargo\/bin/d' "${HOME}/.bashrc" 2>/dev/null || true
    ok "Build toolchains removed (~700-800 MB freed)"
fi

# --- Done --------------------------------------------------------------------
echo ""
echo "${BOLD}Installation complete.${RESET}"
echo ""
if [ "${SYSTEMD_SERVICE_CREATED}" = "yes" ]; then
    echo "  Service control:"
    echo "    sudo systemctl status nostrcheck"
    echo "    sudo systemctl restart nostrcheck"
    echo "    sudo systemctl stop nostrcheck"
else
    echo "  Start the server manually:"
    echo "    cd ${ABSOLUTE_PATH} && npm run start"
fi
echo ""
echo "  Documentation:  https://github.com/quentintaranpino/nostrcheck-server/wiki"
echo "  Log file:       ${LOG_FILE}"
echo ""
if [ -z "${PUBKEY}" ] && [ "${REUSE_CONFIG}" != "yes" ]; then
    echo "  Pubkey/secret pair not provided — server will generate one on first run"
    echo "  and store it in config/local.json"
    echo ""
fi
echo "  On first login, the admin user receives a DM with the new password at the"
echo "  configured pubkey. Make sure you can log in before closing this session."
echo ""
