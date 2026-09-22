const { response } = require("express");
const fs = require('fs');
const fsp = require('fs/promises');
const config = require('../config.json');
const path = require("path");

const filesFolders = (config.filesFolders || []).map((filesFolder) => {
  if(typeof filesFolder === 'string') {
    return { path: filesFolder, label: null }
  }
  return { path: filesFolder?.path, label: filesFolder?.label || null }
}).filter((filesFolder) => !!filesFolder.path);

const extensions = (config.extensions || []).map((extension) => extension.toLowerCase());

const allowedRoots = filesFolders.reduce((roots, filesFolder) => {
  const resolved = path.resolve(filesFolder.path);
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

const resolveAllowedFolder = (folderPath) => {
  if(!filesFolders || !filesFolders.length) {
    throw new Error('Folder paths defined');
  }

  if(!folderPath || !folderPath.length) {
    throw new Error('No folder selected');
  }

  const target = path.resolve(folderPath);
  if(!allowedRoots.some((root) => root === target)) {
    throw new Error('Access to folder denied.');
  }

  return target
};

const resolveNewFileName = (fileName) => {
  if(!fileName || !fileName.length) {
    throw new Error('No file name given');
  }

  if(fileName !== path.basename(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('Access to file denied.');
  }

  if(extensions.indexOf(path.extname(fileName).toLowerCase()) < 0) {
    throw new Error('Access to file denied.');
  }

  return fileName
};

const lastModifiedOf = (target) => {
  try {
    return new Date(fs.statSync(target).mtime).getTime()
  } catch (e) {
    return 0
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
      files = await fsp.readdir(filesFolder.path);
    } catch (error) {
      console.warn('folder does not exist', filesFolder.path);
      continue
    }

    const fileItems = await Promise.all(files.map(async (file) => {
      const extension = path.extname(file);
      if(!extension || extensions.indexOf(extension.toLowerCase()) < 0) {
        return null
      }

      const filePath = path.join(filesFolder.path, file);
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
        folder: filesFolder.path,
        folderLabel: filesFolder.label,
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
  const content = await fsp.readFile(target, { encoding: 'utf8' });

  return { data: content, lastModified: lastModifiedOf(target) }
}

const updateFileFromPath = async (data, filePath, expectedLastModified) => {
  const target = resolveAllowedFile(filePath);

  if(expectedLastModified) {
    const current = lastModifiedOf(target);
    if(current && current !== expectedLastModified) {
      const conflict = new Error('File changed on disk.');
      conflict.code = 'CONFLICT';
      conflict.lastModified = current;
      throw conflict
    }
  }

  await fsp.writeFile(target, data);

  return { lastModified: lastModifiedOf(target) }
}

const createFileInFolder = async (data, folderPath, fileName) => {
  const folder = resolveAllowedFolder(folderPath);
  const target = path.join(folder, resolveNewFileName(fileName));

  if(fs.existsSync(target)) {
    throw new Error('File already exists.');
  }

  await fsp.writeFile(target, data == null ? '' : data);

  return { path: target }
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
      case 'retrieveFileFromPath': {
        const file = await retrieveFileFromPath(req.body.data);
        responseData.data = file.data;
        responseData.lastModified = file.lastModified;
        break
      }
      case 'updateFileFromPath': {
        const updated = await updateFileFromPath(req.body.data, req.body.path, req.body.lastModified);
        responseData.lastModified = updated.lastModified;
        break
      }
      case 'createFileInFolder':
        responseData.data = await createFileInFolder(req.body.data, req.body.folder, req.body.name);
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
    if(err?.code) {
      responseData.code = err.code;
    }
    if(err?.lastModified) {
      responseData.lastModified = err.lastModified;
    }
    res.json(responseData);
  }
};

module.exports = {
  handleAction,
};