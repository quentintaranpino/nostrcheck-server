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

readonly E_BADARGS=65
readonly version="0.2"
readonly date="20240210"

clear
echo ""
echo "███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗ "
echo "████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝ "
echo "██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝  "
echo "██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗  "
echo "██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗ "
echo "╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝ "
echo ""
echo "███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
echo "██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
echo "███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
echo "╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
echo "███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
echo "╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
echo ""
echo "Nostrcheck server installation script v$version"
echo "Last updated: $date"
echo "Project repository: https://github.com/quentintaranpino/nostrcheck-api-ts/"
echo "----------------------------------------------------------------------------"
echo ""
echo "This script will install and configure the nostrcheck server on your system."
echo "WARNING: This script is still in development and may not work as expected."
echo ""

# Node version
NODE_MAJOR=21

# Variables
HOST=""
DB="nostrcheck"
USER="nostrcheck"
MEDIAPATH="media/"
PUBKEY=""
SECRETKEY=""

# We ask user if want to continue
echo "Do you want to proceed with the installation? [y/n]"
echo ""
read -r input
if [ "$input" != "y" ]; then
    echo "Exiting..."
    exit $E_BADARGS
fi

# Install Node.js
echo ""
echo "Installing Node.js..."
echo ""
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
# if /etc/apt/keyrings does not exist, create it
if [ ! -d "/etc/apt/keyrings" ]; then
    sudo mkdir -p /etc/apt/keyrings
fi
# if /etc/apt/keyrings/nodesource.gpg exist remove it
if [ -f "/etc/apt/keyrings/nodesource.gpg" ]; then
    sudo rm /etc/apt/keyrings/nodesource.gpg
fi
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt-get install nodejs -y

# Install necessary packages
echo ""
echo "Installing necessary packages..."
echo ""
sudo apt install nginx git redis-server mariadb-server mariadb-client ffmpeg jq certbot python3-certbot-nginx -y

# Clone the repository
echo ""
echo "Cloning the repository..."
echo ""
#git clone https://github.com/quentintaranpino/nostrcheck-api-ts.git
git clone -b '0.5.0' https://github.com/quentintaranpino/nostrcheck-api-ts.git

# Prepare installation directory
echo ""
echo "Changing directory permissions..."
sudo chown -R $SUDO_USER:$SUDO_USER nostrcheck-api-ts
cd nostrcheck-api-ts

# Install dependencies
echo ""
echo "Installing dependencies..."
sudo npm install -g npm@latest
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
clear
readonly MYSQL=`which mysql`
echo ""
echo "Database name [default: $DB]:"
echo ""
read -r inputDB
if [ ! -z "$inputDB" ]; then
    DB=$inputDB
fi

clear
echo "Database user [default: $USER]:"
echo ""
read -r inputUSER
if [ ! -z "$inputUSER" ]; then
    USER=$inputUSER
fi

# Generate a random password for database user
clear
PASS=`openssl rand -base64 32`
echo "Generating password for user $USER..."
echo ""

# Generate a random secret for session
SECRET=`openssl rand -base64 32`
echo "Generating secret for session cookies..."
echo ""

# Construct the MySQL query
readonly Q1="CREATE DATABASE IF NOT EXISTS $DB ;"
readonly Q2="GRANT ALL ON $DB.* TO '$USER'@'localhost' IDENTIFIED BY '$PASS';"
readonly Q3="FLUSH PRIVILEGES;"
readonly SQL="${Q1}${Q2}${Q3}"

# Run the actual command
$MYSQL -uroot -e "$SQL"

# Let the user know the database was created
echo ""
echo "Database tables and user created successfully!"
echo ""

# Set hostname
clear
echo ""
echo "Server hostname (without http or https) [default: $HOST]:"
echo ""
echo "WARNING: This hostname will be used to create the nginx configuration file."
echo "If you want to use SSL, make sure to have a valid domain name and DNS records pointing to this server."
echo ""
read -r inputHOST
if [ ! -z "$inputHOST" ]; then
    HOST=$inputHOST
fi

# Set media path
clear
echo ""
echo "Media path [default: $MEDIAPATH]:"
echo ""
echo "WARNING: This path will be used to store media files."
echo "If you want to use a different path, make sure to have the necessary permissions."
echo ""
read -r inputMEDIAPATH
if [ ! -z "$inputMEDIAPATH" ]; then
    MEDIAPATH=$inputMEDIAPATH
fi

# Prompt user for server pubkey (hex)
clear
echo "Please enter the server PUBLIC key (HEX format):"
echo ""
echo "You can use https://nostrcheck.me/converter/ for convert your pubkey to HEX format" 
echo "Leave it empty if you want to generate a new pubkey/secret"
echo ""
read -r PUBKEY

# if PUBKEY is not empty, prompt user for server SECRET key.
if [ ! -z "$PUBKEY" ]; then
    echo "Please enter the server SECRET key (HEX format):"
    echo ""
    echo "You can use https://nostrcheck.me/converter/ for convert your nsec to HEX format" 
    echo ""
    read -r SECRETKEY
fi

# Update local.json with generated fields.
clear
echo ""
echo "Creating user config file..."
cp config/default.json config/local.json

jq --arg a "$HOST" '.server.host = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$PUBKEY" '.server.pubkey = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$SECRETKEY" '.server.secretKey = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$DB" '.database.database = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$USER" '.database.user = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$PASS" '.database.password = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$MEDIAPATH" '.media.mediaPath = $a' config/local.json > tmp.json && mv tmp.json config/local.json
jq --arg a "$SECRET" '.session.secret = $a' config/local.json > tmp.json && mv tmp.json config/local.json


# Create nginx config file
echo ""
echo "Creating nginx config file..."
echo ""

cat > /etc/nginx/sites-available/$HOST.conf <<EOF
server {
    listen 80;
    server_name $HOST;

    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
    }

    #API redirect for nostr.json requests
    location /.well-known/nostr.json {

      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Host \$host;
      proxy_pass http://localhost:3000/api/v2/nostraddress;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";

    }

    #API redirect for nip96.json requests
    location /.well-known/nostr/nip96.json {

      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Host \$host;
      proxy_pass http://127.0.0.1:3000/api/v2/nip96;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";

    }

    #API redirect for media URL requests
    location /media {
       proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto \$scheme;
       proxy_set_header Host \$host;
       proxy_pass http://127.0.0.1:3000/api/v2/media;
       proxy_http_version 1.1;
       proxy_set_header Upgrade \$http_upgrade;
       proxy_set_header Connection "upgrade";
     }
}
EOF

# Enable the site
echo "Enabling nginx site..."
echo ""
ln -s /etc/nginx/sites-available/$HOST.conf /etc/nginx/sites-enabled/$HOST.conf

# Restart nginx
echo ""
echo "Restarting nginx..."
echo ""
sudo service nginx restart

# End of standard installation
clear
echo "Installation complete!"
echo ""

# Ask user if want to execute certbot for SSL
echo ""
echo "Do you want to execute certbot for SSL certificate " $HOST"? [y/n]"
echo ""
read -r input
if [ "$input" = "y" ]; then
    echo ""
    echo "Executing certbot SSL certificate for " $HOST"..."
    echo ""
    sudo certbot --nginx -d $HOST

    # Restart nginx
    echo ""
    echo "Restarting nginx..."
    echo ""
    sudo service nginx restart

fi

clear
# End message
echo "-------------------------------------------------------------------------------------------"
echo "-                                                                                         -"
echo "-  You can now start nostrcheck server by running 'cd nostrcheck-api-ts && npm run start' -"
echo "-                                                                                         -"
echo "-  Server documentation:                                                                  -"
echo "-  https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/documentation.md       -" 
# if PUBKEY was empty show a message
if [ -z "$PUBKEY" ]; then
echo "-                                                                                         -"   
echo "-  Please execute the server once to generate the server pubkey and secret key, the new   -"
echo "-  generated keys will be stored in config/local.json file.                               -"
fi
echo "-                                                                                         -" 
echo "-------------------------------------------------------------------------------------------"