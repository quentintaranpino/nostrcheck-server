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
readonly version="0.3"
readonly date="20240718"

# Node version
NODE_MAJOR=21

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
echo "███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
echo "██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
echo "███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
echo "╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
echo "███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
echo "╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
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
echo "The server must be stopped during the update process."
echo ""
read -r input
if [ "$input" != "y" ]; then
    echo "Exiting..."
    exit $E_BADARGS
fi

echo $(cd ../ && pwd)

# Update repository data
clear
echo "Updating repository data..."
echo ""
git stash -u
git pull
git stash pop

# Update Node.js
clear
echo "Updating Node.js..."
echo ""
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg python3 python3-pip
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt-get install nodejs -y

# Update npm
clear
echo "Updating npm..."
npm install -g npm@latest

# Update node modules
clear
echo "Updating node modules..."
echo ""
npm install

# Update python dependencies
clear
echo "Updating python dependencies..."
echo ""
pip install -r requirements.txt

# Build the project
clear
echo "Building the project..."
echo ""
npm run build

# Finish
clear
echo "Update finished."
echo "You can now start the server again using the command: npm run start"
echo ""
exit 0


