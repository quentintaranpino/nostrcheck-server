# Nostrcheck server
<p align="center">
<img src= "https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/b4a7a4c3-938f-4f60-af81-3af4e5178ec4">
</p>

## Powered by
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white) ![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white) ![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white) ![Ffmpeg](https://img.shields.io/badge/ffmpeg-74aa9c?style=for-the-badge&logo=ffmpeg&logoColor=white&logoWidth=25) ![nostr-tools](https://img.shields.io/badge/nostr%7Ctools-9932cc?style=for-the-badge&logo=toml&logoColor=white)

## About
Nostrcheck server is a set of tools to interact with nostr and be sovereign of your data. 

It allows to validate nostr address (NIP05), multimedia uploads (NIP94, NIP96, and [Blossom](https://github.com/hzrd149/blossom)🌸), nostr notes integrity check and lightning redirects. All under NIP98 authentication 100% nostr compatible.

The server can be installed anywhere and allows anyone to become a nostr service provider. 

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

```
git clone https://github.com/quentintaranpino/nostrcheck-api-ts.git && cd nostrcheck-api-ts && sudo docker-compose up -d

```
https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/dff0933a-0325-4c0b-bad5-5e2702337ea0

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

## Supported Nostr NIP's

- [x] NIP01
- [x] NIP04
- [x] NIP05
- [x] NIP07
- [x] NIP19
- [x] NIP44
- [x] NIP47
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
- [ ] Integrated micro-relay
- [x] Nostr wallet connect

## License

MIT License (MIT)

```
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
