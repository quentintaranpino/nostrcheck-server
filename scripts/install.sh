#!/bin/bash

# Detect the script base path
BASEDIR=$(dirname "$0")
echo "$BASEDIR"

readonly E_BADARGS=65
readonly version="0.1"
readonly date="20231015"

# Node version
NODE_MAJOR=18

# Database variables
DB="nostrcheck"
USER="nostrcheck"

clear
echo ""
echo "███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
echo "████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
echo "██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝     ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
echo "██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
echo "██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
echo "╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
echo ""
echo "Nostrcheck server installation script v$version"
echo "Last updated: $date"
echo "-----------------------------------------"
echo ""
echo "This script will install and configure the nostrcheck server on your system."
echo "WARNING: This script is still in development and may not work as expected."
echo ""

# We ask user if want to continue
echo "Do you want to proceed with the installation? [y/n]"
echo ""
read -r input
if [ "$input" != "y" ]; then
    echo "Exiting..."
    exit $E_BADARGS
fi

# Check if the user is root
if [ "$(id -u)" != "0" ]; then
    echo ""
    echo "This script must be run as root. Try using sudo"
    echo ""
    exit $E_BADARGS
fi

# Install Node.js
echo ""
echo "Installing Node.js..."
echo ""
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt-get install nodejs -y

# Install necessary packages
echo ""
echo "Installing necessary packages..."
sudo apt install git redis-server mariadb-server mariadb-client ffmpeg jq -y

# Clone the repository
echo ""
echo "Cloning the repository..."
git clone https://github.com/quentintaranpino/nostrcheck-api-ts.git

# Prepare installation directory
echo ""
echo "Changing directory permissions..."
sudo chown -R $SUDO_USER:$SUDO_USER nostrcheck-api-ts
cd nostrcheck-api-ts

# Install dependencies
echo ""
echo "Installing dependencies..."
sudo npm install -g npm@10.2.0
npm install

# Build the project
echo ""
echo "Building..."
npm run build

# Starting services
echo ""
echo "Starting services..."
sudo service start redis-server
sudo service start mariadb

#MYSQL
readonly MYSQL=`which mysql`

echo "Database name [default: $DB]:"
echo ""
read -r inputDB
if [ ! -z "$inputDB" ]; then
    DB=$inputDB
fi

echo "Database user [default: $USER]:"
echo ""
read -r inputUSER
if [ ! -z "$inputUSER" ]; then
    USER=$inputUSER
fi

PASS=`openssl rand -base64 32`
echo ""
echo "Generating password for user $USER..."
echo ""

# Construct the MySQL query
readonly Q1="CREATE DATABASE IF NOT EXISTS $DB ;"
readonly Q2="GRANT ALL ON *.* TO '$USER'@'localhost' IDENTIFIED BY '$PASS';"
readonly Q3="FLUSH PRIVILEGES;"
readonly SQL="${Q1}${Q2}${Q3}"

# Run the actual command
$MYSQL -uroot -e "$SQL"

# Let the user know the database was created
echo ""
echo "Database, tables and user created successfully!"
echo ""

# Update local.json with generated password
echo ""
echo "Creating user config file..."
cp config/default.json config/local.json

jq --arg a "$DB" '.database.database = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$USER" '.database.user = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$PASS" '.database.password = $a' config/local.json > tmp.json && mv tmp.json config/local.json

# End of script
echo ""
echo "Installation complete!"
echo ""
echo "You can now start the server by running ' cd nostrcheck-api-ts && npm run start'"