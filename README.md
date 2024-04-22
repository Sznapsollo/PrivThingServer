# PrivThingServer
Simple Web server to serve PrivThing and also allow it to work on files from specified folders on current system

## General
This is node web server which serves webcontent from **client/build** folder and also handles API /actions

**client/build** folder contains built **PrivThing** website - if you want to modify it - PrivThing can be found in separate repository here - https://github.com/Sznapsollo/PrivThing

## How to setup
- download repository
- go to repository folder
- run **npm install** to install all node dependencies
- edit **config.json** to specify which folders and what kind of files you want to use in PrivThing
- run manually by executing **node app.js**
- this will start webserver at port specified in **config.js** file which by default is 888
- so served content should be available under **http://localhost:8888**

## Enable using server in PrivThing to see shared files
- open PrivThing **http://localhost:8888**
- go to Settings (menu icon top-right corner) and mark the following setting **Enable file server** & save
- ![image](https://github.com/Sznapsollo/PrivThingServer/assets/20971560/baa243aa-db1d-4a37-99a3-b1526fc5567c)


## API

PrivThingServer handles simple api to retrieve list of files and also to update files - api is handled by **actions** route (**http://localhost:8888/actions**)

Actions api expects post request with body object with **type** property (example: {type: "getListOfFiles"}). Currently the following types are handled
- **getListOfFiles** - lists files from folders (folders and accepted file extensions are configured in **config.json**)
- **retrieveFileFromPath** - retrieves file from specified path (has to be path allowed in config.json)
- **updateFileFromPath** - updates file with content (file has to be of path allowed in config.json)


## Can also create as service
- Create service file - lets name it for example **privThingService.service** with the following content (placement of node might be different in your case)
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
sudo cp privThingService.service /etc/systemd/system/privThingService.service
```
- Reload daemon
```
systemctl daemon-reload
```
- Enable service
```
sudo systemctl enable privThingService.service
```
- Start service
```
sudo systemctl start privThingService.service
```
- Other helpuf commands
```
sudo systemctl stop privThingService.service
sudo systemctl status privThingService.service
```
