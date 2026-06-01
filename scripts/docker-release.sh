#!/usr/bin/env bash
# nostrcheck-server multi-arch docker release
# Builds linux/amd64 + linux/arm64 from Dockerfile.build and pushes to Docker Hub.
# Project: https://github.com/quentintaranpino/nostrcheck-server
# License: MIT

set -euo pipefail

readonly REPO="nostrcheckme/nostrcheck-server"
readonly BUILDER_NAME="nostrcheck-builder"
readonly DOCKERFILE="Dockerfile.build"
readonly PLATFORMS="linux/amd64,linux/arm64"

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
step() { printf '\n%s==>%s %s\n' "${BOLD}${BLUE}" "${RESET}" "$*"; }
sub()  { printf '%s--%s  %s\n' "${DIM}" "${RESET}" "$*"; }
ok()   { printf '%s[OK]%s    %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[WARN]%s  %s\n' "${YELLOW}" "${RESET}" "$*"; }
err()  { printf '%s[ERR]%s   %s\n' "${RED}" "${RESET}" "$*" >&2; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

By default builds + pushes nostrcheckme/nostrcheck-server:<version> for amd64+arm64,
where <version> is the x.y.z from package.json (the build segment is dropped).

Options:
  --include-latest    Also push :latest (use on stable releases only).
  --include-testing   Also push :testing (use on pre-releases).
  --tag <name>        Push an extra explicit tag. Can be repeated.
  --no-version-tag    Skip the :<version> tag.
  --no-push           Build only, do not push. Image stays in builder cache.
  -h, --help          Show this help.

Examples:
  Stable release (0.7.1 + latest):
    $(basename "$0") --include-latest

  Pre-release on testing tag:
    $(basename "$0") --no-version-tag --include-testing

  Local smoke build, no push:
    $(basename "$0") --no-push

EOF
    exit 0
}

# --- Arg parsing -------------------------------------------------------------
PUSH="yes"
INCLUDE_VERSION="yes"
INCLUDE_LATEST="no"
INCLUDE_TESTING="no"
EXTRA_TAGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --tag)              EXTRA_TAGS+=("$2"); shift 2 ;;
        --no-push)          PUSH="no"; shift ;;
        --no-version-tag)   INCLUDE_VERSION="no"; shift ;;
        --include-latest)   INCLUDE_LATEST="yes"; shift ;;
        --include-testing)  INCLUDE_TESTING="yes"; shift ;;
        -h|--help)          usage ;;
        *) err "Unknown argument: $1"; usage ;;
    esac
done

# --- Resolve project root ----------------------------------------------------
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
cd "${PROJECT_ROOT}"

if [ ! -f "${DOCKERFILE}" ]; then
    err "${DOCKERFILE} not found in ${PROJECT_ROOT}"
    exit 1
fi

# --- Version from package.json ----------------------------------------------
if ! command -v node >/dev/null 2>&1; then
    err "node is required to read the version from package.json"
    exit 1
fi
RAW_VERSION=$(node -p "require('./package.json').version")
VERSION=$(echo "${RAW_VERSION}" | cut -d. -f1-3)

# --- Plan --------------------------------------------------------------------
step "Release plan"
sub "Repo:          ${REPO}"
sub "Dockerfile:    ${DOCKERFILE}"
sub "Platforms:     ${PLATFORMS}"
sub "package.json:  ${RAW_VERSION}"
sub "Image version: ${VERSION}"

TAGS=()
[ "${INCLUDE_VERSION}" = "yes" ] && TAGS+=("-t" "${REPO}:${VERSION}")
[ "${INCLUDE_LATEST}" = "yes" ]  && TAGS+=("-t" "${REPO}:latest")
[ "${INCLUDE_TESTING}" = "yes" ] && TAGS+=("-t" "${REPO}:testing")
for t in "${EXTRA_TAGS[@]:-}"; do
    [ -n "${t}" ] && TAGS+=("-t" "${REPO}:${t}")
done

if [ "${#TAGS[@]}" -eq 0 ]; then
    err "No tags selected. Re-run with --include-latest, --include-testing or --tag <name>."
    exit 1
fi

sub "Tags:"
for ((i=1; i<${#TAGS[@]}; i+=2)); do
    sub "  ${TAGS[$i]}"
done

# --- Login check (push mode only) -------------------------------------------
if [ "${PUSH}" = "yes" ]; then
    if ! docker info 2>/dev/null | grep -q "Username:"; then
        warn "Docker daemon is not logged in to a registry."
        warn "Run: docker login   (Hub username: nostrcheckme)"
        read -r -p "Continue anyway? [y/n] " input
        [ "${input:-}" != "y" ] && exit 1
    fi
fi

# --- Buildx builder ----------------------------------------------------------
step "Preparing buildx builder"
if ! docker buildx inspect "${BUILDER_NAME}" >/dev/null 2>&1; then
    sub "Creating builder ${BUILDER_NAME}"
    docker buildx create --use --name "${BUILDER_NAME}" --driver docker-container
else
    sub "Reusing existing builder ${BUILDER_NAME}"
    docker buildx use "${BUILDER_NAME}"
fi
docker buildx inspect --bootstrap >/dev/null
ok "Builder ready"

# --- Build -------------------------------------------------------------------
step "Building multi-arch image"
BUILD_ARGS=("--platform" "${PLATFORMS}" "-f" "${DOCKERFILE}" "${TAGS[@]}" ".")
if [ "${PUSH}" = "yes" ]; then
    BUILD_ARGS+=("--push")
    sub "Will push manifests to Docker Hub on success"
else
    sub "--no-push: image stays in builder cache only"
fi

docker buildx build "${BUILD_ARGS[@]}"
ok "Build complete"

if [ "${PUSH}" = "yes" ]; then
    step "Published tags"
    for ((i=1; i<${#TAGS[@]}; i+=2)); do
        ok "${TAGS[$i]}"
    done
fi
