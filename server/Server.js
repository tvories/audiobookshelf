const Path = require('path')
const express = require('express')
const http = require('http')
const SocketIO = require('socket.io')
const fs = require('fs-extra')
const fileUpload = require('express-fileupload')
const rateLimit = require('express-rate-limit')

const { version } = require('../package.json')

// Utils
const { ScanResult } = require('./utils/constants')
const filePerms = require('./utils/filePerms')
const { secondsToTimestamp } = require('./utils/index')
const dbMigration = require('./utils/dbMigration')
const Logger = require('./Logger')

// Classes
const Auth = require('./Auth')
const Watcher = require('./Watcher')
const Scanner = require('./scanner/Scanner')
const Db = require('./Db')
const BackupManager = require('./BackupManager')
const LogManager = require('./LogManager')
const ApiController = require('./ApiController')
const HlsController = require('./HlsController')
// const StreamManager = require('./objects/legacy/StreamManager')
const PlaybackSessionManager = require('./PlaybackSessionManager')
const DownloadManager = require('./DownloadManager')
const CoverController = require('./CoverController')
const CacheManager = require('./CacheManager')

class Server {
  constructor(PORT, UID, GID, CONFIG_PATH, METADATA_PATH, AUDIOBOOK_PATH) {
    this.Port = PORT
    this.Host = '0.0.0.0'
    global.Uid = isNaN(UID) ? 0 : Number(UID)
    global.Gid = isNaN(GID) ? 0 : Number(GID)
    global.ConfigPath = Path.normalize(CONFIG_PATH)
    global.AudiobookPath = Path.normalize(AUDIOBOOK_PATH)
    global.MetadataPath = Path.normalize(METADATA_PATH)
    // Fix backslash if not on Windows
    if (process.platform !== 'win32') {
      global.ConfigPath = global.ConfigPath.replace(/\\/g, '/')
      global.AudiobookPath = global.AudiobookPath.replace(/\\/g, '/')
      global.MetadataPath = global.MetadataPath.replace(/\\/g, '/')
    }

    fs.ensureDirSync(global.ConfigPath, 0o774)
    fs.ensureDirSync(global.MetadataPath, 0o774)
    fs.ensureDirSync(global.AudiobookPath, 0o774)

    this.db = new Db()
    this.auth = new Auth(this.db)
    this.backupManager = new BackupManager(this.db)
    this.logManager = new LogManager(this.db)
    this.cacheManager = new CacheManager()
    this.watcher = new Watcher()
    this.coverController = new CoverController(this.db, this.cacheManager)
    this.scanner = new Scanner(this.db, this.coverController, this.emitter.bind(this))

    this.playbackSessionManager = new PlaybackSessionManager(this.db, this.emitter.bind(this), this.clientEmitter.bind(this))
    // this.streamManager = new StreamManager(this.db, this.emitter.bind(this), this.clientEmitter.bind(this))
    this.downloadManager = new DownloadManager(this.db)
    this.apiController = new ApiController(this.db, this.auth, this.scanner, this.playbackSessionManager, this.downloadManager, this.coverController, this.backupManager, this.watcher, this.cacheManager, this.emitter.bind(this), this.clientEmitter.bind(this))
    this.hlsController = new HlsController(this.db, this.auth, this.playbackSessionManager, this.emitter.bind(this))

    Logger.logManager = this.logManager

    this.server = null
    this.io = null

    this.clients = {}
  }

  get usersOnline() {
    // TODO: Map open user sessions
    return Object.values(this.clients).filter(c => c.user).map(client => {
      return client.user.toJSONForPublic([])
    })
  }

  getClientsForUser(userId) {
    return Object.values(this.clients).filter(c => c.user && c.user.id === userId)
  }

  emitter(ev, data) {
    // Logger.debug('EMITTER', ev)
    this.io.emit(ev, data)
  }

  clientEmitter(userId, ev, data) {
    var clients = this.getClientsForUser(userId)
    if (!clients.length) {
      return Logger.debug(`[Server] clientEmitter - no clients found for user ${userId}`)
    }
    clients.forEach((client) => {
      if (client.socket) {
        client.socket.emit(ev, data)
      }
    })
  }

  authMiddleware(req, res, next) {
    this.auth.authMiddleware(req, res, next)
  }

  async init() {
    Logger.info('[Server] Init v' + version)
    // TODO: Remove orphan streams from playback session manager
    // await this.streamManager.ensureStreamsDir()
    // await this.streamManager.removeOrphanStreams()
    await this.downloadManager.removeOrphanDownloads()

    if (version.localeCompare('1.7.3') < 0) { // Old version data model migration
      await dbMigration.migrateUserData(this.db) // Db not yet loaded
      await this.db.init()
      await dbMigration.migrateLibraryItems(this.db)
      // TODO: Eventually remove audiobooks db when stable
    } else {
      await this.db.init()
    }

    this.auth.init()

    // TODO: Implement method to remove old user auidobook data and book metadata folders
    // await this.checkUserAudiobookData()
    // await this.purgeMetadata()

    await this.backupManager.init()
    await this.logManager.init()

    // If server upgrade and last version was 1.7.0 or earlier - add abmetadata files
    // if (this.db.checkPreviousVersionIsBefore('1.7.1')) {
    // TODO: wait until stable
    // }

    if (this.db.serverSettings.scannerDisableWatcher) {
      Logger.info(`[Server] Watcher is disabled`)
      this.watcher.disabled = true
    } else {
      this.watcher.initWatcher(this.db.libraries)
      this.watcher.on('files', this.filesChanged.bind(this))
    }
  }

  async start() {
    Logger.info('=== Starting Server ===')
    await this.init()

    const app = express()
    this.server = http.createServer(app)

    app.use(this.auth.cors)
    app.use(fileUpload())
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json())

    // Static path to generated nuxt
    const distPath = Path.join(global.appRoot, '/client/dist')
    app.use(express.static(distPath))

    // Metadata folder static path
    app.use('/metadata', this.authMiddleware.bind(this), express.static(global.MetadataPath))

    // Downloads folder static path
    app.use('/downloads', this.authMiddleware.bind(this), express.static(this.downloadManager.downloadDirPath))

    // Static folder
    app.use(express.static(Path.join(global.appRoot, 'static')))

    app.use('/api', this.authMiddleware.bind(this), this.apiController.router)
    app.use('/hls', this.authMiddleware.bind(this), this.hlsController.router)

    // Static file routes
    app.get('/lib/:library/:folder/*', this.authMiddleware.bind(this), (req, res) => {
      var library = this.db.libraries.find(lib => lib.id === req.params.library)
      if (!library) return res.sendStatus(404)
      var folder = library.folders.find(fol => fol.id === req.params.folder)
      if (!folder) return res.status(404).send('Folder not found')

      var remainingPath = req.params['0']
      var fullPath = Path.join(folder.fullPath, remainingPath)
      res.sendFile(fullPath)
    })

    // Book static file routes
    // LEGACY
    app.get('/s/book/:id/*', this.authMiddleware.bind(this), (req, res) => {
      var audiobook = this.db.audiobooks.find(ab => ab.id === req.params.id)
      if (!audiobook) return res.status(404).send('Book not found with id ' + req.params.id)

      var remainingPath = req.params['0']
      var fullPath = Path.join(audiobook.fullPath, remainingPath)
      res.sendFile(fullPath)
    })

    // Library Item static file routes
    app.get('/s/item/:id/*', this.authMiddleware.bind(this), (req, res) => {
      var item = this.db.libraryItems.find(ab => ab.id === req.params.id)
      if (!item) return res.status(404).send('Item not found with id ' + req.params.id)

      var remainingPath = req.params['0']
      var fullPath = Path.join(item.path, remainingPath)
      res.sendFile(fullPath)
    })

    // EBook static file routes
    app.get('/ebook/:library/:folder/*', (req, res) => {
      var library = this.db.libraries.find(lib => lib.id === req.params.library)
      if (!library) return res.sendStatus(404)
      var folder = library.folders.find(fol => fol.id === req.params.folder)
      if (!folder) return res.status(404).send('Folder not found')

      var remainingPath = req.params['0']
      var fullPath = Path.join(folder.fullPath, remainingPath)
      res.sendFile(fullPath)
    })

    // Client dynamic routes
    app.get('/item/:id', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/item/:id/edit', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/library/:library', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/library/:library/search', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/library/:library/bookshelf/:id?', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/library/:library/authors', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/library/:library/series/:id?', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/config/users/:id', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))
    app.get('/collection/:id', (req, res) => res.sendFile(Path.join(distPath, 'index.html')))

    app.post('/login', this.getLoginRateLimiter(), (req, res) => this.auth.login(req, res))
    app.post('/upload', this.authMiddleware.bind(this), this.handleUpload.bind(this))
    app.post('/logout', this.authMiddleware.bind(this), this.logout.bind(this))
    app.get('/ping', (req, res) => {
      Logger.info('Recieved ping')
      res.json({ success: true })
    })

    this.server.listen(this.Port, this.Host, () => {
      Logger.info(`Listening on http://${this.Host}:${this.Port}`)
    })

    this.io = new SocketIO.Server(this.server, {
      cors: {
        origin: '*',
        methods: ["GET", "POST"]
      }
    })
    this.io.on('connection', (socket) => {
      this.clients[socket.id] = {
        id: socket.id,
        socket,
        connected_at: Date.now()
      }
      socket.sheepClient = this.clients[socket.id]

      Logger.info('[Server] Socket Connected', socket.id)

      socket.on('auth', (token) => this.authenticateSocket(socket, token))

      // TODO: Most of these web socket listeners will be moved to API routes instead
      //         with the goal of the web socket connection being a nice-to-have not need-to-have

      // Scanning
      socket.on('scan', this.scan.bind(this))
      socket.on('cancel_scan', this.cancelScan.bind(this))
      socket.on('scan_item', (libraryItemId) => this.scanLibraryItem(socket, libraryItemId))
      socket.on('save_metadata', (libraryItemId) => this.saveMetadata(socket, libraryItemId))

      // Streaming (only still used in the mobile app)
      // socket.on('open_stream', (audiobookId) => this.streamManager.openStreamSocketRequest(socket, audiobookId))
      // socket.on('close_stream', () => this.streamManager.closeStreamRequest(socket))
      // socket.on('stream_sync', (syncData) => this.streamManager.streamSync(socket, syncData))

      // Used to sync when playing local book on mobile, will be moved to API route
      socket.on('progress_update', (payload) => this.audiobookProgressUpdate(socket, payload))

      // Downloading
      socket.on('download', (payload) => this.downloadManager.downloadSocketRequest(socket, payload))
      socket.on('remove_download', (downloadId) => this.downloadManager.removeSocketRequest(socket, downloadId))

      // Logs
      socket.on('set_log_listener', (level) => Logger.addSocketListener(socket, level))
      socket.on('fetch_daily_logs', () => this.logManager.socketRequestDailyLogs(socket))

      // Backups
      socket.on('create_backup', () => this.backupManager.requestCreateBackup(socket))
      socket.on('apply_backup', (id) => this.backupManager.requestApplyBackup(socket, id))

      // Bookmarks
      socket.on('create_bookmark', (payload) => this.createBookmark(socket, payload))
      socket.on('update_bookmark', (payload) => this.updateBookmark(socket, payload))
      socket.on('delete_bookmark', (payload) => this.deleteBookmark(socket, payload))

      socket.on('disconnect', () => {
        Logger.removeSocketListener(socket.id)

        var _client = this.clients[socket.id]
        if (!_client) {
          Logger.warn('[Server] Socket disconnect, no client ' + socket.id)
        } else if (!_client.user) {
          Logger.info('[Server] Unauth socket disconnected ' + socket.id)
          delete this.clients[socket.id]
        } else {
          Logger.debug('[Server] User Offline ' + _client.user.username)
          this.io.emit('user_offline', _client.user.toJSONForPublic([]))

          const disconnectTime = Date.now() - _client.connected_at
          Logger.info(`[Server] Socket ${socket.id} disconnected from client "${_client.user.username}" after ${disconnectTime}ms`)
          delete this.clients[socket.id]
        }
      })
    })
  }

  async filesChanged(fileUpdates) {
    Logger.info('[Server]', fileUpdates.length, 'Files Changed')
    await this.scanner.scanFilesChanged(fileUpdates)
  }

  async scan(libraryId, options = {}) {
    Logger.info('[Server] Starting Scan')
    await this.scanner.scan(libraryId, options)
    // await this.scanner.scan(libraryId)
    Logger.info('[Server] Scan complete')
  }

  async scanLibraryItem(socket, libraryItemId) {
    var result = await this.scanner.scanLibraryItemById(libraryItemId)
    var scanResultName = ''
    for (const key in ScanResult) {
      if (ScanResult[key] === result) {
        scanResultName = key
      }
    }
    socket.emit('item_scan_complete', scanResultName)
  }

  cancelScan(id) {
    Logger.debug('[Server] Cancel scan', id)
    this.scanner.setCancelLibraryScan(id)
  }

  // Generates an NFO metadata file, if no audiobookId is passed then all audiobooks are done
  async saveMetadata(socket, audiobookId = null) {
    Logger.info('[Server] Starting save metadata files')
    var response = await this.scanner.saveMetadata(audiobookId)
    Logger.info(`[Server] Finished saving metadata files Successful: ${response.success}, Failed: ${response.failed}`)
    socket.emit('save_metadata_complete', response)
  }

  // Remove unused /metadata/books/{id} folders
  async purgeMetadata() {
    var booksMetadata = Path.join(global.MetadataPath, 'books')
    var booksMetadataExists = await fs.pathExists(booksMetadata)
    if (!booksMetadataExists) return
    var foldersInBooksMetadata = await fs.readdir(booksMetadata)

    var purged = 0
    await Promise.all(foldersInBooksMetadata.map(async foldername => {
      var hasMatchingAudiobook = this.db.audiobooks.find(ab => ab.id === foldername)
      if (!hasMatchingAudiobook) {
        var folderPath = Path.join(booksMetadata, foldername)
        Logger.debug(`[Server] Purging unused metadata ${folderPath}`)

        await fs.remove(folderPath).then(() => {
          purged++
        }).catch((err) => {
          Logger.error(`[Server] Failed to delete folder path ${folderPath}`, err)
        })
      }
    }))
    if (purged > 0) {
      Logger.info(`[Server] Purged ${purged} unused audiobook metadata`)
    }
    return purged
  }

  // Check user audiobook data has matching audiobook
  async checkUserAudiobookData() {
    for (let i = 0; i < this.db.users.length; i++) {
      var _user = this.db.users[i]
      if (_user.audiobooks) {
        // Find user audiobook data that has no matching audiobook
        var audiobookIdsToRemove = Object.keys(_user.audiobooks).filter(aid => {
          return !this.db.audiobooks.find(ab => ab.id === aid)
        })
        if (audiobookIdsToRemove.length) {
          Logger.debug(`[Server] Found ${audiobookIdsToRemove.length} audiobook data to remove from user ${_user.username}`)
          for (let y = 0; y < audiobookIdsToRemove.length; y++) {
            _user.deleteAudiobookData(audiobookIdsToRemove[y])
          }
          await this.db.updateEntity('user', _user)
        }
      }
    }
  }

  async handleUpload(req, res) {
    if (!req.user.canUpload) {
      Logger.warn('User attempted to upload without permission', req.user)
      return res.sendStatus(403)
    }
    var files = Object.values(req.files)
    var title = req.body.title
    var author = req.body.author
    var series = req.body.series
    var libraryId = req.body.library
    var folderId = req.body.folder

    var library = this.db.libraries.find(lib => lib.id === libraryId)
    if (!library) {
      return res.status(500).send(`Library not found with id ${libraryId}`)
    }
    var folder = library.folders.find(fold => fold.id === folderId)
    if (!folder) {
      return res.status(500).send(`Folder not found with id ${folderId} in library ${library.name}`)
    }

    if (!files.length || !title) {
      return res.status(500).send(`Invalid post data`)
    }

    // For setting permissions recursively
    var firstDirPath = Path.join(folder.fullPath, author)

    var outputDirectory = ''
    if (series && author) {
      outputDirectory = Path.join(folder.fullPath, author, series, title)
    } else if (author) {
      outputDirectory = Path.join(folder.fullPath, author, title)
    } else {
      outputDirectory = Path.join(folder.fullPath, title)
    }

    var exists = await fs.pathExists(outputDirectory)
    if (exists) {
      Logger.error(`[Server] Upload directory "${outputDirectory}" already exists`)
      return res.status(500).send(`Directory "${outputDirectory}" already exists`)
    }

    await fs.ensureDir(outputDirectory)

    Logger.info(`Uploading ${files.length} files to`, outputDirectory)

    for (let i = 0; i < files.length; i++) {
      var file = files[i]

      var path = Path.join(outputDirectory, file.name)
      await file.mv(path).then(() => {
        return true
      }).catch((error) => {
        Logger.error('Failed to move file', path, error)
        return false
      })
    }

    await filePerms.setDefault(firstDirPath)

    res.sendStatus(200)
  }

  // First time login rate limit is hit
  loginLimitReached(req, res, options) {
    Logger.error(`[Server] Login rate limit (${options.max}) was hit for ip ${req.ip}`)
    options.message = 'Too many attempts. Login temporarily locked.'
  }

  getLoginRateLimiter() {
    return rateLimit({
      windowMs: this.db.serverSettings.rateLimitLoginWindow, // 5 minutes
      max: this.db.serverSettings.rateLimitLoginRequests,
      skipSuccessfulRequests: true,
      onLimitReached: this.loginLimitReached
    })
  }

  logout(req, res) {
    var { socketId } = req.body
    Logger.info(`[Server] User ${req.user ? req.user.username : 'Unknown'} is logging out with socket ${socketId}`)

    // Strip user and client from client and client socket
    if (socketId && this.clients[socketId]) {
      var client = this.clients[socketId]
      var clientSocket = client.socket
      Logger.debug(`[Server] Found user client ${clientSocket.id}, Has user: ${!!client.user}, Socket has client: ${!!clientSocket.sheepClient}`)

      if (client.user) {
        Logger.debug('[Server] User Offline ' + client.user.username)
        this.io.emit('user_offline', client.user.toJSONForPublic(null))
      }

      delete this.clients[socketId].user
      delete this.clients[socketId].stream
      if (clientSocket && clientSocket.sheepClient) delete this.clients[socketId].socket.sheepClient
    } else if (socketId) {
      Logger.warn(`[Server] No client for socket ${socketId}`)
    }

    res.sendStatus(200)
  }

  async audiobookProgressUpdate(socket, progressPayload) {
    var client = socket.sheepClient
    if (!client || !client.user) {
      Logger.error('[Server] audiobookProgressUpdate invalid socket client')
      return
    }
    var audiobookProgress = client.user.updateAudiobookData(progressPayload.audiobookId, progressPayload)
    if (audiobookProgress) {
      await this.db.updateEntity('user', client.user)
      this.clientEmitter(client.user.id, 'current_user_audiobook_update', {
        id: progressPayload.audiobookId,
        data: audiobookProgress || null
      })
    }
  }

  async createBookmark(socket, payload) {
    var client = socket.sheepClient
    if (!client || !client.user) {
      Logger.error('[Server] createBookmark invalid socket client')
      return
    }
    var userAudiobook = client.user.createBookmark(payload)
    if (!userAudiobook || userAudiobook.error) {
      var failMessage = (userAudiobook ? userAudiobook.error : null) || 'Unknown Error'
      socket.emit('show_error_toast', `Failed to create Bookmark: ${failMessage}`)
      return
    }

    await this.db.updateEntity('user', client.user)

    socket.emit('show_success_toast', `${secondsToTimestamp(payload.time)} Bookmarked`)

    this.clientEmitter(client.user.id, 'current_user_audiobook_update', {
      id: userAudiobook.audiobookId,
      data: userAudiobook || null
    })
  }

  async updateBookmark(socket, payload) {
    var client = socket.sheepClient
    if (!client || !client.user) {
      Logger.error('[Server] updateBookmark invalid socket client')
      return
    }
    var userAudiobook = client.user.updateBookmark(payload)
    if (!userAudiobook || userAudiobook.error) {
      var failMessage = (userAudiobook ? userAudiobook.error : null) || 'Unknown Error'
      socket.emit('show_error_toast', `Failed to update Bookmark: ${failMessage}`)
      return
    }

    await this.db.updateEntity('user', client.user)

    socket.emit('show_success_toast', `Bookmark ${secondsToTimestamp(payload.time)} Updated`)

    this.clientEmitter(client.user.id, 'current_user_audiobook_update', {
      id: userAudiobook.audiobookId,
      data: userAudiobook || null
    })
  }

  async deleteBookmark(socket, payload) {
    var client = socket.sheepClient
    if (!client || !client.user) {
      Logger.error('[Server] deleteBookmark invalid socket client')
      return
    }
    var userAudiobook = client.user.deleteBookmark(payload)
    if (!userAudiobook || userAudiobook.error) {
      var failMessage = (userAudiobook ? userAudiobook.error : null) || 'Unknown Error'
      socket.emit('show_error_toast', `Failed to delete Bookmark: ${failMessage}`)
      return
    }

    await this.db.updateEntity('user', client.user)

    socket.emit('show_success_toast', `Bookmark ${secondsToTimestamp(payload.time)} Removed`)

    this.clientEmitter(client.user.id, 'current_user_audiobook_update', {
      id: userAudiobook.audiobookId,
      data: userAudiobook || null
    })
  }

  async authenticateSocket(socket, token) {
    var user = await this.auth.authenticateUser(token)
    if (!user) {
      Logger.error('Cannot validate socket - invalid token')
      return socket.emit('invalid_token')
    }
    var client = this.clients[socket.id]

    if (client.user !== undefined) {
      Logger.debug(`[Server] Authenticating socket client already has user`, client.user)
    }

    client.user = user

    if (!client.user.toJSONForBrowser) {
      Logger.error('Invalid user...', client.user)
      return
    }

    // Check if user has stream open
    if (client.user.stream) {
      Logger.info('User has stream open already', client.user.stream)
      // client.stream = this.streamManager.getStream(client.user.stream)
      // if (!client.stream) {
      //   Logger.error('Invalid user stream id', client.user.stream)
      //   this.streamManager.removeOrphanStreamFiles(client.user.stream)
      //   await this.db.updateUserStream(client.user.id, null)
      // }
    }

    Logger.debug(`[Server] User Online ${client.user.username}`)
    this.io.emit('user_online', client.user.toJSONForPublic([]))

    user.lastSeen = Date.now()
    await this.db.updateEntity('user', user)

    const initialPayload = {
      serverSettings: this.db.serverSettings.toJSON(),
      audiobookPath: global.AudiobookPath,
      metadataPath: global.MetadataPath,
      configPath: global.ConfigPath,
      user: client.user.toJSONForBrowser(),
      stream: client.stream || null,
      librariesScanning: this.scanner.librariesScanning,
      backups: (this.backupManager.backups || []).map(b => b.toJSON())
    }
    if (user.type === 'root') {
      initialPayload.usersOnline = this.usersOnline
    }
    client.socket.emit('init', initialPayload)

    // Setup log listener for root user
    if (user.type === 'root') {
      Logger.addSocketListener(socket, this.db.serverSettings.logLevel || 0)
    }
  }

  async stop() {
    await this.watcher.close()
    Logger.info('Watcher Closed')

    return new Promise((resolve) => {
      this.server.close((err) => {
        if (err) {
          Logger.error('Failed to close server', err)
        } else {
          Logger.info('Server successfully closed')
        }
        resolve()
      })
    })
  }
}
module.exports = Server