#!/bin/sh
# Entry point of the Docker image. The server runs as "node" (uid 1000), not as
# root: directories mounted from the host have to be writable by it. compose.yml
# takes care of that; with plain "docker run" it is up to whoever mounts them.
set -eu

for dir in files config logs; do
    if [ -d "${dir}" ] && [ ! -w "${dir}" ]; then
        echo "nostrcheck-server: ${PWD}/${dir} is not writable by $(id -un) (uid $(id -u))." >&2
        echo "  The image no longer runs as root. On the host, give the mounted directories to uid $(id -u):" >&2
        echo "    sudo chown -R $(id -u):$(id -g) files config logs" >&2
        exit 1
    fi
done

exec "$@"
