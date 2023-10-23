#!/bin/bash

# Check if the user is root
if [ "$(id -u)" != "0" ]; then
    echo ""
    echo "This script must be run as root. Try using sudo"
    echo ""
    exit $E_BADARGS
fi

# Detect the script base path
BASEDIR=$(dirname "$0")
echo "$BASEDIR"

# If the folder name is not scripts exit
if [ "$(basename "$(pwd)")" != "scripts" ]; then
    echo ""
    echo "This script must be run from the scripts folder"
    echo ""
    exit $E_BADARGS
fi

cd ..

readonly E_BADARGS=65
readonly version="0.1"
readonly date="20231018"

clear
echo ""
echo ""
echo "███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
echo "████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
echo "██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝     ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
echo "██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
echo "██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
echo "╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
echo ""
echo "Nostrcheck server update script v$version"
echo "Last updated: $date"
echo "Project repository: https://github.com/quentintaranpino/nostrcheck-api-ts/"
echo "--------------------------------------------------------------------------------"
echo ""
echo "This script will update the nostrcheck server on your system."
echo "WARNING: This script is still in development and may not work as expected."
echo ""

# We ask user if want to continue
echo "Do you want to proceed with the update? [y/n]"
echo "The server will be stopped during the update process."
echo ""
read -r input
if [ "$input" != "y" ]; then
    echo "Exiting..."
    exit $E_BADARGS
fi

echo $(cd ../ && pwd)

# Read config/local.json to get the database.password value
echo ""
DB_PASSWORD=$(cat config/local.json | jq -r '.database.password')

# Stop the server using POST request http://localhost:3000/api/v2/admin/stop 
echo ""
echo "Stopping the server..."
echo ""
curl --location --request POST 'http://localhost:3000/api/v2/admin/stop' --header 'authorization: $DB_PASSWORD'

# Update repository data
echo ""
echo "Updating repository data..."
echo ""
git stash -u
git pull
git stash pop

# Update node modules
echo ""
echo "Updating node modules..."
echo ""
npm install


# Build the project
echo ""
echo "Building the project..."
echo ""
npm run build

# Finish
echo ""
echo "Update finished."
echo "You can now start the server again using the command: npm run start"
echo ""
exit 0


