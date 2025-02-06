# Nostrcheck server
![Contributors](https://img.shields.io/github/contributors/quentintaranpino/nostrcheck-server) 
![License](https://img.shields.io/github/license/quentintaranpino/nostrcheck-server)

<p align="center">
<img src= "https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/b4a7a4c3-938f-4f60-af81-3af4e5178ec4">
</p>

## Powered by

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white) ![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white) ![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white) ![Ffmpeg](https://img.shields.io/badge/ffmpeg-74aa9c?style=for-the-badge&logo=ffmpeg&logoColor=white&logoWidth=25) ![nostr-tools](https://img.shields.io/badge/nostr%7Ctools-9932cc?style=for-the-badge&logo=toml&logoColor=white) ![Python](https://img.shields.io/badge/python-3776AB?style=for-the-badge&logo=python&logoColor=white) 
![AI](https://img.shields.io/badge/AI-Powered-%23FF6F61?style=for-the-badge&logo=openai&logoColor=white) 
![S3](https://img.shields.io/badge/S3-Compatible-%23FF9900?style=for-the-badge&logo=amazonaws&logoColor=white) ![NWC](https://img.shields.io/badge/NWC-%239932cc?style=for-the-badge&logo=data:image/png;base64,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)

## About

Nostrcheck Server is a comprehensive solution for managing and offering services within the Nostr ecosystem, designed to ensure data sovereignty. This server enables:

- **Nostraddress Management (NIP05):** Configure and manage personalized Nostr addresses.
- **Hosting of Multimedia Files:** Fully compatible with NIP94, NIP96, and Blossom🌸 for uploading and sharing content.
- **Lightning Redirects:** Allow your users to redirect payments to their Lightning wallets using their Nostraddress.
- **Full LN Integration:** Compatible with **Nostr Wallet Connect** and **LNBits**, enabling LN payments for file uploads, downloads, and user registrations.
- **Advanced User Management:** Control profiles, invitations, and permissions.
- **Plugin Module:** Customize and extend server functionalities with plugins. (WoT, etc).
- **Public Gallery and Directory:** The public gallery displays files uploaded by users, while the directory showcases user profiles from the community.
- **User-Managed Nostr Tools:** Users can manage their Nostr relays, profile data, uploaded files, and update their account settings directly from their profiles.
- **Ban Module:** Includes tools to ban users, ensuring data security and enabling the reporting of illegal activities to the authorities.
- **Integrated AI:** Automatically analyzes uploaded multimedia to detect sensitive or illegal content, reducing the workload for server administrators.
- **Invitation Module:** Allows administrators to manage invitation codes for controlled access to specific domains.
- **Nostr relay:** The server can act as a Nostr relay, allowing admins to manage their own Nostr relay.

The server is highly customizable and can be deployed in any environment, allowing anyone to become a Nostr service provider.

## Table of Contents

- [About](#about)
- [Installation](#installation)
  - [Standalone Installation](#installation-standalone)
  - [Docker Installation](#installation-docker)
- [Documentation](#documentation)
- [Configuration](#configuration)
- [Plugins](#plugins)
- [Screenshots](#screenshots)
- [Supported Nostr NIPs](#supported-nostr-nips)
- [Supported Blossom BUDs](#supported-blossom-buds)
- [Supported Lightning LUDs](#supported-lightning-luds)
- [Roadmap](#roadmap)
- [License](#license)

## Installation

The installation can be done in two ways, standalone where the system resources will be used natively and via docker where the software will be encapsulated in an isolated image. 

The standalone installation allows you to configure more parameters, such as the database name, the public key of the server or other aspects. On the other hand, the docker installation is simpler and more secure, so use docker if you are not sure which one to choose.

In either case, all parameters can be modified using the settings page in the server administration panel.

### Installation (standalone)

To make a standalone installation you can use the following script. You can find the code [here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/scripts/install.sh)

```
curl https://raw.githubusercontent.com/quentintaranpino/nostrcheck-server/refs/heads/main/scripts/install.sh --output install.sh && chmod +x install.sh && ./install.sh
```

### Installation (docker)

To install and run the server using docker you can use the following script.

```bash
git clone https://github.com/quentintaranpino/nostrcheck-server.git && cd nostrcheck-server && sudo docker-compose up -d

```

[Video demonstration](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/dff0933a-0325-4c0b-bad5-5e2702337ea0)

## Documentation

See documentation [here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/DOCS.md)

## Configuration

See configuration [here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/CONFIG.md)

## Plugins

See plugins [here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/PLUGINS.md)

## Screenshots

### Dashboard

![image](https://github.com/user-attachments/assets/5f634568-9374-40d1-81fa-35e75cd2c9e2)

### User public / private profile

![image](https://github.com/user-attachments/assets/aa65f649-1537-43a3-a26d-b85c4af12a30)

### Nostr settings page

![image](https://github.com/user-attachments/assets/537e6e04-cfb4-4448-99a5-0a0c6c24d8af)

### Nostr relay management

![image](https://github.com/user-attachments/assets/6dd491ef-af55-4472-bdd9-a750537ad28b)

### Nostr file manager

![image](https://github.com/user-attachments/assets/06b09897-e37e-4e7c-8149-f2b96462b21b)

### Server settings page

![image](https://github.com/user-attachments/assets/44c0a420-bd01-4ea8-8250-fbe657ef3019)

### Login

![image](https://github.com/user-attachments/assets/aed1716b-e8f2-4ded-8ec0-edd4b6ada802)

### Gallery

![image](https://github.com/user-attachments/assets/179f01f9-b52c-44dc-b375-68a57d89f18a)

### Uploads

![image](https://github.com/user-attachments/assets/a598bd89-bae8-447f-947c-1a2a645c454d)

### Directory

![image](https://github.com/user-attachments/assets/808c741e-2916-49df-95c7-8a3a55661ac9)

### Public API docs

![image](https://github.com/user-attachments/assets/62dedb9b-18fa-4bc7-acd1-a2f13772a797)

### Customizable frontpage and logo

![image](https://github.com/user-attachments/assets/612941f9-4348-45ee-8d11-e02f1eff6f57)

### Register form

![image](https://github.com/user-attachments/assets/7de9bdc8-ee8e-4f0a-b180-3a62f25788fe)

### Payments (register)

![image](https://github.com/user-attachments/assets/ccfff366-a46b-46c2-9a75-5009645fc77a)

### Payments (file hosting)

![image](https://github.com/user-attachments/assets/8e2f0ca3-4395-4611-bacd-874a38f9941b)

### Plugins

![image](https://github.com/user-attachments/assets/ca3a13ee-179a-4ea8-a022-37497e35f6be)

## Supported Nostr NIP's

- [x] NIP01
- [x] NIP02
- [x] NIP03
- [x] NIP04
- [x] NIP05
- [x] NIP07
- [x] NIP09
- [x] NIP11
- [x] NIP13
- [x] NIP14
- [x] NIP19
- [x] NIP40
- [x] NIP42
- [x] NIP45
- [x] NIP47
- [x] NIP48
- [x] NIP78
- [x] NIP94
- [x] NIP96
- [x] NIP98

## Supported Blossom BUD's

- [x] BUD01
- [x] BUD02
- [x] BUD03
- [x] BUD04
- [x] BUD06
- [x] BUD07

## Supported Lightning LUD's

- [x] LUD06

## Roadmap

- [x] Nostraddress service
- [x] Media uploads
- [x] Lightning redirects
- [x] Standalone Installation script
- [x] Docker installation
- [x] Nostr DM integration (NIP04)
- [x] Frontend UI (dashboard)
- [x] Frontend UI (settings)
- [x] Frontend UI (homepage)
- [x] Frontend UI (docs and ToS)
- [x] Remote Object Storage (s3)
- [x] Blossom spec compatible
- [x] Lightning payments
- [x] Frontend UI (profile)
- [x] Frontend UI (public gallery)
- [x] Frontend UI (public upload)
- [x] Frontend UI (register)
- [x] Ban system
- [x] AI moderation
- [x] Plugins engine
- [ ] Private Direct Messages (NIP17)
- [ ] Multi-server mirroring
- [ ] Import / Export data
- [ ] Custom frontend templates
- [x] Frontend UI (directory)
- [ ] Umbrel appstore integration
- [ ] Start9 appstore integration
- [x] Integrated nostr relay
- [x] Nostr wallet connect

## License

MIT License (MIT)

```text

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```
