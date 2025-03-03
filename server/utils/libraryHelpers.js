const { sort, createNewSortInstance } = require('fast-sort')
const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

module.exports = {
  decode(text) {
    return Buffer.from(decodeURIComponent(text), 'base64').toString()
  },

  getFilteredLibraryItems(libraryItems, filterBy, user) {
    var filtered = libraryItems

    var searchGroups = ['genres', 'tags', 'series', 'authors', 'progress', 'narrators', 'languages']
    var group = searchGroups.find(_group => filterBy.startsWith(_group + '.'))
    if (group) {
      var filterVal = filterBy.replace(`${group}.`, '')
      var filter = this.decode(filterVal)
      if (group === 'genres') filtered = filtered.filter(li => li.media.metadata && li.media.metadata.genres.includes(filter))
      else if (group === 'tags') filtered = filtered.filter(li => li.media.tags.includes(filter))
      else if (group === 'series') {
        if (filter === 'No Series') filtered = filtered.filter(li => li.media.metadata && !li.media.metadata.series.length)
        else {
          filtered = filtered.filter(li => li.media.metadata && li.media.metadata.hasSeries(filter))
        }
      }
      else if (group === 'authors') filtered = filtered.filter(li => li.media.metadata && li.media.metadata.hasAuthor(filter))
      else if (group === 'narrators') filtered = filtered.filter(li => li.media.metadata && li.media.metadata.hasNarrator(filter))
      else if (group === 'progress') {
        filtered = filtered.filter(li => {
          var userAudiobook = user.getLibraryItemProgress(li.id)
          var isRead = userAudiobook && userAudiobook.isRead
          if (filter === 'Read' && isRead) return true
          if (filter === 'Unread' && !isRead) return true
          if (filter === 'In Progress' && (userAudiobook && !userAudiobook.isRead && userAudiobook.progress > 0)) return true
          return false
        })
      } else if (group === 'languages') {
        filtered = filtered.filter(li => li.media.metadata && li.media.metadata.language === filter)
      }
    } else if (filterBy === 'issues') {
      filtered = filtered.filter(ab => {
        // TODO: Update filter for issues
        return ab.isMissing
        // return ab.numMissingParts || ab.numInvalidParts || ab.isMissing || ab.isInvalid
      })
    }

    return filtered
  },

  getFiltered(audiobooks, filterBy, user) {
    var filtered = audiobooks

    var searchGroups = ['genres', 'tags', 'series', 'authors', 'progress', 'narrators', 'languages']
    var group = searchGroups.find(_group => filterBy.startsWith(_group + '.'))
    if (group) {
      var filterVal = filterBy.replace(`${group}.`, '')
      var filter = this.decode(filterVal)
      if (group === 'genres') filtered = filtered.filter(ab => ab.book && ab.book.genres.includes(filter))
      else if (group === 'tags') filtered = filtered.filter(ab => ab.tags.includes(filter))
      else if (group === 'series') {
        if (filter === 'No Series') filtered = filtered.filter(ab => ab.book && !ab.book.series)
        else filtered = filtered.filter(ab => ab.book && ab.book.series === filter)
      }
      else if (group === 'authors') filtered = filtered.filter(ab => ab.book && ab.book.authorFL && ab.book.authorFL.split(', ').includes(filter))
      else if (group === 'narrators') filtered = filtered.filter(ab => ab.book && ab.book.narratorFL && ab.book.narratorFL.split(', ').includes(filter))
      else if (group === 'progress') {
        filtered = filtered.filter(ab => {
          var userAudiobook = user.getLibraryItemProgress(ab.id)
          var isRead = userAudiobook && userAudiobook.isRead
          if (filter === 'Read' && isRead) return true
          if (filter === 'Unread' && !isRead) return true
          if (filter === 'In Progress' && (userAudiobook && !userAudiobook.isRead && userAudiobook.progress > 0)) return true
          return false
        })
      } else if (group === 'languages') {
        filtered = filtered.filter(ab => ab.book && ab.book.language === filter)
      }
    } else if (filterBy === 'issues') {
      filtered = filtered.filter(ab => {
        return ab.numMissingParts || ab.numInvalidParts || ab.isMissing || ab.isInvalid
      })
    }

    return filtered
  },

  getDistinctFilterDataNew(libraryItems) {
    var data = {
      authors: [],
      genres: [],
      tags: [],
      series: [],
      narrators: [],
      languages: []
    }
    libraryItems.forEach((li) => {
      var mediaMetadata = li.media.metadata
      if (mediaMetadata.authors.length) {
        mediaMetadata.authors.forEach((author) => {
          if (author && !data.authors.find(au => au.id === author.id)) data.authors.push({ id: author.id, name: author.name })
        })
      }
      if (mediaMetadata.series.length) {
        mediaMetadata.series.forEach((series) => {
          if (series && !data.series.find(se => se.id === series.id)) data.series.push({ id: series.id, name: series.name })
        })
      }
      if (mediaMetadata.genres.length) {
        mediaMetadata.genres.forEach((genre) => {
          if (genre && !data.genres.includes(genre)) data.genres.push(genre)
        })
      }
      if (li.media.tags.length) {
        li.media.tags.forEach((tag) => {
          if (tag && !data.tags.includes(tag)) data.tags.push(tag)
        })
      }
      if (mediaMetadata.narrators.length) {
        mediaMetadata.narrators.forEach((narrator) => {
          if (narrator && !data.narrators.includes(narrator)) data.narrators.push(narrator)
        })
      }
      if (mediaMetadata.language && !data.languages.includes(mediaMetadata.language)) data.languages.push(mediaMetadata.language)
    })
    data.authors = naturalSort(data.authors).asc()
    data.genres = naturalSort(data.genres).asc()
    data.tags = naturalSort(data.tags).asc()
    data.series = naturalSort(data.series).asc()
    data.narrators = naturalSort(data.narrators).asc()
    data.languages = naturalSort(data.languages).asc()
    return data
  },

  getSeriesFromBooks(books, minified = false) {
    var _series = {}
    books.forEach((libraryItem) => {
      if (libraryItem.media.metadata.series && libraryItem.media.metadata.series.length) {
        libraryItem.media.metadata.series.forEach((series) => {
          var abJson = minified ? libraryItem.toJSONMinified() : libraryItem.toJSONExpanded()
          abJson.sequence = series.sequence
          if (!_series[series.id]) {
            _series[series.id] = {
              id: series.id,
              name: series.name,
              type: 'series',
              books: [abJson]
            }
          } else {
            _series[series.id].books.push(abJson)
          }
        })
      }
    })
    return Object.values(_series).map((series) => {
      series.books = naturalSort(series.books).asc(li => li.sequence)
      return series
    })
  },

  getSeriesWithProgressFromBooks(user, books) {
    var _series = {}
    books.forEach((audiobook) => {
      if (audiobook.book.series) {
        var bookWithUserAb = { userAudiobook: user.getLibraryItemProgress(audiobook.id), book: audiobook }
        if (!_series[audiobook.book.series]) {
          _series[audiobook.book.series] = {
            id: audiobook.book.series,
            name: audiobook.book.series,
            type: 'series',
            books: [bookWithUserAb]
          }
        } else {
          _series[audiobook.book.series].books.push(bookWithUserAb)
        }
      }
    })
    return Object.values(_series).map((series) => {
      series.books = naturalSort(series.books).asc(ab => ab.book.book.volumeNumber)
      return series
    }).filter((series) => series.books.some((book) => book.userAudiobook && book.userAudiobook.isRead))
  },

  sortSeriesBooks(books, seriesId, minified = false) {
    return naturalSort(books).asc(li => {
      if (!li.media.metadata.series) return null
      var series = li.media.metadata.series.find(se => se.id === seriesId)
      if (!series) return null
      return series.sequence
    }).map(li => {
      if (minified) return li.toJSONMinified()
      return li.toJSONExpanded()
    })
  },

  getBooksWithUserAudiobook(user, books) {
    return books.map(book => {
      return {
        userAudiobook: user.getLibraryItemProgress(book.id),
        book
      }
    }).filter(b => !!b.userAudiobook)
  },

  getBooksMostRecentlyRead(booksWithUserAb, limit, minified = false) {
    var booksWithProgress = booksWithUserAb.filter((data) => data.userAudiobook && data.userAudiobook.progress > 0 && !data.userAudiobook.isRead)
    booksWithProgress.sort((a, b) => {
      return b.userAudiobook.lastUpdate - a.userAudiobook.lastUpdate
    })
    return booksWithProgress.map(b => minified ? b.book.toJSONMinified() : b.book.toJSONExpanded()).slice(0, limit)
  },

  getBooksNextInSeries(seriesWithUserAb, limit, minified = false) {
    var incompleteSeires = seriesWithUserAb.filter((series) => series.books.some((book) => !book.userAudiobook || (!book.userAudiobook.isRead && book.userAudiobook.progress == 0)))
    var booksNextInSeries = []
    incompleteSeires.forEach((series) => {
      var dateLastRead = series.books.filter((data) => data.userAudiobook && data.userAudiobook.isRead).sort((a, b) => { return b.userAudiobook.finishedAt - a.userAudiobook.finishedAt })[0].userAudiobook.finishedAt
      var nextUnreadBook = series.books.filter((data) => !data.userAudiobook || (!data.userAudiobook.isRead && data.userAudiobook.progress == 0))[0]
      nextUnreadBook.DateLastReadSeries = dateLastRead
      booksNextInSeries.push(nextUnreadBook)
    })
    return booksNextInSeries.sort((a, b) => { return b.DateLastReadSeries - a.DateLastReadSeries }).map(b => minified ? b.book.toJSONMinified() : b.book.toJSONExpanded()).slice(0, limit)
  },

  getBooksMostRecentlyAdded(books, limit, minified = false) {
    var booksSortedByAddedAt = sort(books).desc(book => book.addedAt)
    return booksSortedByAddedAt.map(b => minified ? b.toJSONMinified() : b.toJSONExpanded()).slice(0, limit)
  },

  getBooksMostRecentlyFinished(booksWithUserAb, limit, minified = false) {
    var booksRead = booksWithUserAb.filter((data) => data.userAudiobook && data.userAudiobook.isRead)
    booksRead.sort((a, b) => {
      return b.userAudiobook.finishedAt - a.userAudiobook.finishedAt
    })
    return booksRead.map(b => minified ? b.book.toJSONMinified() : b.book.toJSONExpanded()).slice(0, limit)
  },

  getSeriesMostRecentlyAdded(series, limit) {
    var seriesSortedByAddedAt = sort(series).desc(_series => {
      var booksSortedByMostRecent = sort(_series.books).desc(b => b.addedAt)
      return booksSortedByMostRecent[0].addedAt
    })
    return seriesSortedByAddedAt.slice(0, limit)
  },

  getGenresWithCount(libraryItems) {
    var genresMap = {}
    libraryItems.forEach((li) => {
      var genres = li.media.metadata.genres || []
      genres.forEach((genre) => {
        if (genresMap[genre]) genresMap[genre].count++
        else
          genresMap[genre] = {
            genre,
            count: 1
          }
      })
    })
    return Object.values(genresMap).sort((a, b) => b.count - a.count)
  },

  getAuthorsWithCount(libraryItems) {
    var authorsMap = {}
    libraryItems.forEach((li) => {
      var authors = li.media.metadata.authors || []
      authors.forEach((author) => {
        if (authorsMap[author.id]) authorsMap[author.id].count++
        else
          authorsMap[author.id] = {
            author: author.name,
            count: 1
          }
      })
    })
    return Object.values(authorsMap).sort((a, b) => b.count - a.count)
  },

  getItemDurationStats(libraryItems) {
    var sorted = sort(libraryItems).desc(li => li.media.duration)
    var top10 = sorted.slice(0, 10).map(li => ({ title: li.media.metadata.title, duration: li.media.duration })).filter(i => i.duration > 0)
    var totalDuration = 0
    var numAudioTracks = 0
    libraryItems.forEach((li) => {
      totalDuration += li.media.duration
      numAudioTracks += (li.media.tracks || []).length
    })
    return {
      totalDuration,
      numAudioTracks,
      longestItems: top10
    }
  },

  getLibraryItemsTotalSize(libraryItems) {
    var totalSize = 0
    libraryItems.forEach((li) => {
      totalSize += li.media.size
    })
    return totalSize
  },

  getNumIssues(libraryItems) {
    // TODO: Implement issues
    return libraryItems.filter(li => li.isMissing).length
    // return books.filter(ab => {
    //   return ab.numMissingParts || ab.numInvalidParts || ab.isMissing || ab.isInvalid
    // }).length
  }
}