const Path = require('path')
const fs = require('fs-extra')
const Logger = require('../Logger')
const { recurseFiles, getFileTimestampsWithIno } = require('./fileUtils')
const globals = require('./globals')
const LibraryFile = require('../objects/files/LibraryFile')

function isMediaFile(path) {
  if (!path) return false
  var ext = Path.extname(path)
  if (!ext) return false
  var extclean = ext.slice(1).toLowerCase()
  return globals.SupportedAudioTypes.includes(extclean) || globals.SupportedEbookTypes.includes(extclean)
}

// TODO: Function needs to be re-done
// Input: array of relative file paths
// Output: map of files grouped into potential item dirs
function groupFilesIntoLibraryItemPaths(paths) {
  // Step 1: Clean path, Remove leading "/", Filter out files in root dir
  var pathsFiltered = paths.map(path => {
    return path.startsWith('/') ? path.slice(1) : path
  }).filter(path => Path.parse(path).dir)

  // Step 2: Sort by least number of directories
  pathsFiltered.sort((a, b) => {
    var pathsA = Path.dirname(a).split('/').length
    var pathsB = Path.dirname(b).split('/').length
    return pathsA - pathsB
  })

  // Step 3: Group files in dirs
  var itemGroup = {}
  pathsFiltered.forEach((path) => {
    var dirparts = Path.dirname(path).split('/')
    var numparts = dirparts.length
    var _path = ''

    // Iterate over directories in path
    for (let i = 0; i < numparts; i++) {
      var dirpart = dirparts.shift()
      _path = Path.posix.join(_path, dirpart)

      if (itemGroup[_path]) { // Directory already has files, add file
        var relpath = Path.posix.join(dirparts.join('/'), Path.basename(path))
        itemGroup[_path].push(relpath)
        return
      } else if (!dirparts.length) { // This is the last directory, create group
        itemGroup[_path] = [Path.basename(path)]
        return
      } else if (dirparts.length === 1 && /^cd\d{1,3}$/i.test(dirparts[0])) { // Next directory is the last and is a CD dir, create group
        itemGroup[_path] = [Path.posix.join(dirparts[0], Path.basename(path))]
        return
      }
    }
  })
  return itemGroup
}
module.exports.groupFilesIntoLibraryItemPaths = groupFilesIntoLibraryItemPaths

// Input: array of relative file items (see recurseFiles)
// Output: map of files grouped into potential libarary item dirs
function groupFileItemsIntoLibraryItemDirs(fileItems) {
  // Step 1: Filter out files in root dir (with depth of 0)
  var itemsFiltered = fileItems.filter(i => i.deep > 0)

  // Step 2: Seperate media files and other files
  //     - Directories without a media file will not be included
  var mediaFileItems = []
  var otherFileItems = []
  itemsFiltered.forEach(item => {
    if (isMediaFile(item.fullpath)) mediaFileItems.push(item)
    else otherFileItems.push(item)
  })

  // Step 3: Group audio files in library items
  var libraryItemGroup = {}
  mediaFileItems.forEach((item) => {
    var dirparts = item.reldirpath.split('/')
    var numparts = dirparts.length
    var _path = ''

    // Iterate over directories in path
    for (let i = 0; i < numparts; i++) {
      var dirpart = dirparts.shift()
      _path = Path.posix.join(_path, dirpart)

      if (libraryItemGroup[_path]) { // Directory already has files, add file
        var relpath = Path.posix.join(dirparts.join('/'), item.name)
        libraryItemGroup[_path].push(relpath)
        return
      } else if (!dirparts.length) { // This is the last directory, create group
        libraryItemGroup[_path] = [item.name]
        return
      } else if (dirparts.length === 1 && /^cd\d{1,3}$/i.test(dirparts[0])) { // Next directory is the last and is a CD dir, create group
        libraryItemGroup[_path] = [Path.posix.join(dirparts[0], item.name)]
        return
      }
    }
  })

  // Step 4: Add other files into library item groups
  otherFileItems.forEach((item) => {
    var dirparts = item.reldirpath.split('/')
    var numparts = dirparts.length
    var _path = ''

    // Iterate over directories in path
    for (let i = 0; i < numparts; i++) {
      var dirpart = dirparts.shift()
      _path = Path.posix.join(_path, dirpart)
      if (libraryItemGroup[_path]) { // Directory is audiobook group
        var relpath = Path.posix.join(dirparts.join('/'), item.name)
        libraryItemGroup[_path].push(relpath)
        return
      }
    }
  })
  return libraryItemGroup
}

function cleanFileObjects(libraryItemPath, folderPath, files) {
  return Promise.all(files.map(async (file) => {
    var filePath = Path.posix.join(libraryItemPath, file)
    var relFilePath = filePath.replace(folderPath, '')
    var newLibraryFile = new LibraryFile()
    await newLibraryFile.setDataFromPath(filePath, relFilePath)
    return newLibraryFile
  }))
}

// Scan folder
async function scanFolder(libraryMediaType, folder, serverSettings = {}) {
  var folderPath = folder.fullPath.replace(/\\/g, '/')

  var pathExists = await fs.pathExists(folderPath)
  if (!pathExists) {
    Logger.error(`[scandir] Invalid folder path does not exist "${folderPath}"`)
    return []
  }

  var fileItems = await recurseFiles(folderPath)

  var libraryItemGrouping = groupFileItemsIntoLibraryItemDirs(fileItems)

  if (!Object.keys(libraryItemGrouping).length) {
    Logger.error('Root path has no media folders', fileItems.length)
    return []
  }

  var items = []
  for (const libraryItemPath in libraryItemGrouping) {
    var libraryItemData = getDataFromMediaDir(libraryMediaType, folderPath, libraryItemPath, serverSettings)

    var fileObjs = await cleanFileObjects(libraryItemData.path, folderPath, libraryItemGrouping[libraryItemPath])
    var libraryItemFolderStats = await getFileTimestampsWithIno(libraryItemData.path)
    items.push({
      folderId: folder.id,
      libraryId: folder.libraryId,
      ino: libraryItemFolderStats.ino,
      mtimeMs: libraryItemFolderStats.mtimeMs || 0,
      ctimeMs: libraryItemFolderStats.ctimeMs || 0,
      birthtimeMs: libraryItemFolderStats.birthtimeMs || 0,
      ...libraryItemData,
      libraryFiles: fileObjs
    })
  }
  return items
}
module.exports.scanFolder = scanFolder

// Input relative filepath, output all details that can be parsed
function getBookDataFromDir(folderPath, relPath, parseSubtitle = false) {
  relPath = relPath.replace(/\\/g, '/')
  var splitDir = relPath.split('/')

  // Audio files will always be in the directory named for the title
  var title = splitDir.pop()
  var series = null
  var author = null
  // If there are at least 2 more directories, next furthest will be the series
  if (splitDir.length > 1) series = splitDir.pop()
  if (splitDir.length > 0) author = splitDir.pop()
  // There could be many more directories, but only the top 3 are used for naming /author/series/title/


  // If in a series directory check for volume number match
  /* ACCEPTS
    Book 2 - Title Here - Subtitle Here
    Title Here - Subtitle Here - Vol 12
    Title Here - volume 9 - Subtitle Here
    Vol. 3 Title Here - Subtitle Here
    1980 - Book 2-Title Here
    Title Here-Volume 999-Subtitle Here
    2 - Book Title
    100 - Book Title
    0.5 - Book Title
  */
  var volumeNumber = null
  if (series) {
    // Added 1.7.1: If title starts with a # that is 3 digits or less (or w/ 2 decimal), then use as volume number
    var volumeMatch = title.match(/^(\d{1,3}(?:\.\d{1,2})?) - ./)
    if (volumeMatch && volumeMatch.length > 1) {
      volumeNumber = volumeMatch[1]
      title = title.replace(`${volumeNumber} - `, '')
    } else {
      // Match volumes with decimal (OLD: /(-? ?)\b((?:Book|Vol.?|Volume) (\d{1,3}))\b( ?-?)/i)
      var volumeMatch = title.match(/(-? ?)\b((?:Book|Vol.?|Volume) (\d{0,3}(?:\.\d{1,2})?))\b( ?-?)/i)
      if (volumeMatch && volumeMatch.length > 3 && volumeMatch[2] && volumeMatch[3]) {
        volumeNumber = volumeMatch[3]
        var replaceChunk = volumeMatch[2]

        // "1980 - Book 2-Title Here"
        // Group 1 would be "- "
        // Group 3 would be "-"
        // Only remove the first group
        if (volumeMatch[1]) {
          replaceChunk = volumeMatch[1] + replaceChunk
        } else if (volumeMatch[4]) {
          replaceChunk += volumeMatch[4]
        }
        title = title.replace(replaceChunk, '').trim()
      }
    }
  }

  var publishedYear = null
  // If Title is of format 1999 OR (1999) - Title, then use 1999 as publish year
  var publishYearMatch = title.match(/^(\(?[0-9]{4}\)?) - (.+)/)
  if (publishYearMatch && publishYearMatch.length > 2 && publishYearMatch[1]) {
    // Strip parentheses 
    if (publishYearMatch[1].startsWith('(') && publishYearMatch[1].endsWith(')')) {
      publishYearMatch[1] = publishYearMatch[1].slice(1, -1)
    }
    if (!isNaN(publishYearMatch[1])) {
      publishedYear = publishYearMatch[1]
      title = publishYearMatch[2]
    }
  }


  // Subtitle can be parsed from the title if user enabled
  // Subtitle is everything after " - "
  var subtitle = null
  if (parseSubtitle && title.includes(' - ')) {
    var splitOnSubtitle = title.split(' - ')
    title = splitOnSubtitle.shift()
    subtitle = splitOnSubtitle.join(' - ')
  }

  return {
    mediaMetadata: {
      author,
      title,
      subtitle,
      series,
      sequence: volumeNumber,
      publishedYear,
    },
    relPath: relPath, // relative audiobook path i.e. /Author Name/Book Name/..
    path: Path.posix.join(folderPath, relPath) // i.e. /audiobook/Author Name/Book Name/..
  }
}

function getDataFromMediaDir(libraryMediaType, folderPath, relPath, serverSettings) {
  var parseSubtitle = !!serverSettings.scannerParseSubtitle
  return getBookDataFromDir(folderPath, relPath, parseSubtitle)
}


async function getLibraryItemFileData(libraryMediaType, folder, libraryItemPath, serverSettings = {}) {
  var fileItems = await recurseFiles(libraryItemPath)

  libraryItemPath = libraryItemPath.replace(/\\/g, '/')
  var folderFullPath = folder.fullPath.replace(/\\/g, '/')

  var libraryItemDir = libraryItemPath.replace(folderFullPath, '').slice(1)
  var libraryItemData = getDataFromMediaDir(libraryMediaType, folderFullPath, libraryItemDir, serverSettings)
  var libraryItemDirStats = await getFileTimestampsWithIno(libraryItemData.path)
  var libraryItem = {
    ino: libraryItemDirStats.ino,
    mtimeMs: libraryItemDirStats.mtimeMs || 0,
    ctimeMs: libraryItemDirStats.ctimeMs || 0,
    birthtimeMs: libraryItemDirStats.birthtimeMs || 0,
    folderId: folder.id,
    libraryId: folder.libraryId,
    ...libraryItemData,
    libraryFiles: []
  }

  for (let i = 0; i < fileItems.length; i++) {
    var fileItem = fileItems[i]
    var newLibraryFile = new LibraryFile()
    // fileItem.path is the relative path
    await newLibraryFile.setDataFromPath(fileItem.fullpath, fileItem.path)
    libraryItem.libraryFiles.push(newLibraryFile)
  }
  return libraryItem
}
module.exports.getLibraryItemFileData = getLibraryItemFileData