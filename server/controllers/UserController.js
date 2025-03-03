const Logger = require('../Logger')
const User = require('../objects/user/User')

const { getId } = require('../utils/index')

class UserController {
  constructor() { }

  async create(req, res) {
    if (!req.user.isRoot) {
      Logger.warn('Non-root user attempted to create user', req.user)
      return res.sendStatus(403)
    }
    var account = req.body

    var username = account.username
    var usernameExists = this.db.users.find(u => u.username.toLowerCase() === username.toLowerCase())
    if (usernameExists) {
      return res.status(500).send('Username already taken')
    }

    account.id = getId('usr')
    account.pash = await this.auth.hashPass(account.password)
    delete account.password
    account.token = await this.auth.generateAccessToken({ userId: account.id })
    account.createdAt = Date.now()
    var newUser = new User(account)
    var success = await this.db.insertEntity('user', newUser)
    if (success) {
      this.clientEmitter(req.user.id, 'user_added', newUser)
      res.json({
        user: newUser.toJSONForBrowser()
      })
    } else {
      return res.status(500).send('Failed to save new user')
    }
  }

  findAll(req, res) {
    if (!req.user.isRoot) return res.sendStatus(403)
    var users = this.db.users.map(u => this.userJsonWithBookProgressDetails(u))
    res.json(users)
  }

  findOne(req, res) {
    if (!req.user.isRoot) {
      Logger.error('User other than root attempting to get user', req.user)
      return res.sendStatus(403)
    }

    var user = this.db.users.find(u => u.id === req.params.id)
    if (!user) {
      return res.sendStatus(404)
    }

    res.json(this.userJsonWithBookProgressDetails(user))
  }

  async update(req, res) {
    if (!req.user.isRoot) {
      Logger.error('User other than root attempting to update user', req.user)
      return res.sendStatus(403)
    }

    var user = this.db.users.find(u => u.id === req.params.id)
    if (!user) {
      return res.sendStatus(404)
    }

    var account = req.body

    if (account.username !== undefined && account.username !== user.username) {
      var usernameExists = this.db.users.find(u => u.username.toLowerCase() === account.username.toLowerCase())
      if (usernameExists) {
        return res.status(500).send('Username already taken')
      }
    }

    // Updating password
    if (account.password) {
      account.pash = await this.auth.hashPass(account.password)
      delete account.password
    }

    var hasUpdated = user.update(account)
    if (hasUpdated) {
      await this.db.updateEntity('user', user)
    }

    this.clientEmitter(req.user.id, 'user_updated', user.toJSONForBrowser())
    res.json({
      success: true,
      user: user.toJSONForBrowser()
    })
  }

  async delete(req, res) {
    if (!req.user.isRoot) {
      Logger.error('User other than root attempting to delete user', req.user)
      return res.sendStatus(403)
    }
    if (req.params.id === 'root') {
      return res.sendStatus(500)
    }
    if (req.user.id === req.params.id) {
      Logger.error('Attempting to delete themselves...')
      return res.sendStatus(500)
    }
    var user = this.db.users.find(u => u.id === req.params.id)
    if (!user) {
      Logger.error('User not found')
      return res.json({
        error: 'User not found'
      })
    }

    // delete user collections
    var userCollections = this.db.collections.filter(c => c.userId === user.id)
    var collectionsToRemove = userCollections.map(uc => uc.id)
    for (let i = 0; i < collectionsToRemove.length; i++) {
      await this.db.removeEntity('collection', collectionsToRemove[i])
    }

    // Todo: check if user is logged in and cancel streams

    var userJson = user.toJSONForBrowser()
    await this.db.removeEntity('user', user.id)
    this.clientEmitter(req.user.id, 'user_removed', userJson)
    res.json({
      success: true
    })
  }

  // GET: api/users/:id/listening-sessions
  async getListeningSessions(req, res) {
    if (!req.user.isRoot && req.user.id !== req.params.id) {
      return res.sendStatus(403)
    }
    var listeningSessions = await this.getUserListeningSessionsHelper(req.params.id)
    res.json(listeningSessions.slice(0, 10))
  }

  // GET: api/users/:id/listening-stats
  async getListeningStats(req, res) {
    if (!req.user.isRoot && req.user.id !== req.params.id) {
      return res.sendStatus(403)
    }
    var listeningStats = await this.getUserListeningStatsHelpers(req.params.id)
    res.json(listeningStats)
  }
}
module.exports = new UserController()