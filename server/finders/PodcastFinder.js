const Logger = require('../Logger')
const iTunes = require('../providers/iTunes')

class PodcastFinder {
  constructor() {
    this.iTunesApi = new iTunes()
  }

  async search(term, options = {}) {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast with term "${term}"`)
    var results = await this.iTunesApi.searchPodcasts(term, options)
    Logger.debug(`[iTunes] Podcast search for "${term}" returned ${results.length} results`)
    return results
  }
}
module.exports = PodcastFinder