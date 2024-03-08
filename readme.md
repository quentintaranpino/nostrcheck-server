# Nostrcheck server
<p align="center">
<img src= "https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/b4a7a4c3-938f-4f60-af81-3af4e5178ec4">
</p>

## About
Nostrcheck server is a set of tools to interact with nostr and be sovereign of your data. 

It allows to validate nostr address (NIP05), multimedia uploads (NIP94, NIP96), nostr notes integrity check and lightning redirects. All under NIP98 authentication 100% nostr compatible.

The server can be installed anywhere and allows anyone to become a nostr service provider. 

## Installation
The installation can be done in two ways, standalone where the system resources will be used natively and via docker where the software will be encapsulated in an isolated image. 

The standalone installation allows you to configure more parameters, such as the database name, the public key of the server or other aspects. On the other hand, the docker installation is simpler and more secure, so use docker if you are not sure which one to choose.

In either case, all parameters can be modified using the settings page in the server administration panel.

### Installation (standalone)

To make a standalone installation you can use the following script. You can find the code [here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/scripts/install.sh)

```
curl https://raw.githubusercontent.com/quentintaranpino/nostrcheck-api-ts/0.5.0/scripts/install.sh --output install.sh && chmod +x install.sh && ./install.sh
```

### Installation (docker) 

To install and run the server using docker you can use the following script.( Warning, this script is still in BETA)

```
git clone https://github.com/quentintaranpino/nostrcheck-api-ts.git && cd nostrcheck-api-ts && git switch 0.5.0 && sudo docker-compose up -d --build

```

## Documentation

See documentation [here](https://github.com/quentintaranpino/nostrcheck-api-ts/blob/0.5.0/DOCS.md)

## Screenshots
### Dashboard
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/f9f4ab55-3560-49c2-b437-c90079b7a66c)
### User public / private profile
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/3b2507d7-5ba1-4d09-8cb1-06aa6298d681)

### Server settings page
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/89127444-fba3-4ce9-860c-d221989b011b)

### Login 
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/507ff222-6272-4c33-8144-10ca3264b778)

### Public API docs
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/6c6f9976-fccc-40fb-a63c-5f9dd507faf0)

### Customizable frontpage and logo
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/9de9cfc6-52d1-4056-b781-0c7b6278cbb8)
![image](https://github.com/quentintaranpino/nostrcheck-api-ts/assets/125748180/6299137f-e862-4854-bfe0-f793ef0417e6)

## Supported nips

- [x] NIP01
- [x] NIP04
- [x] NIP07
- [x] NIP19
- [x] NIP44
- [x] NIP94
- [x] NIP96
- [x] NIP98


## Powered by
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white) ![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white) ![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white) ![Ffmpeg](https://img.shields.io/badge/ffmpeg-74aa9c?style=for-the-badge&logo=ffmpeg&logoColor=white&logoWidth=25) ![nostr-tools](https://img.shields.io/badge/nostr%7Ctools-9932cc?style=for-the-badge&logo=toml&logoColor=white)

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
