#!/bin/bash

# Detect the script base path
BASEDIR=$(dirname "$0")
echo "$BASEDIR"

readonly E_BADARGS=65
readonly version="0.2.7"
readonly date="20250831"

# Variables
NODE_MAJOR=20
HOST=""
DB="nostrcheck"
USER="nostrcheck"
MEDIAPATH="files/"
PUBKEY=""
SECRETKEY=""
REPO_URL="https://github.com/quentintaranpino/nostrcheck-server.git"
REPO_BRANCH="main"
PACKAGES="nginx git redis-server mariadb-server mariadb-client ffmpeg jq certbot python3-certbot-nginx python3 python3-pip python3-dev python3-venv pkg-config libjpeg-dev zlib1g-dev libssl-dev build-essential libbz2-dev libreadline-dev libsqlite3-dev libffi-dev liblzma-dev tk-dev uuid-dev libncurses5-dev libncursesw5-dev curl"

# Python environment variables
VENV_DIR=".venv"
PYENV_PY_VERSION="3.12.4"
TRANSFORMERS_VERSION="4.44.2"
FLASK_VERSION="3.0.3"
PILLOW_VERSION="10.4.0"
TORCH_VERSION="2.4.1"

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
echo " Nostrcheck-server installation script v$version"
echo ""
echo " Last updated: $date"
echo " Project repository: https://github.com/quentintaranpino/nostrcheck-server/"
echo " License: MIT"
echo ""
echo " This script will install and configure the Nostrcheck server on your system."
echo " WARNING: This software is still in development and may not work as expected."
echo ""
echo "══════════════════════════════════════════════════════════════════════════════"

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
echo "                        🚀 Installing node.js...                               "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔍 Checking for existing installation and version compatibility..."
echo ""

install_node() {
    echo "🔄 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_$NODE_MAJOR.x | sudo -E bash -
    sudo apt-get install -y nodejs
}

if command -v node > /dev/null 2>&1; then
    INSTALLED_NODE_MAJOR=$(node -v | grep -oP '^v\K[0-9]+')
    echo "🔎 Node.js version $INSTALLED_NODE_MAJOR detected in PATH."
elif [ -f "/usr/local/bin/node" ]; then
    INSTALLED_NODE_MAJOR=$(/usr/local/bin/node -v | grep -oP '^v\K[0-9]+')
    echo "🔎 Node.js version $INSTALLED_NODE_MAJOR detected in /usr/local/bin."
else
    echo "❌ Node.js not found."
    echo "🔄 Installing Node.js version $NODE_MAJOR..."
    install_node
fi

if [ "$INSTALLED_NODE_MAJOR" -ge "$NODE_MAJOR" ]; then
    echo "✅ Node.js version $INSTALLED_NODE_MAJOR is already installed."
    sleep 3
else
    echo "⚠️ Installed Node.js version (v$INSTALLED_NODE_MAJOR) is lower than $NODE_MAJOR."
    echo "🔄 Installing Node.js version $NODE_MAJOR..."
    sleep 3
    install_node
fi

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
sleep 3

# Install necessary packages
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                  📦 Installing Necessary Packages...                         "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Installing the following packages:"
echo ""
echo "    $PACKAGES"
echo ""
sleep 3
sudo apt-get install -y $PACKAGES || { echo "❌ Failed to install necessary packages"; exit 1; }

echo "✅ Necessary packages installed successfully!"
echo ""
sleep 3

# Install Rust and configure environment
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                       🦀 Installing Rust compiler...                         "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
sleep 3


# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y || { echo "❌ Failed to install Rust"; exit 1; }

# Load Rust environment
source $HOME/.cargo/env

# Add Rust to PATH for future sessions
if ! grep -q 'export PATH="$HOME/.cargo/bin:$PATH"' ~/.bashrc; then
  echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
fi

# Reload ~/.bashrc to make changes effective
source ~/.bashrc

# Optional: Verify Rust installation
rustc --version && cargo --version || { echo "❌ Rust installation verification failed"; exit 1; }

echo "✅ Rust installed successfully!"
echo ""
sleep 3

# Clone the repository
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                        📥 Cloning the Repository...                           "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

# Clone the repository
echo "🔄 Cloning the repository from $REPO_URL (branch: $REPO_BRANCH)..."
echo ""
git clone -b "$REPO_BRANCH" --single-branch "$REPO_URL" || { echo "❌ Failed to clone the repository"; exit 1; }
cd "nostrcheck-server" || { echo "❌ Failed to enter the repository directory"; exit 1; }
echo "✅ Repository cloned and ready for installation!"
sleep 3

# Install Python packages
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "        🐍 Creating Python virtual environment and installing packages       "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

if ! command -v pyenv >/dev/null 2>&1; then
  echo "⬇️ Installing pyenv..."
  curl https://pyenv.run | bash
  export PATH="$HOME/.pyenv/bin:$PATH"
  eval "$(pyenv init -)"
  eval "$(pyenv virtualenv-init -)"
  if ! grep -q 'pyenv init' "$HOME/.bashrc" 2>/dev/null; then
    {
      echo 'export PATH="$HOME/.pyenv/bin:$PATH"'
      echo 'eval "$(pyenv init -)"'
      echo 'eval "$(pyenv virtualenv-init -)"'
    } >> "$HOME/.bashrc"
  fi
else
  export PATH="$HOME/.pyenv/bin:$PATH"
  eval "$(pyenv init -)"
  eval "$(pyenv virtualenv-init -)"
fi

if [ ! -x "$HOME/.pyenv/versions/${PYENV_PY_VERSION}/bin/python" ]; then
    echo "🔄 Installing Python $PYENV_PY_VERSION using pyenv..."
    pyenv install -s "${PYENV_PY_VERSION}" || { echo "❌ pyenv install falló"; exit 1; }
fi

PY_CMD="$HOME/.pyenv/versions/${PYENV_PY_VERSION}/bin/python"

if [ ! -d "$VENV_DIR" ]; then
    echo "🔄 Creating virtual environment in $VENV_DIR..."
    $PY_CMD -m venv "$VENV_DIR" || { echo "❌ Failed to create virtual environment"; exit 1; }
else
    echo "🔄 Virtual environment already exists in $VENV_DIR."
fi

echo "🔄 Activating virtual environment..."
source "$VENV_DIR/bin/activate" || { echo "❌ Failed to activate virtual environment"; exit 1; }

install_packages() {
    pip install -U pip setuptools wheel

    echo "🔄 Installing transformers==$TRANSFORMERS_VERSION..."
    pip install "transformers==$TRANSFORMERS_VERSION" || { echo "❌ Failed to install transformers"; exit 1; }
    
    echo "🔄 Installing Flask==$FLASK_VERSION..."
    pip install "Flask==$FLASK_VERSION" || { echo "❌ Failed to install Flask"; exit 1; }

    echo "🔄 Installing Pillow==$PILLOW_VERSION..."
    pip install "Pillow==$PILLOW_VERSION" || { echo "❌ Failed to install Pillow"; exit 1; }

    echo "🔄 Installing torch==$TORCH_VERSION..."
    pip install "torch==$TORCH_VERSION" || { echo "❌ Failed to install torch"; exit 1; }
}

install_packages

echo ""
echo "✅ Python packages installed successfully!"
sleep 3

# Install the latest npm globally
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                  📦 Installing the Latest npm Package Manager...               "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Updating npm to the latest version globally..."
echo ""
sudo npm install -g npm@latest || { echo "❌ Failed to install the latest npm package manager"; exit 1; }
echo ""
echo "✅ npm has been updated to the latest version successfully!"
sleep 3

# Install npm dependencies
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                     📦 Installing npm Dependencies...                         "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Installing npm dependencies with optional packages..."
echo ""
npm install --include=optional sharp || { echo "❌ Failed to install npm dependencies"; exit 1; }
echo ""
echo "✅ npm dependencies installed successfully!"
sleep 3

# Build the project
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                       🛠️  Building the Project...                             "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Running the build process..."
echo ""
npm run build || { echo "❌ Failed to build the project"; exit 1; }
echo ""
echo "✅ Project built successfully!"
sleep 3

# Start mariadb and redis-server
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                   🚀 Starting MariaDB and Redis Server...                      "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

# Start Redis Server
echo "🔄 Starting Redis Server..."
sudo service redis-server start || { echo "❌ Failed to start Redis Server"; exit 1; }
echo "✅ Redis Server started successfully!"
echo ""
sleep 3

# Start MariaDB
echo "🔄 Starting MariaDB..."
sudo service mariadb start || { echo "❌ Failed to start MariaDB"; exit 1; }
echo "✅ MariaDB started successfully!"
sleep 3

# MYSQL
readonly MYSQL=$(which mysql)
if [ -z "$MYSQL" ]; then
    echo "❌ MySQL is not installed or not found in PATH. Exiting..."
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
read -p "🗄️ Database Name [default: $DB]: " inputDB
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
    clear
    echo ""
    echo "✅ Database '$DB' and user '$USER' created successfully."
    sleep 3
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
echo "⚠️ IMPORTANT: This hostname will be used to generate the Nginx configuration."
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
    echo "⚠️ IMPORTANT: This hostname will be used to generate the Nginx configuration."
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
echo "                          📁 Set hosting Path                                    "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Please specify the path where the server will store hosting files."
echo ""
echo "⚠️ WARNING: The server is initially configured to store hosting files locally."
echo "   You can set now the path where files will be stored on the server."
echo ""
echo "💡 After the installation is complete, you can configure the server to use"
echo "   a remote S3-compatible storage solution through the 'Settings' section."
echo "   This allows you to easily switch from local storage to cloud storage."
echo ""
echo "❓ If you don't now what to do, just press Enter to use the default local path."
echo ""
read -p "🗂️ Files path [default: $MEDIAPATH]:" -r inputMEDIAPATH

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
echo "🌐 https://nostrcheck.me/converter/"
echo ""
echo "ℹ️ Leave this field empty if you want to generate a new pubkey/secret keypair."
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
    echo "🌐 https://nostrcheck.me/converter/"
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
        echo "🌐 https://nostrcheck.me/converter/"
        echo ""
        echo "👉 Enter the secret key and press [Enter]"
        echo "❓ Leave this field empty to generate a new pubkey/secret keypair."
        echo ""
        read -p "🔑 Secret Key: " -r SECRETKEY

        # If SECRETKEY is still empty, reset PUBKEY value
        if [ -z "$SECRETKEY" ]; then
            echo ""
            echo "❌ No secret key provided. The pubkey will be disregarded."
            echo "✅ The server will generate a new pubkey/secret keypair."
            PUBKEY=""
            sleep 3
            break
        fi
    done
fi

# Update local.json with generated fields
clear
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                       📝 Creating config files                                "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

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
    echo "✅ Config file 'config/local.json' created successfully."
    sleep 3
else
    echo "❌ Failed to create 'config/local.json'. Please check if jq package is installed, "
    echo "   the config directory exists, permissions are set correctly, and try again."
    sleep 3
    exit 1
fi

# Configure Nginx
clear
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                           🔄 Configuring Nginx...                            "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

sudo tee /etc/nginx/sites-available/$HOST.conf > /dev/null <<EOF
server {
    listen 80;
    server_name $HOST;

    # Default max upload size. If you increase this on settings must be less or equal to this value
    client_max_body_size 100M;

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

}

# Additional server block for cdn.$HOST
server {
    listen 80;
    server_name cdn.$HOST;

    # Default max upload size. If you increase this on settings must be less or equal to this value
    client_max_body_size 100M;

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

# Additional server block for relay.$HOST
server {
    listen 80;
    server_name relay.$HOST;

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

if [ -f /etc/nginx/sites-available/$HOST.conf ]; then
    echo "✅ nginx config file for $HOST created successfully."
    sleep 3
else
    echo "❌ Failed to create nginx config file for $HOST."
    echo " Please check the nginx configuration and try again."
    sleep 3
    exit 1
fi

# Enable the nginx site
echo "⚙️ Enabling nginx site for $HOST..."

# Create a symbolic link to enable the site
if sudo ln -sf /etc/nginx/sites-available/$HOST.conf /etc/nginx/sites-enabled/$HOST.conf; then
    echo "✅ Nginx site for $HOST enabled successfully."
    sleep 3
else
    echo "Failed to enable nginx site for $HOST. Please check the configuration and try again."
    sleep 3
    exit 1
fi

# Restart the Nginx service
if sudo service nginx restart; then
    echo "✅ Nginx configured successfully!"
    sleep 3
else
    echo "❌ Failed to configure Nginx. Please check the service status for more details."
    exit 1
fi

# Ask user if they want to create a systemd service for the server
clear
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "       ⚙️  Do you want to create a systemd service? ⚙️    "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo " This will allow the server to start automatically with your system."
echo " It also makes it easier to manage the server as a background service."
echo ""
echo " Please enter your choice: [y/n]"
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

    ABSOLUTE_PATH=$(realpath "$PWD")

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
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF"

if [ -f /etc/systemd/system/nostrcheck.service ]; then
    clear
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "               ⚙️  Enabling and Starting Nostrcheck Service...              "
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""

    sudo systemctl enable nostrcheck || { echo "❌ Failed to enable Nostrcheck service"; exit 1; }
    sudo systemctl start nostrcheck || { echo "❌ Failed to start Nostrcheck service"; exit 1; }

    # Check if the service started successfully
    if sudo systemctl is-active --quiet nostrcheck; then
        echo "✅ Nostrcheck service started successfully!"
        sleep 3
    else
        echo "❌ Failed to start Nostrcheck service. Please check the service status for more details."
        SYSTEMD_SERVICE_CREATED="no"
        sleep 5
    fi
    else
        echo "❌ Failed to create systemd service file. The service will not be enabled."
        SYSTEMD_SERVICE_CREATED="no"
        sleep 5
    fi
fi

# --- Certbot SSL (fault-tolerant per domain) ---
clear
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "        🔒 Do you want to secure your server with SSL (Let's Encrypt)?        "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "A certificate will be requested for (if resolvable):"
echo " - $HOST"
echo " - cdn.$HOST"
echo " - relay.$HOST"
echo ""
echo "Make sure DNS A/AAAA records point to this server."
echo ""
read -r -p "Proceed with Certbot now? [y/n]: " input_ssl

if [ "$input_ssl" = "y" ]; then
  # Build candidate list
  CANDIDATES=("$HOST" "cdn.$HOST" "relay.$HOST")

  # Filter by DNS resolution (best-effort)
  RESOLVING=()
  for d in "${CANDIDATES[@]}"; do
    if getent hosts "$d" >/dev/null; then
      RESOLVING+=("$d")
    else
      echo "⚠️  Warning: $d does not resolve from this machine; skipping in first pass."
    fi
  done

  if [ "${#RESOLVING[@]}" -eq 0 ]; then
    echo "⚠️  No resolvable domains detected. Skipping SSL setup."
  else
    # Try one-shot multidomain first
    CB_ARGS=()
    for d in "${RESOLVING[@]}"; do CB_ARGS+=("-d" "$d"); done

    CERT_ANY_OK=0
    echo "🔑 Attempting multi-domain certificate for: ${RESOLVING[*]}"
    if sudo certbot --nginx --redirect "${CB_ARGS[@]}"; then
      CERT_ANY_OK=1
      echo "✅ Multi-domain certificate obtained."
    else
      echo "⚠️  Multi-domain attempt failed. Falling back to per-domain attempts..."
      # Fallback: try each domain independently; do not abort on failures
      for d in "${RESOLVING[@]}"; do
        echo "🔑 Trying single-domain certificate for: $d"
        if sudo certbot --nginx --redirect -d "$d"; then
          CERT_ANY_OK=1
          echo "✅ Certificate obtained for $d."
        else
          echo "⚠️  Failed to obtain certificate for $d. Continuing..."
        fi
      done
    fi

    # If at least one certificate succeeded, test & restart nginx
    if [ "$CERT_ANY_OK" -eq 1 ]; then
      echo "🔄 Validating Nginx configuration..."
      if sudo nginx -t; then
        if sudo systemctl restart nginx; then
          echo "✅ Nginx restarted with SSL."
        else
          echo "⚠️  Nginx restart failed. Please check service status. Continuing installer..."
        fi
      else
        echo "⚠️  nginx -t failed after Certbot changes. Review configs. Continuing installer..."
      fi
    else
      echo "⚠️  No certificates could be issued. Continuing without SSL."
    fi
  fi
fi
# --- End Certbot SSL ---

# End message
clear
echo ""
echo " ╔═════════════════════════════════════════════════════════════════════════════════════════╗"
echo " ║                                                                                         ║"
echo " ║  🎉 Installation Complete! 🎉                                                           ║"
echo " ║                                                                                         ║"

if [ "$SYSTEMD_SERVICE_CREATED" = "yes" ]; then
    echo " ║  🚀 The Nostrcheck server has been configured to run as a systemd service.              ║"
    echo " ║                                                                                         ║"
    echo " ║     👉 To start the server:   sudo systemctl start nostrcheck                           ║"
    echo " ║     👉 To stop the server:    sudo systemctl stop nostrcheck                            ║"
    echo " ║     👉 To check status:       sudo systemctl status nostrcheck                          ║"
    echo " ║     👉 To enable on boot:     sudo systemctl enable nostrcheck                          ║"
    echo " ║     👉 To disable on boot:    sudo systemctl disable nostrcheck                         ║"
else
    echo " ║  🚀 You can now start the Nostrcheck server by running the following command:           ║"
    echo " ║     👉 cd nostrcheck-server && npm run start                                            ║"
fi

echo " ║                                                                                         ║"
echo " ║  📄 Server Documentation:                                                               ║"
echo " ║     📝 https://github.com/quentintaranpino/nostrcheck-server/blob/main/DOCS.md          ║"
echo " ║                                                                                         ║"
echo " ║  💖 If you like this project, please consider supporting its development:               ║"
echo " ║     🔗 https://nostrcheck.me/about/support-us.php                                       ║"
echo " ║                                                                                         ║"
echo " ║  ⚠️  Important Notice:                                                                  ║"
echo " ║     The first time you access the server's frontend, it will auto-login with the        ║"
echo " ║     admin user (public). A new password will be sent to the associated pubkey via DM.   ║"
echo " ║     Please make sure you can log in with the new password before closing this session.  ║"
if [ -z "$PUBKEY" ]; then
echo " ║                                                                                         ║"   
echo " ║  🔑 Please run the server once to generate the server's pubkey and secret key. The new  ║"
echo " ║     keys will be stored in the config/local.json file.                                  ║"
fi
echo " ║                                                                                         ║"
echo " ╚═════════════════════════════════════════════════════════════════════════════════════════╝"
echo ""
