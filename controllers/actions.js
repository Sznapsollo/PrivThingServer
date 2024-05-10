const { response } = require("express");
const fs = require('fs');
const config = require('../config.json');
const path = require("path");

const filesFolders = config.filesFolders;
const extensions = config.extensions;

function searchFile(fileName, filePath, searchPhrase) {
  try {
      const regex = new RegExp(`${searchPhrase}`, 'g');

      if(regex.test(fileName)) {
        return true
      }
      // Read the content of the file and check for a matching pattern
      const content = fs.readFileSync(filePath);
      if (regex.test(content)) {
          return true
      }
  } catch (error) {
      console.error(`Error reading ${filePath}: ${error}`);
  }
  return false
}

const getListOfFiles = (searchPhrase) => {
  let returnData = {files:[]};

  filesFolders.forEach( filesFolder => {
    if (!fs.existsSync(filesFolder)){
      console.warn('folder does not exist', filesFolder);
      return
    }
    fs.readdirSync(filesFolder).forEach(file => {
      const extension = path.extname(file);
      const fileStats = fs.statSync(filesFolder + file);
      let filePropertExtension = extension && extensions.indexOf (extension.toLowerCase()) >= 0;
      if(!filePropertExtension) {
        return
      }

      let modifiedTimestamp = 0;
      try {modifiedTimestamp = new Date(fileStats.mtime).getTime()} catch(e) {console.error('Could not parse mtime', e)};

      let fileItemData = {
        folder: filesFolder, 
        path: filesFolder + file, 
        name: file, 
        size: fileStats.size / 1000, 
        lastModified: modifiedTimestamp
      }

      if(searchPhrase && searchPhrase.length >= 3 && !searchFile(fileItemData.name, fileItemData.path, searchPhrase)) {
        return
      }

      returnData.files.push(fileItemData);
    });
  })
  return returnData
}

const retrieveFileFromPath = (filePath) => {
  let returnData = null;

  if(!filesFolders || !filesFolders.length) {
    throw new Error('Folder paths defined');
  }

  if(!filePath || !filePath.length) {
    throw new Error('No file selected');
  }

  let foundConfiguredFolder = filesFolders.find( (filesFolder) =>
    filePath.includes(filesFolder)
  )

  if(!foundConfiguredFolder) {
    throw new Error('Access to file denied.');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    returnData = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' });
  } else {
    throw new Error('File does not exist or is incorrect.');
  }

  return returnData
}

const updateFileFromPath = (data, filePath) => {
  let returnData = null;

  if(!filesFolders || !filesFolders.length) {
    throw new Error('Folder paths defined');
  }

  if(!filePath || !filePath.length) {
    throw new Error('No file selected');
  }

  let foundConfiguredFolder = filesFolders.find( (filesFolder) => {
    return filePath.includes(filesFolder)
  })

  if(!foundConfiguredFolder) {
    throw new Error('Access to file denied.');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    fs.writeFileSync(filePath, data);
  } else {
    throw new Error('File does not exist or is incorrect.');
  }

  return returnData
}


const handleAction = async (req, res = response) => {
  
  console.log('handleAction', req?.body?.type)
  // console.log(req.body)
  let responseData = {status: 0, data: {}}
  
  try {
    
    switch(req.body.type) {
      case 'getListOfFiles':
        responseData.data = getListOfFiles(req.body.searchPhrase);
        break
      case 'retrieveFileFromPath':
        responseData.data = retrieveFileFromPath(req.body.data);
        break
      case 'updateFileFromPath':
        responseData.data = updateFileFromPath(req.body.data, req.body.path);
        break
      default:
        responseData.status = -1;
        responseData.data = 'Unrecognized action';
        break;
    }

    res.json(responseData);
  } catch (err) {
    console.error(err);
    responseData.status = -1;
    responseData.data = err?.message ? err.message : "Operation failed";
    res.json(responseData);
  }
};

module.exports = {
  handleAction,
};