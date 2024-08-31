#!/bin/bash

# Detect the script base path
BASEDIR=$(dirname "$0")
echo "$BASEDIR"

readonly E_BADARGS=65
readonly version="0.2.3"
readonly date="20240831"

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
echo "══════════════════════════════════════════════════════════════════════════════"
echo " Nostrcheck Server Installation Script v$version "
echo " Last updated: $date"
echo " Project repository: https://github.com/quentintaranpino/nostrcheck-server/"
echo "══════════════════════════════════════════════════════════════════════════════"
echo ""
echo " This script will install and configure the Nostrcheck server on your system."
echo " WARNING: This script is still in development and may not work as expected."
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"


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
clear
echo "Installing Node.js..."
echo ""
sudo apt-get update || { echo "Failed to update package list"; exit 1; }
sudo apt-get install -y ca-certificates curl gnupg || { echo "Failed to install certificates, curl, and gnupg"; exit 1; }

# If the directory does not exist, create it
if [ ! -d "/etc/apt/keyrings" ]; then
    sudo mkdir -p /etc/apt/keyrings || { echo "Failed to create keyrings directory"; exit 1; }
fi

# If the file exists, remove it
if [ -f "/etc/apt/keyrings/nodesource.gpg" ]; then
    sudo rm /etc/apt/keyrings/nodesource.gpg || { echo "Failed to remove existing nodesource.gpg file"; exit 1; }
fi

curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || { echo "Failed to download NodeSource GPG key"; exit 1; }
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list || { echo "Failed to add NodeSource repository"; exit 1; }

sudo apt-get update || { echo "Failed to update package list after adding NodeSource"; exit 1; }
sudo apt-get install nodejs -y || { echo "Failed to install Node.js"; exit 1; }

# Clear the screen
clear
echo "Installing necessary packages..."
echo ""

sudo apt install -y nginx git redis-server mariadb-server mariadb-client ffmpeg jq certbot python3-certbot-nginx python3 python3-pip || { echo "Failed to install necessary packages"; exit 1; }


# Clear the screen
clear
echo "Cloning the repository..."
echo ""

# Clone the repository
git clone -b 0.6.0 --single-branch https://github.com/quentintaranpino/nostrcheck-server.git || { echo "Failed to clone the repository"; exit 1; }

# Prepare installation directory
cd nostrcheck-server || { echo "Failed to enter the repository directory"; exit 1; }

# Clear the screen
clear
echo "Installing necessary Python packages..."
echo ""

# Install Python packages from requirements.txt
pip install -r requirements.txt || { echo "Failed to install Python packages from requirements.txt"; exit 1; }

# Clear the screen
clear
echo "Installing the latest npm package manager..."
echo ""

# Install the latest npm globally
sudo npm install -g npm@latest || { echo "Failed to install the latest npm package manager"; exit 1; }

# Clear the screen
clear
echo "Installing dependencies..."
echo ""

# Install npm dependencies
npm install --include=optional sharp || { echo "Failed to install npm dependencies"; exit 1; }

# Clear the screen
clear
echo "Building the project..."
echo ""

# Build the project
npm run build || { echo "Failed to build the project"; exit 1; }


# Clear the screen
clear
echo "Starting services..."
echo ""

# Start Redis service
echo "Starting redis-server..."
sudo service redis-server start || { echo "Failed to start redis-server"; exit 1; }
echo "redis-server started successfully."

# Start MariaDB service
echo "Starting mariadb..."
sudo service mariadb start || { echo "Failed to start mariadb"; exit 1; }
echo "mariadb started successfully."


# MYSQL
# Clear the screen
clear
readonly MYSQL=$(which mysql)
if [ -z "$MYSQL" ]; then
    echo "MySQL is not installed or not found in PATH. Exiting..."
    exit 1
fi

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

# Generate a random password for the database user
clear
PASS=$(openssl rand -base64 32)
if [ -z "$PASS" ]; then
    echo "Failed to generate a password. Exiting..."
    exit 1
fi
echo "Generating password for user $USER..."
echo "Password generated successfully."

# Generate a random secret for session cookies
SECRET=$(openssl rand -base64 32)
if [ -z "$SECRET" ]; then
    echo "Failed to generate a secret for session cookies. Exiting..."
    exit 1
fi
echo "Generating secret for session cookies..."
echo "Secret generated successfully."

# Construct the MySQL query
readonly Q1="CREATE DATABASE IF NOT EXISTS $DB;"
readonly Q2="GRANT ALL ON $DB.* TO '$USER'@'localhost' IDENTIFIED BY '$PASS';"
readonly Q3="FLUSH PRIVILEGES;"
readonly SQL="${Q1}${Q2}${Q3}"

# Run the actual command
echo "Creating database and user in MySQL..."
if sudo $MYSQL -uroot -e "$SQL"; then
    echo "Database '$DB' and user '$USER' created successfully."
else
    echo "Failed to create database or user. Please check MySQL root privileges and try again."
    exit 1
fi

# Inform the user that the database was created
echo ""
echo "Database and user '$USER' were created successfully!"
echo "Database Name: $DB"
echo "Database User: $USER"
echo "This information will be stored in config/local.json file."
echo ""

# Set hostname
clear
echo "Server hostname (e.g., nostrcheck.me):"
echo ""
echo "WARNING: This hostname will be used to create the nginx configuration file."
echo "If you want to use SSL, make sure to have a valid domain name and DNS records pointing to this server."
echo ""
echo "Additionally, a subdomain 'cdn' (e.g., cdn.yourdomain.com) will be configured for serving static content and media files."
echo "Ensure that DNS records for both the main domain and the 'cdn' subdomain are properly configured and point to this server."
echo ""

# Prompt the user to input the hostname
read -r inputHOST

# Check if the input is not empty
if [ -n "$inputHOST" ]; then
    HOST=$inputHOST
fi

# If HOST is still empty, prompt again
while [ -z "$HOST" ]; do
    clear
    echo "WARNING: Server hostname is required to continue the installation."
    echo ""
    echo "Server hostname (e.g., nostrcheck.me):"
    echo ""
    echo "WARNING: This hostname will be used to create the nginx configuration file."
    echo "If you want to use SSL, make sure to have a valid domain name and DNS records pointing to this server."
    echo "The hostname is required to continue the installation."
    echo ""
    read -r inputHOST
    if [ -n "$inputHOST" ]; then
        HOST=$inputHOST
    fi
done

# Confirm the hostname to the user
echo ""
echo "Hostname set to: $HOST"
echo "Please ensure this is correct and DNS records are properly configured."
echo ""

# Set media path
clear
echo "Media path [default: $MEDIAPATH]:"
echo ""
echo "WARNING: This path will be used to store media files on the filesystem if local storage is enabled."
echo "If you want to use a different path, make sure to have the necessary permissions and it exists."
echo ""

# Prompt the user to input the media path
read -r inputMEDIAPATH

# If the user provides a new path, update MEDIAPATH
if [ -n "$inputMEDIAPATH" ]; then
    MEDIAPATH=$inputMEDIAPATH
fi

# Confirm the media path to the user
echo ""
echo "Media path set to: $MEDIAPATH"
echo "Please ensure this path has the necessary permissions for media storage."
echo ""

# Prompt user for server pubkey (HEX format)
clear
echo "Server public key (HEX format):"
echo ""
echo "You can use https://nostrcheck.me/converter/ to convert your pubkey to HEX format."
echo "INFO: Leave it empty if you want to generate a new pubkey/secret keypair."
echo ""
read -r PUBKEY

# If PUBKEY is not empty, prompt user for server SECRET key
if [ -n "$PUBKEY" ]; then
    clear
    echo "Server secret key (HEX format):"
    echo ""
    echo "You can use https://nostrcheck.me/converter/ to convert your nsec to HEX format."
    echo ""
    read -r SECRETKEY

    # If SECRETKEY is empty, prompt again
    while [ -z "$SECRETKEY" ]; do
        clear
        echo "WARNING: Server secret key is required if you provide a pubkey."
        echo "If you are not comfortable with this, leave it blank to generate a new public and secret keypair."
        echo ""
        echo "Server secret key (HEX format):"
        echo ""
        echo "You can use https://nostrcheck.me/converter/ to convert your nsec to HEX format."
        echo ""
        read -r SECRETKEY

        # If SECRETKEY is still empty, reset PUBKEY value
        if [ -z "$SECRETKEY" ]; then
            echo "No secret key provided. The pubkey will be disregarded."
            PUBKEY=""
            break
        fi
    done
fi

# Confirm the input or lack of it to the user
if [ -z "$PUBKEY" ]; then
    echo "A new pubkey/secret keypair will be generated."
else
    echo "Pubkey and secret key have been set."
fi

# Update local.json with generated fields
clear
echo ""
echo "Creating user config file..."

# Ensure the directory for config exists
if [ ! -d "config" ]; then
    mkdir -p config || { echo "Failed to create config directory."; exit 1; }
fi

# Create a new JSON object with the specified values
if jq -n --arg a "$HOST" --arg b "$PUBKEY" --arg c "$SECRETKEY" --arg d "$DB" --arg e "$USER" --arg f "$PASS" --arg g "$MEDIAPATH" --arg h "$SECRET" \
'{
    "server": {
        "host": $a,
        "port": 3000,
        "pubkey": $b,
        "secretKey": $c,
        "tosFilePath": "resources/tos.md"
    },
    "database": {
        "host": "127.0.0.1",
        "database": $d,
        "user": $e,
        "password": $f
    },
    "media": {
        "mediaPath": $g
    },
    "session": {
        "secret": $h
    }
}' > config/local.json; then
    echo "Config file 'config/local.json' created successfully."
else
    echo "Failed to create 'config/local.json'. Please check your jq installation and permissions."
    exit 1
fi

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

    # API redirect for nostr.json requests
    location /.well-known/nostr.json {
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Host \$host;
      proxy_pass http://localhost:3000/api/v2/nostraddress;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
    }

    # API redirect for nip96.json requests
    location /.well-known/nostr/nip96.json {
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header Host \$host;
      proxy_pass http://127.0.0.1:3000/api/v2/nip96;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
    }

    # API redirect for lightning redirect requests
    location /.well-known/lnurlp/ {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:3000/api/v2/lightningaddress/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # API redirect for media URL requests
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

# Additional server block for cdn.$HOST
server {
    listen 80;
    server_name cdn.$HOST;

    # Static folder always redirects to the root host folder
    location /static {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:3000/static;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # API redirect for media URL requests
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
EOF

# Confirm that the configuration file was created successfully
if [ -f /etc/nginx/sites-available/$HOST.conf ]; then
    echo "nginx config file for $HOST created successfully."
else
    echo "Failed to create nginx config file for $HOST."
    exit 1
fi

# Enable the site
echo "Enabling nginx site..."
echo ""

# Create a symbolic link to enable the site
if ln -s /etc/nginx/sites-available/$HOST.conf /etc/nginx/sites-enabled/$HOST.conf; then
    echo "Nginx site for $HOST enabled successfully."
else
    echo "Failed to enable nginx site for $HOST. Please check the configuration and try again."
    exit 1
fi

# Restart nginx
echo ""
echo "Restarting nginx..."
echo ""

# Restart the Nginx service
if sudo service nginx restart; then
    echo "Nginx restarted successfully."
else
    echo "Failed to restart Nginx. Please check the service status for more details."
    exit 1
fi

# End of standard installation
clear
echo "Installation complete!"
echo ""

# Ask user if they want to create a systemd service for the server
clear
echo "Do you want to create a systemd service for the server? [y/n]"
echo ""
read -r input

if [ "$input" = "y" ]; then
    echo ""
    echo "Creating systemd service..."
    echo ""

    # Check if required variables are set
    if [ -z "$SUDO_USER" ] || [ -z "$PWD" ]; then
        echo "Error: Required environment variables are not set."
        exit 1
    fi

    # Define the absolute path of the working directory
    ABSOLUTE_PATH=$(realpath "$PWD/nostrcheck-server")

    # Create the systemd service file
    cat > /etc/systemd/system/nostrcheck.service <<EOF
[Unit]
Description=Nostrcheck server
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$ABSOLUTE_PATH
ExecStart=/usr/bin/npm run start
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

    # Check if the service file was created successfully
    if [ -f /etc/systemd/system/nostrcheck.service ]; then
        echo "Systemd service created successfully."

        # Enable and start the service
        clear
        echo ""
        echo "Enabling and starting the service..."
        echo ""
        sudo systemctl enable nostrcheck
        sudo systemctl start nostrcheck

        # Check if the service started successfully
        if sudo systemctl is-active --quiet nostrcheck; then
            echo "Nostrcheck service started successfully."
        else
            echo "Failed to start Nostrcheck service. Please check the service status for more details."
        fi
    else
        echo "Failed to create systemd service file. Please check permissions and try again."
        exit 1
    fi
fi

# Ask user if they want to execute certbot for SSL
clear
echo ""
echo "Do you want to execute certbot for SSL certificate for $HOST? [y/n]"
echo ""
read -r input

if [ "$input" = "y" ]; then
    echo ""
    echo "Executing certbot to obtain SSL certificate for $HOST..."
    echo ""
    
    # Run certbot with nginx plugin for the specified domain
    if sudo certbot --nginx -d "$HOST"; then
        echo "SSL certificate obtained successfully for $HOST."

        # Restart nginx to apply the new SSL certificate
        echo ""
        echo "Restarting nginx..."
        echo ""
        if sudo service nginx restart; then
            echo "Nginx restarted successfully."
        else
            echo "Failed to restart Nginx. Please check the service status."
            exit 1
        fi
    else
        echo "Failed to obtain SSL certificate for $HOST. Please check the Certbot logs for details."
        exit 1
    fi
fi

# Ask user if they want to execute certbot for SSL certificate for cdn.$HOST
echo ""
echo "Do you want to execute certbot for SSL certificate for cdn.$HOST? [y/n]"
echo ""
read -r input_cdn

if [ "$input_cdn" = "y" ]; then
    echo ""
    echo "Executing certbot to obtain SSL certificate for cdn.$HOST..."
    echo ""
    
    # Run certbot with nginx plugin for the cdn subdomain
    if sudo certbot --nginx -d "cdn.$HOST"; then
        echo "SSL certificate obtained successfully for cdn.$HOST."

        # Restart nginx to apply the new SSL certificate
        echo ""
        echo "Restarting nginx..."
        echo ""
        if sudo service nginx restart; then
            echo "Nginx restarted successfully."
        else
            echo "Failed to restart Nginx. Please check the service status."
            exit 1
        fi
    else
        echo "Failed to obtain SSL certificate for cdn.$HOST. Please check the Certbot logs for details."
        exit 1
    fi
fi

clear
# End message
echo "╔═════════════════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                                         ║"
echo "║                                Installation Complete!                                   ║"
echo "║                                                                                         ║"
echo "║  You can now start the Nostrcheck server by running the following command:              ║"
echo "║      cd nostrcheck-server && npm run start                                              ║"
echo "║                                                                                         ║"
echo "║  Server Documentation:                                                                  ║"
echo "║      https://github.com/quentintaranpino/nostrcheck-server/blob/main/DOCS.md            ║"
echo "║                                                                                         ║"
echo "║  If you like this project, please consider supporting its development:                  ║"
echo "║      https://nostrcheck.me/about/support-us.php                                         ║"
echo "║                                                                                         ║"
echo "║  Important Notice:                                                                      ║"
echo "║      The first time you access the server's frontend, it will auto-login with the       ║"
echo "║      admin user (public). A new password will be sent to the associated pubkey via DM.  ║"
echo "║      Please make sure you can log in with the new password before closing this session. ║"
if [ -z "$PUBKEY" ]; then
echo "║                                                                                         ║"   
echo "║      Please run the server once to generate the server's pubkey and secret key. The new  ║"
echo "║      keys will be stored in the config/local.json file.                                  ║"
fi
echo "║                                                                                         ║"
echo "╚═════════════════════════════════════════════════════════════════════════════════════════╝"
