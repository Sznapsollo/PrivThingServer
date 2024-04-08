# PrivThingServer
Simple Web server to serve PrivThing and also allow it to work on files from specified folders on current system

## General
This is node web server which servers webcontent from **client/build** folder and also handles API /actions

Actions api expens object with **type** property. Currently the following types are handled
- **getListOfFiles** - lists files from folders (folders and accepted file extensions are configured in **config.json**)
- **retrieveFileFromPath** - retrieves file from specified path (has to be path allowed in config.json)
- **updateFileFromPath** - updates file with content (file has to be of path allowed in config.json)

**client/build** folder contains built **PrivThing** website - if you want to modify it - PrivThing can bo found in separate repository here - https://github.com/Sznapsollo/PrivThing

## How to setup
- copy to specific folder
- edit **config.json** to specify which folders and what kind of files you wan to use in PrivThing
- run manually
```
node /home/[youruser]/[yourfolder]/app.js
```

## Can also create as service
- Create service file - lets name it for example **prithThingService.service** with the following content (placement of node might be different in your case)
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
- copy service to service
```
sudo cp prithThingService.service /etc/systemd/system/prithThingService.service
```
- Reload daemon
```
systemctl daemon-reload
```
- Enable service
```
sudo systemctl enable prithThingService.service
```
- Start service
```
sudo systemctl start prithThingService.service
```
- Other helpuf commands
```
sudo systemctl stop prithThingService.service
sudo systemctl status prithThingService.service
```
