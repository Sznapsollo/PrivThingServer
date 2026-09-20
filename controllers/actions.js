const { response } = require("express");
const fs = require('fs');
const fsp = require('fs/promises');
const config = require('../config.json');
const path = require("path");

const filesFolders = config.filesFolders;
const extensions = (config.extensions || []).map((extension) => extension.toLowerCase());

const allowedRoots = (filesFolders || []).reduce((roots, filesFolder) => {
  const resolved = path.resolve(filesFolder);
  roots.push(resolved);
  try {
    const real = fs.realpathSync(resolved);
    if (real !== resolved) {
      roots.push(real);
    }
  } catch (e) {
    // folder may not exist yet
  }
  return roots;
}, []);

const isInsideAllowedRoot = (target) =>
  allowedRoots.some((root) => target === root || target.startsWith(root + path.sep));

const assertAllowed = (target) => {
  if (!isInsideAllowedRoot(target)) {
    throw new Error('Access to file denied.');
  }
  if (extensions.indexOf(path.extname(target).toLowerCase()) < 0) {
    throw new Error('Access to file denied.');
  }
};

const resolveAllowedFile = (filePath) => {
  if (!filesFolders || !filesFolders.length) {
    throw new Error('Folder paths defined');
  }

  if (!filePath || !filePath.length) {
    throw new Error('No file selected');
  }

  const target = path.resolve(filePath);
  assertAllowed(target);

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error('File does not exist or is incorrect.');
  }

  const realTarget = fs.realpathSync(target);
  if (realTarget !== target) {
    assertAllowed(realTarget);
  }

  return realTarget;
};

const MAX_SEARCH_FILE_SIZE = 5 * 1024 * 1024;

async function searchFile(fileName, filePath, fileSize, searchPhrase) {
  try {
      const needle = String(searchPhrase).toLowerCase();

      if(fileName.toLowerCase().includes(needle)) {
        return true
      }

      if(fileSize > MAX_SEARCH_FILE_SIZE) {
        return false
      }

      const content = await fsp.readFile(filePath, { encoding: 'utf8' });
      if (content.toLowerCase().includes(needle)) {
          return true
      }
  } catch (error) {
      console.error(`Error reading ${filePath}: ${error}`);
  }
  return false
}

const getListOfFiles = async (searchPhrase) => {
  let returnData = {files:[]};

  for (const filesFolder of filesFolders) {
    let files;
    try {
      files = await fsp.readdir(filesFolder);
    } catch (error) {
      console.warn('folder does not exist', filesFolder);
      continue
    }

    const fileItems = await Promise.all(files.map(async (file) => {
      const extension = path.extname(file);
      if(!extension || extensions.indexOf(extension.toLowerCase()) < 0) {
        return null
      }

      const filePath = filesFolder + file;
      let fileStats;
      try {
        fileStats = await fsp.stat(filePath);
      } catch (error) {
        return null
      }

      if(!fileStats.isFile()) {
        return null
      }

      let modifiedTimestamp = 0;
      try {modifiedTimestamp = new Date(fileStats.mtime).getTime()} catch(e) {console.error('Could not parse mtime', e)};

      const fileItemData = {
        folder: filesFolder,
        path: filePath,
        name: file,
        size: fileStats.size / 1000,
        lastModified: modifiedTimestamp
      }

      if(searchPhrase && searchPhrase.length >= 3) {
        const matches = await searchFile(fileItemData.name, fileItemData.path, fileStats.size, searchPhrase);
        if(!matches) {
          return null
        }
      }

      return fileItemData
    }));

    returnData.files.push(...fileItems.filter((fileItem) => !!fileItem));
  }

  return returnData
}

const retrieveFileFromPath = async (filePath) => {
  const target = resolveAllowedFile(filePath);

  return await fsp.readFile(target, { encoding: 'utf8' })
}

const updateFileFromPath = async (data, filePath) => {
  const target = resolveAllowedFile(filePath);

  await fsp.writeFile(target, data);

  return null
}

const handleAction = async (req, res = response) => {
  
  console.log('handleAction', req?.body?.type)
  // console.log(req.body)
  let responseData = {status: 0, data: {}}
  
  try {
    
    switch(req.body.type) {
      case 'getListOfFiles':
        responseData.data = await getListOfFiles(req.body.searchPhrase);
        break
      case 'retrieveFileFromPath':
        responseData.data = await retrieveFileFromPath(req.body.data);
        break
      case 'updateFileFromPath':
        responseData.data = await updateFileFromPath(req.body.data, req.body.path);
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