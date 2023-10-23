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
echo "███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
echo "████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
echo "██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝     ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
echo "██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
echo "██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
echo "╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
echo ""
echo "Nostrcheck server initialize script v$version"
echo "Last updated: $date"
echo "Project repository: https://github.com/quentintaranpino/nostrcheck-api-ts/"
echo "--------------------------------------------------------------------------------"
echo ""
echo "This script will initialize the nostrcheck server on your system."
echo "WARNING: This script is still in development and may not work as expected."
echo ""

HEX=""
NPUB=""
DEFAULT_DOMAIN=""
DATABASE=""
PASS=`openssl rand -base64 32`
CREATE_DATE=$(date +%F)
APIKEY=`openssl rand -base64 64` 

# We ask user if want to continue
echo "Do you want to proceed with the initialization? [y/n]"
echo ""
read -r input
if [ "$input" != "y" ]; then
    echo "Exiting..."
    exit $E_BADARGS
fi

# Prompt user for server pubkey (hex)
echo "Please enter the server public key (HEX format):"
read -r HEX

# Prompt user for server pubkey (npub)
echo "Please enter the server public key (npub format):"
read -r NPUB

# Prompt user for default domain name (without http:// or https://)
echo "Please enter the default domain name (without http:// or https://):"
read -r DEFAULT_DOMAIN

# Read database name from config/local.json
DATABASE=$(cat config/local.json | jq -r '.database.database')


# Insert on table domains with default domain using username and password from config/local.json
mysql -u $(cat config/local.json | jq -r '.database.user') -p$(cat config/local.json | jq -r '.database.password') $DATABASE -e "INSERT INTO domains (domain, active, comments) VALUES ('$DEFAULT_DOMAIN', '1', 'default');"

echo "Default domain successfully inserted on table domains"

# Insert a new user on table registered using username and password from config/local.json and pubkey from user input
mysql -u $(cat config/local.json | jq -r '.database.user') -p$(cat config/local.json | jq -r '.database.password') $DATABASE -e "INSERT INTO registered (pubkey, hex, username, password, domain, active, date, allowed, apikey, comments) VALUES ('$NPUB', '$HEX', 'public', '$PASS', '$DEFAULT_DOMAIN', '1', '$CREATE_DATE', '1', '$apikey', 'server default account' );"

echo "Default user successfully inserted on table registered"

# Show all variables to user
echo ""
echo "Default server username created successfully, please save the following information:"
echo ""
echo "HEX: $HEX"
echo "NPUB: $NPUB"
echo "USERNAME: public"
echo "PASS: $PASS"
echo "APIKEY : $APIKEY"
echo ""













