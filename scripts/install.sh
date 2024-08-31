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
echo " Nostrcheck Server Installation Script v$version"
echo "📅 Last updated: $date"
echo "🔗 Project repository: https://github.com/quentintaranpino/nostrcheck-server/"
echo "📝 License: MIT"
echo "══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📢 This script will install and configure the Nostrcheck server on your system."
echo "⚠️  WARNING: This script is still in development and may not work as expected."
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
REPO_URL="https://github.com/quentintaranpino/nostrcheck-server.git"
REPO_BRANCH="0.6.0"
REQUIREMENTS_FILE="requirements.txt"
PACKAGES="nginx git redis-server mariadb-server mariadb-client ffmpeg jq certbot python3-certbot-nginx python3 python3-pip"

# We ask user if want to continue
echo "👉 Do you want to proceed with the installation? [y/n]"
echo ""
read -r input
if [ "$input" != "y" ]; then
    echo "Exiting..."
    exit $E_BADARGS
fi

clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                        🚀 Installing Node.js...                                "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔍 Checking for existing installation and version compatibility..."
echo ""

# Check if Node.js is installed
if command -v node > /dev/null 2>&1; then
    # Get the currently installed major version
    INSTALLED_NODE_MAJOR=$(node -v | grep -oP '^v\K[0-9]+')
    
    # Compare with desired major version
    if [ "$INSTALLED_NODE_MAJOR" -ge "$NODE_MAJOR" ]; then
        echo "✅ Node.js version $INSTALLED_NODE_MAJOR is already installed."
        sleep 2
    else
        echo "⚠️ Installed Node.js version (v$INSTALLED_NODE_MAJOR) is lower than $NODE_MAJOR."
        echo "🔄 Installing Node.js version $NODE_MAJOR..."
        echo ""
        sleep 2
        install_node
    fi
else
    echo "❌ Node.js is not installed."
    echo "🔄 Installing Node.js version $NODE_MAJOR..."
    echo ""
    sleep 2
    install_node
fi

# Install Node.js
install_node() {

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
}

# Update apt package list
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                       🔄 Updating Package List...                             "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔍 Updating package list to ensure you have the latest versions of all packages..."
echo ""

sudo apt-get update || { echo "❌ Failed to update package list"; exit 1; }
echo ""
echo "✅ Package list updated successfully!"
echo ""
sleep 2

# Install necessary packages
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                  📦 Installing Necessary Packages...                         "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Installing the following packages:"
echo "   - $PACKAGES"
echo ""
sleep 3
sudo apt-get install -y $PACKAGES || { echo "❌ Failed to install necessary packages"; exit 1; }

echo "✅ Necessary packages installed successfully!"
echo ""

# Clone the repository
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                     📥 Cloning the Repository...                             "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

# Clone the repository
echo "🔄 Cloning the repository from $REPO_URL (branch: $REPO_BRANCH)..."
echo ""
git clone -b "$REPO_BRANCH" --single-branch "$REPO_URL" || { echo "❌ Failed to clone the repository"; exit 1; }
cd "nostrcheck-server" || { echo "❌ Failed to enter the repository directory"; exit 1; }
echo "✅ Repository cloned and ready for installation!"
sleep 2

# Install Python packages from requirements.txt
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                 🐍 Installing Necessary Python Packages...                   "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📄 Installing packages from $REQUIREMENTS_FILE..."
echo ""
pip install -r "$REQUIREMENTS_FILE" || { echo "❌ Failed to install Python packages from $REQUIREMENTS_FILE"; exit 1; }
echo ""
echo "✅ Python packages installed successfully!"
sleep 2

# Install the latest npm globally
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                  📦 Installing the Latest npm Package Manager...               "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Updating npm to the latest version globally..."
sudo npm install -g npm@latest || { echo "❌ Failed to install the latest npm package manager"; exit 1; }
echo "✅ npm has been updated to the latest version successfully!"
sleep 2

# Install npm dependencies
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                     📦 Installing npm Dependencies...                         "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Installing npm dependencies with optional packages..."
echo ""
npm install --include=optional sharp || { echo "❌ Failed to install npm dependencies"; exit 1; }
echo "✅ npm dependencies installed successfully!"
sleep 2

# Build the project
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                       🛠️  Building the Project...                             "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Running the build process..."
echo ""
npm run build || { echo "❌ Failed to build the project"; exit 1; }
echo "✅ Project built successfully!"
sleep 2

# Start mariadb and redis-server
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                   🚀 Starting MariaDB and Redis Server...                      "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

# Start Redis Server
echo "🔄 Starting Redis Server..."
echo ""
sudo service redis-server start || { echo "❌ Failed to start Redis Server"; exit 1; }
echo "✅ Redis Server started successfully!"

# Start MariaDB
echo "🔄 Starting MariaDB..."
echo ""
sudo service mariadb start || { echo "❌ Failed to start MariaDB"; exit 1; }
echo "✅ MariaDB started successfully!"

sleep 2

# MYSQL
readonly MYSQL=$(which mysql)
if [ -z "$MYSQL" ]; then
    echo "MySQL is not installed or not found in PATH. Exiting..."
    exit 1
fi

# Prompt for database name
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                        🗄️  Database Configuration: Name                         "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Please enter the name of the database that the server will create and use."
echo "This database will store all necessary data for your server's operation,"
echo "including user data, configuration settings, and other essential information."
echo ""
echo "💡 The script will automatically create this database if it does not exist."
echo "   If you are not sure, you can use the default database name by pressing Enter."
echo ""
echo "👉 Enter the database name and press [Enter]:"
echo ""
read -p "🗄️  Database Name [default: $DB]: " inputDB
if [ ! -z "$inputDB" ]; then
    DB=$inputDB
fi

# Prompt for database user
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                        👤 Database Configuration: User                          "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Please enter the username that the server will use to connect to the database."
echo "This user should have sufficient privileges to create, read, update, and delete"
echo "data in the database."
echo ""
echo "💡 The script will automatically create this user with the necessary permissions"
echo "   if they do not already exist. Ensure that this user has access to the database."
echo ""
echo "👉 Enter the database user and press [Enter]:"
echo ""
read -p "👤 Database User [default: $USER]: " inputUSER
if [ ! -z "$inputUSER" ]; then
    USER=$inputUSER
fi

# Generate a random password for the database user
PASS=$(openssl rand -base64 32)
if [ -z "$PASS" ]; then
    echo "Failed to generate a password for the database user. Exiting..."
    exit 1
fi

# Generate a random secret for session cookies
SECRET=$(openssl rand -base64 32)
if [ -z "$SECRET" ]; then
    echo "Failed to generate a secret for session cookies. Exiting..."
    exit 1
fi

# Construct the MySQL query
readonly Q1="CREATE DATABASE IF NOT EXISTS $DB;"
readonly Q2="GRANT ALL ON $DB.* TO '$USER'@'localhost' IDENTIFIED BY '$PASS';"
readonly Q3="FLUSH PRIVILEGES;"
readonly SQL="${Q1}${Q2}${Q3}"

# Run the actual command
if sudo $MYSQL -uroot -e "$SQL"; then
    echo "Database '$DB' and user '$USER' created successfully."
else
    echo "Failed to create database or user. Please check MySQL root privileges and try again."
    exit 1
fi

# Prompt user to enter the server hostname
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                      🚀 Server Hostname Configuration 🚀                      "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Please enter your server hostname (e.g., nostrcheck.me):"
echo ""
echo "⚠️  IMPORTANT: This hostname will be used to generate the Nginx configuration."
echo "               If you plan to use SSL, ensure you have a valid domain name"
echo "               and that DNS records correctly point to this server."
echo ""
echo "🔧 Additionally, a 'cdn' subdomain (e.g., cdn.yourdomain.com) will be set up"
echo "   to serve blobs using the Blossom protocol."
echo ""
echo "💡 Ensure that DNS records for both the main domain and the 'cdn' subdomain"
echo "   are properly configured and point to this server."
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
read -p "🌐 Enter the hostname: " inputHOST

# Check if the input is not empty
if [ -n "$inputHOST" ]; then
    HOST=$inputHOST
fi

# If HOST is still empty, prompt again
while [ -z "$HOST" ]; do
    clear
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "⚠️  WARNING: Server hostname is required to continue the installation."
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Please enter your server hostname (e.g., nostrcheck.me):"
    echo ""
    echo "⚠️  IMPORTANT: This hostname will be used to generate the Nginx configuration."
    echo "               If you plan to use SSL, ensure you have a valid domain name"
    echo "               and that DNS records correctly point to this server."
    echo ""
    echo "🔧 Additionally, a 'cdn' subdomain (e.g., cdn.yourdomain.com) will be set up"
    echo "   to serve blobs using the Blossom protocol."
    echo ""
    echo "💡 Ensure that DNS records for both the main domain and the 'cdn' subdomain"
    echo "   are properly configured and point to this server."
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    read -p "🌐 Enter the hostname: " inputHOST 

    # Check if the input is not empty
    if [ -n "$inputHOST" ]; then
        HOST=$inputHOST
    fi

done

# Set media path
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                          📁 Set Media Path                                    "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🗂️  Media path [default: $MEDIAPATH]:"
echo ""
echo "⚠️  WARNING: The server is initially configured to store media files locally."
echo "   If you prefer to use a different path on this system, please specify it here."
echo ""
echo "💡 After the installation is complete, you can configure the server to use"
echo "   a remote S3-compatible storage solution through the 'Settings' section."
echo "   This allows you to easily switch from local storage to cloud storage."
echo ""
echo "   If you want to proceed with the default local storage, simply press Enter."
echo ""
read -r inputMEDIAPATH

# Use the provided input if not empty
if [ -n "$inputMEDIAPATH" ]; then
    MEDIAPATH=$inputMEDIAPATH
fi

# Prompt user for server pubkey (HEX format)
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                   🔑 Server Public Key (HEX format)                           "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Please enter your server public key (HEX format):"
echo ""
echo "💡 You can use the following tool to convert your pubkey to HEX format:"
echo "   🌐 https://nostrcheck.me/converter/"
echo ""
echo "ℹ️ INFO: Leave this field empty if you want to generate a new pubkey/secret keypair."
echo ""
echo "👉 Enter the public key and press [Enter]:"
echo ""
read -p "🔑 Public Key: " -r PUBKEY

# If PUBKEY is not empty, prompt user for server SECRET key
if [ -n "$PUBKEY" ]; then
    clear
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "                   🔑 Server Secret Key (HEX format)                           "
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Please enter your server secret key (HEX format):"
    echo ""
    echo "💡 You can use the following tool to convert your nsec to HEX format:"
    echo "   🌐 https://nostrcheck.me/converter/"
    echo ""
    read -r SECRETKEY

    # If SECRETKEY is empty, prompt again
    while [ -z "$SECRETKEY" ]; do
        clear
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo "                   ⚠️ WARNING: Server Secret Key Required                       "
        echo "═══════════════════════════════════════════════════════════════════════════════"
        echo ""
        echo "The server secret key is required if you provide a pubkey."
        echo "If you are not comfortable with this, leave it blank to generate a new public"
        echo "and secret keypair."
        echo ""
        echo "Please enter your server secret key (HEX format):"
        echo ""
        echo "💡 You can use the following tool to convert your nsec to HEX format:"
        echo "   🌐 https://nostrcheck.me/converter/"
        echo ""
        echo "👉 Enter the secret key and press [Enter]:"
        echo ""
        read -p "🔑 Secret Key: " -r SECRETKEY

        # If SECRETKEY is still empty, reset PUBKEY value
        if [ -z "$SECRETKEY" ]; then
            echo ""
            echo "❌ No secret key provided. The pubkey will be disregarded."
            PUBKEY=""
            break
        fi
    done
fi

# Update local.json with generated fields
if [ ! -d "config" ]; then
    mkdir -p config || { echo "Failed to create config directory."; exit 1; }
fi

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
sudo tee /etc/nginx/sites-available/$HOST.conf > /dev/null <<EOF
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

if [ -f /etc/nginx/sites-available/$HOST.conf ]; then
    echo "nginx config file for $HOST created successfully."
else
    echo "Failed to create nginx config file for $HOST."
    exit 1
fi


# Restart nginx
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                          🔄 Configuring Nginx...                                "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
# Enable the nginx site
echo "⚙️ Enabling nginx site for $HOST..."

# Create a symbolic link to enable the site
if sudo ln -s /etc/nginx/sites-available/$HOST.conf /etc/nginx/sites-enabled/$HOST.conf; then
    echo "✅ Nginx site for $HOST enabled successfully."
else
    echo "Failed to enable nginx site for $HOST. Please check the configuration and try again."
    exit 1
fi

# Restart the Nginx service
if sudo service nginx restart; then
    echo "✅ Nginx configured successfully!"
    sleep 2
else
    echo "❌ Failed to configure Nginx. Please check the service status for more details."
    exit 1
fi

# Ask user if they want to create a systemd service for the server
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "       ⚙️  Do you want to create a systemd service? ⚙️    "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "This will allow the server to start automatically with your system."
echo "It also makes it easier to manage the server as a background service."
echo ""
echo "Please enter your choice: [y/n]"
echo ""
read -r input

# Initialize service variables
SYSTEMD_SERVICE_CREATED="no"
SUDO_USER=$(whoami)
ABSOLUTE_PATH=$(realpath "$PWD")

if [ "$input" = "y" ]; then

    SYSTEMD_SERVICE_CREATED="yes"

    # Check if required variables are set
    if [ -z "$SUDO_USER" ] || [ -z "$PWD" ]; then
        echo "Error: Required environment variables are not set."
        exit 1
    fi

    ABSOLUTE_PATH=$(realpath "$PWD/nostrcheck-server")

    sudo bash -c "cat > /etc/systemd/system/nostrcheck.service <<EOF
[Unit]
Description=Nostrcheck server
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$ABSOLUTE_PATH
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartPreventExitStatus=3
SuccessExitStatus=3
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF"

 if [ -f /etc/systemd/system/nostrcheck.service ]; then
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "                   ⚙️  Enabling and Starting Nostrcheck Service...              "
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""

    sudo systemctl enable nostrcheck || { echo "❌ Failed to enable Nostrcheck service"; exit 1; }
    sudo systemctl start nostrcheck || { echo "❌ Failed to start Nostrcheck service"; exit 1; }

    # Check if the service started successfully
    if sudo systemctl is-active --quiet nostrcheck; then
        echo "✅ Nostrcheck service started successfully!"
        sleep 2
    else
        echo "❌ Failed to start Nostrcheck service. Please check the service status for more details."
        exit 1
    fi
    else
        echo "❌ Failed to create systemd service file. Please check permissions and try again."
        exit 1
    fi
fi

# Ask user if they want to execute certbot for SSL
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "               🔒 Do you want to secure your server with SSL? 🔒             "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Certbot can automatically obtain and install a free SSL certificate for your server."
echo "This will enable HTTPS, ensuring secure communication between your server and clients."
echo ""
echo "🌐 Domain to be secured: $HOST"
echo ""
echo "⚠️  IMPORTANT: Make sure your domain's DNS records are correctly configured"
echo "   to point to this server before proceeding."
echo ""
echo "Would you like to proceed with Certbot to obtain an SSL certificate? [y/n]"
echo ""
read -r input

if [ "$input" = "y" ]; then
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "          🔐 Executing Certbot to Obtain SSL Certificate for $HOST              "
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Run certbot with nginx plugin for the specified domain
    if sudo certbot --nginx -d "$HOST"; then
        echo "✅ SSL certificate obtained successfully for $HOST."

        # Restart nginx to apply the new SSL certificate
        echo ""
        echo "🔄 Restarting Nginx to apply the new SSL certificate..."
        echo ""
        if sudo service nginx restart; then
            echo "✅ Certbot configured successfully!"
            sleep 2
        else
            echo "❌ Failed to restart Nginx. Please check the service status."
            exit 1
        fi
    else
        echo "❌ Failed to obtain SSL certificate for $HOST. Please check the Certbot logs for details."
        exit 1
    fi
fi

# Ask user if they want to execute certbot for SSL certificate for cdn.$HOST
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "          🔒 Do you want to secure your CDN subdomain with SSL? 🔒        "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Certbot can automatically obtain and install a free SSL certificate for your CDN subdomain."
echo "This will enable HTTPS, ensuring secure communication for content delivery from cdn.$HOST."
echo ""
echo "🌐 Subdomain to be secured: cdn.$HOST"
echo ""
echo "⚠️  IMPORTANT: Make sure the DNS records for 'cdn.$HOST' are correctly configured"
echo "   to point to this server before proceeding."
echo ""
echo "Would you like to proceed with Certbot to obtain an SSL certificate for your CDN? [y/n]"
echo ""
read -r input_cdn

if [ "$input_cdn" = "y" ]; then
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "     🔐 Executing Certbot to Obtain SSL Certificate for cdn.$HOST              "
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Run certbot with nginx plugin for the cdn subdomain
    if sudo certbot --nginx -d "cdn.$HOST"; then
        echo "✅ SSL certificate obtained successfully for cdn.$HOST."

        # Restart nginx to apply the new SSL certificate
        echo ""
        echo "🔄 Restarting Nginx to apply the new SSL certificate..."
        echo ""
        if sudo service nginx restart; then
            echo "✅ Certbot configured successfully!"
            sleep 2
        else
            echo "❌ Failed to restart Nginx. Please check the service status."
            exit 1
        fi
    else
        echo "❌ Failed to obtain SSL certificate for cdn.$HOST. Please check the Certbot logs for details."
        exit 1
    fi
fi

# End message
clear
echo "╔═════════════════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                                         ║"
echo "║  🎉 Installation Complete! 🎉                                                           ║"
echo "║                                                                                         ║"

if [ "$SYSTEMD_SERVICE_CREATED" = "yes" ]; then
    echo "║  🚀 The Nostrcheck server has been configured to run as a systemd service.              ║"
    echo "║                                                                                         ║"
    echo "║     👉 To start the server:   sudo systemctl start nostrcheck                           ║"
    echo "║     👉 To stop the server:    sudo systemctl stop nostrcheck                            ║"
    echo "║     👉 To check status:       sudo systemctl status nostrcheck                          ║"
    echo "║     👉 To enable on boot:     sudo systemctl enable nostrcheck                          ║"
    echo "║     👉 To disable on boot:    sudo systemctl disable nostrcheck                         ║"
else
    echo "║  🚀 You can now start the Nostrcheck server by running the following command:           ║"
    echo "║     👉 cd nostrcheck-server && npm run start                                            ║"
fi

echo "║                                                                                         ║"
echo "║  📄 Server Documentation:                                                               ║"
echo "║     📝 https://github.com/quentintaranpino/nostrcheck-server/blob/main/DOCS.md          ║"
echo "║                                                                                         ║"
echo "║  💖 If you like this project, please consider supporting its development:               ║"
echo "║     🔗 https://nostrcheck.me/about/support-us.php                                       ║"
echo "║                                                                                         ║"
echo "║  ⚠️  Important Notice:                                                                  ║"
echo "║     The first time you access the server's frontend, it will auto-login with the        ║"
echo "║     admin user (public). A new password will be sent to the associated pubkey via DM.   ║"
echo "║     Please make sure you can log in with the new password before closing this session.  ║"
if [ -z "$PUBKEY" ]; then
echo "║                                                                                         ║"   
echo "║  🔑 Please run the server once to generate the server's pubkey and secret key. The new  ║"
echo "║     keys will be stored in the config/local.json file.                                  ║"
fi
echo "║                                                                                         ║"
echo "╚═════════════════════════════════════════════════════════════════════════════════════════╝"
