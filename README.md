# PrivThingServer

![image](https://github.com/Sznapsollo/PrivThingServer/assets/20971560/a897eca8-12ed-439a-a866-d07f92ea86df)

A small Node web server that serves **PrivThing** locally and lets it work on files from
folders you choose on that computer.

## What it does

Two things, and nothing else:

1. **Serves the PrivThing website** from the `client/build` folder
2. **Answers a small API** at `/actions`, so PrivThing can list, read, write and create files
   inside the folders you configured

`client/build` holds the built PrivThing site. The source lives in its own repository:
https://github.com/Sznapsollo/PrivThing

It binds to **localhost only** - it is meant for your own machine, not your network. Please
read [Security](#security) before pointing it at any folder.

---

## Setup

- download the repository
- go to the repository folder
- run **npm install** to install the dependencies
- copy **config.example.json** to **config.json** - the real config is not kept in the
  repository, so that nobody publishes their own folder paths
- edit **config.json** (see below) to say which folders and which kinds of file to use
- run it with **node app.js**
- it listens on the port from **config.json**, by default 8888, so PrivThing is then at
  **http://localhost:8888**

### config.json

```json
{
    "port": 8888,
    "filesFolders": [
        "/home/youruser/notes/",
        { "path": "/home/youruser/Documents/work_log/", "label": "Work log" }
    ],
    "extensions": [".txt", ".prvthng", ".sh", ".groovy", ".csv", ".md"]
}
```

- **port** - where the server listens
- **filesFolders** - the folders whose files PrivThing may list and open. An entry is either a
  plain path, or `{"path": "...", "label": "..."}` - the label is what PrivThing shows instead
  of the full path. Without a label the path is shown
- **extensions** - only files with these extensions are listed. The leading `.` is required

Changing `config.json` needs a restart.

### Turning it on in PrivThing

- open PrivThing at **http://localhost:8888**
- go to Settings (menu icon, top right) and tick **Enable file server**, then save

![image](https://github.com/Sznapsollo/PrivThingServer/assets/20971560/baa243aa-db1d-4a37-99a3-b1526fc5567c)

---

## API

Everything goes through one route, **POST /actions**, with a JSON body carrying a **type**
(for example `{"type": "getListOfFiles"}`).

| type | what it does |
|---|---|
| **getListOfFiles** | lists files from the configured folders. Accepts an optional **searchPhrase** (3 characters or more) which is matched against names and contents |
| **retrieveFileFromPath** | reads one file. The response also carries **lastModified** |
| **updateFileFromPath** | writes one file. Send back the **lastModified** you were given and the write is refused with **code: "CONFLICT"** if the file changed on disk meanwhile - omit it to overwrite regardless. The response carries the new **lastModified** |
| **createFileInFolder** | creates a new file in one of the configured folders. The folder must be one of them exactly (not a subfolder), the name must be a plain file name with an allowed extension, and an existing file is never overwritten |

Every response is `{"status": 0, "data": ...}` on success, or `{"status": -1, "data": "<reason>"}`
when refused.

---

## Security

The trust boundary is your own machine, and it is narrow. Read this before running the server.

- The server binds to **localhost only**, so other machines on your network cannot reach it.
- Every path sent to **retrieveFileFromPath** / **updateFileFromPath** must resolve inside one
  of the **filesFolders** and must carry one of the configured **extensions**. Symlinks that
  point outside a configured folder are refused. `..` does not escape.
- **updateFileFromPath overwrites files on your disk and createFileInFolder adds new ones.**
  Only list folders in **filesFolders** that you are happy for a web page on localhost to
  read and write.
- There is no delete action. Files can be read, changed and created, never removed.
- There is no CORS header and no authentication. Any other program running as your user on the
  same machine can call the API; the browser blocks other websites from reading the responses.
- Anything you put in a configured folder is readable through the server while it runs. Do not
  point it at a folder holding keys, credentials or `.env` files.

---

## Running it as a service

- Create a service file - call it for example **privThingService.service** (the path to node
  may differ on your machine)

```
[Unit]
Description=ListingFilesServer for PrivThing
After=network.target

[Service]
ExecStart=/home/[youruser]/node/current-node/bin/node /home/[youruser]/[yourfolder]/app.js
Restart=always
User=youruser
 
[Install]
WantedBy=multi-user.target
```

- copy it into place

```
sudo cp privThingService.service /etc/systemd/system/privThingService.service
```

- reload the daemon

```
systemctl daemon-reload
```

- enable it

```
sudo systemctl enable privThingService.service
```

- start it

```
sudo systemctl start privThingService.service
```

- other useful commands

```
sudo systemctl stop privThingService.service
sudo systemctl status privThingService.service
journalctl -u privThingService.service -n 50
```

### If it will not start

Check `journalctl` first. The usual causes are a missing **app.js** in the folder the service
points at, a **config.json** that is not valid JSON, or a port already in use.

---

## Updating the PrivThing client

`client/build` is a built copy of PrivThing. To refresh it, build PrivThing and copy the
output over - its `npm run release` does exactly that, and prints what to commit.

If you run the server from a separate deployment folder rather than the checkout, remember to
copy **app.js**, **package.json**, **models**, **controllers**, **routes** and **client**.

---

## Tests

```
npm test
```

Covers the path checks (`..`, symlinks, lookalike paths, extensions), the search, conflict
detection, file creation and folder labels.
