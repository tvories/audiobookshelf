const { isNullOrNaN } = require('../../utils/index')
const AudioMetaTags = require('../metadata/AudioMetaTags')
const FileMetadata = require('../metadata/FileMetadata')

class AudioFile {
  constructor(data) {
    this.index = null
    this.ino = null
    this.metadata = null
    this.addedAt = null
    this.updatedAt = null

    this.trackNumFromMeta = null
    this.discNumFromMeta = null
    this.trackNumFromFilename = null
    this.discNumFromFilename = null

    this.format = null
    this.duration = null
    this.bitRate = null
    this.language = null
    this.codec = null
    this.timeBase = null
    this.channels = null
    this.channelLayout = null
    this.chapters = []
    this.embeddedCoverArt = null

    // Tags scraped from the audio file
    this.metaTags = null

    this.manuallyVerified = false
    this.invalid = false
    this.exclude = false
    this.error = null

    if (data) {
      this.construct(data)
    }
  }

  toJSON() {
    return {
      index: this.index,
      ino: this.ino,
      metadata: this.metadata.toJSON(),
      addedAt: this.addedAt,
      updatedAt: this.updatedAt,
      trackNumFromMeta: this.trackNumFromMeta,
      discNumFromMeta: this.discNumFromMeta,
      trackNumFromFilename: this.trackNumFromFilename,
      discNumFromFilename: this.discNumFromFilename,
      manuallyVerified: !!this.manuallyVerified,
      invalid: !!this.invalid,
      exclude: !!this.exclude,
      error: this.error || null,
      format: this.format,
      duration: this.duration,
      bitRate: this.bitRate,
      language: this.language,
      codec: this.codec,
      timeBase: this.timeBase,
      channels: this.channels,
      channelLayout: this.channelLayout,
      chapters: this.chapters,
      embeddedCoverArt: this.embeddedCoverArt,
      metaTags: this.metaTags ? this.metaTags.toJSON() : {}
    }
  }

  construct(data) {
    this.index = data.index
    this.ino = data.ino
    this.metadata = new FileMetadata(data.metadata || {})
    if (!this.metadata.toJSON) {
      console.error('No metadata tojosnm\n\n\n\n\n\n', this)
    }
    this.addedAt = data.addedAt
    this.updatedAt = data.updatedAt
    this.manuallyVerified = !!data.manuallyVerified
    this.invalid = !!data.invalid
    this.exclude = !!data.exclude
    this.error = data.error || null

    this.trackNumFromMeta = data.trackNumFromMeta
    this.discNumFromMeta = data.discNumFromMeta
    this.trackNumFromFilename = data.trackNumFromFilename

    if (data.cdNumFromFilename !== undefined) this.discNumFromFilename = data.cdNumFromFilename // TEMP:Support old var name
    else this.discNumFromFilename = data.discNumFromFilename

    this.format = data.format
    this.duration = data.duration
    this.bitRate = data.bitRate
    this.language = data.language
    this.codec = data.codec || null
    this.timeBase = data.timeBase
    this.channels = data.channels
    this.channelLayout = data.channelLayout
    this.chapters = data.chapters
    this.embeddedCoverArt = data.embeddedCoverArt || null

    this.metaTags = new AudioMetaTags(data.metaTags || {})
  }

  // New scanner creates AudioFile from AudioFileScanner
  setDataFromProbe(libraryFile, probeData) {
    this.ino = libraryFile.ino || null

    this.metadata = libraryFile.metadata.clone()
    this.addedAt = Date.now()
    this.updatedAt = Date.now()

    this.format = probeData.format
    this.duration = probeData.duration
    this.bitRate = probeData.bitRate || null
    this.language = probeData.language
    this.codec = probeData.codec || null
    this.timeBase = probeData.timeBase
    this.channels = probeData.channels
    this.channelLayout = probeData.channelLayout
    this.chapters = probeData.chapters || []
    this.metaTags = probeData.audioFileMetadata
    this.embeddedCoverArt = probeData.embeddedCoverArt
  }

  validateTrackIndex() {
    var numFromMeta = isNullOrNaN(this.trackNumFromMeta) ? null : Number(this.trackNumFromMeta)
    var numFromFilename = isNullOrNaN(this.trackNumFromFilename) ? null : Number(this.trackNumFromFilename)

    if (numFromMeta !== null) return numFromMeta
    if (numFromFilename !== null) return numFromFilename

    this.invalid = true
    this.error = 'Failed to get track number'
    return null
  }

  setDuplicateTrackNumber(num) {
    this.invalid = true
    this.error = 'Duplicate track number "' + num + '"'
  }

  syncChapters(updatedChapters) {
    if (this.chapters.length !== updatedChapters.length) {
      this.chapters = updatedChapters.map(ch => ({ ...ch }))
      return true
    } else if (updatedChapters.length === 0) {
      if (this.chapters.length > 0) {
        this.chapters = []
        return true
      }
      return false
    }

    var hasUpdates = false
    for (let i = 0; i < updatedChapters.length; i++) {
      if (JSON.stringify(updatedChapters[i]) !== JSON.stringify(this.chapters[i])) {
        hasUpdates = true
      }
    }
    if (hasUpdates) {
      this.chapters = updatedChapters.map(ch => ({ ...ch }))
    }
    return hasUpdates
  }

  clone() {
    return new AudioFile(this.toJSON())
  }

  // If the file or parent directory was renamed it is synced here
  syncFile(newFile) {
    // TODO: Sync file would update the file info if needed
    return false
    // var hasUpdates = false
    // var keysToSync = ['path', 'relPath', 'ext', 'filename']
    // keysToSync.forEach((key) => {
    //   if (newFile[key] !== undefined && newFile[key] !== this[key]) {
    //     hasUpdates = true
    //     this[key] = newFile[key]
    //   }
    // })
    // return hasUpdates
  }

  updateFromScan(scannedAudioFile) {
    var hasUpdated = false

    var newjson = scannedAudioFile.toJSON()
    if (this.manuallyVerified) newjson.manuallyVerified = true
    if (this.exclude) newjson.exclude = true
    newjson.addedAt = this.addedAt

    for (const key in newjson) {
      if (key === 'metadata') {
        if (this.metadata.update(newjson[key])) {
          hasUpdated = true
        }
      } else if (key === 'metaTags') {
        if (!this.metaTags || !this.metaTags.isEqual(scannedAudioFile.metaTags)) {
          this.metaTags = scannedAudioFile.metaTags.clone()
          hasUpdated = true
        }
      } else if (key === 'chapters') {
        if (this.syncChapters(newjson.chapters || [])) {
          hasUpdated = true
        }
      } else if (this[key] !== newjson[key]) {
        this[key] = newjson[key]
        hasUpdated = true
      }
    }
    return hasUpdated
  }
}
module.exports = AudioFile