
import Vue from 'vue'

export const state = () => ({
  user: null,
  settings: {
    orderBy: 'book.title',
    orderDesc: false,
    filterBy: 'all',
    playbackRate: 1,
    bookshelfCoverSize: 120,
    collapseSeries: false
  },
  settingsListeners: [],
  collections: [],
  collectionsLoaded: false,
  collectionsListeners: []
})

export const getters = {
  getIsRoot: (state) => state.user && state.user.type === 'root',
  getToken: (state) => {
    return state.user ? state.user.token : null
  },
  getUserAudiobook: (state) => (audiobookId) => {
    return state.user && state.user.audiobooks ? state.user.audiobooks[audiobookId] || null : null
  },
  getUserSetting: (state) => (key) => {
    return state.settings ? state.settings[key] : null
  },
  getUserCanUpdate: (state) => {
    return state.user && state.user.permissions ? !!state.user.permissions.update : false
  },
  getUserCanDelete: (state) => {
    return state.user && state.user.permissions ? !!state.user.permissions.delete : false
  },
  getUserCanDownload: (state) => {
    return state.user && state.user.permissions ? !!state.user.permissions.download : false
  },
  getUserCanUpload: (state) => {
    return state.user && state.user.permissions ? !!state.user.permissions.upload : false
  },
  getUserCanAccessAllLibraries: (state) => {
    return state.user && state.user.permissions ? !!state.user.permissions.accessAllLibraries : false
  },
  getLibrariesAccessible: (state, getters) => {
    if (!state.user) return []
    if (getters.getUserCanAccessAllLibraries) return []
    return state.user.librariesAccessible || []
  },
  getCanAccessLibrary: (state, getters) => (libraryId) => {
    if (!state.user) return false
    if (getters.getUserCanAccessAllLibraries) return true
    return getters.getLibrariesAccessible.includes(libraryId)
  },
  getCollection: state => id => {
    return state.collections.find(c => c.id === id)
  }
}

export const actions = {
  updateUserSettings({ commit }, payload) {
    var updatePayload = {
      ...payload
    }
    // Immediately update
    commit('setSettings', updatePayload)
    return this.$axios.$patch('/api/me/settings', updatePayload).then((result) => {
      if (result.success) {
        commit('setSettings', result.settings)
        return true
      } else {
        return false
      }
    }).catch((error) => {
      console.error('Failed to update settings', error)
      return false
    })
  },
  loadUserCollections({ state, commit }) {
    if (state.collectionsLoaded) {
      console.log('Collections already loaded')
      return state.collections
    }

    return this.$axios.$get('/api/collections').then((collections) => {
      commit('setCollections', collections)
      return collections
    }).catch((error) => {
      console.error('Failed to get collections', error)
      return []
    })
  }
}

export const mutations = {
  setUser(state, user) {
    state.user = user

    if (user) {
      if (user.token) localStorage.setItem('token', user.token)
    } else {
      localStorage.removeItem('token')
    }
  },
  updateUserAudiobook(state, { id, data }) {
    if (!state.user) return
    if (!state.user.audiobooks) {
      Vue.set(state.user, 'audiobooks', {})
    }
    Vue.set(state.user.audiobooks, id, data)
  },
  setSettings(state, settings) {
    if (!settings) return

    var hasChanges = false
    for (const key in settings) {
      if (state.settings[key] !== settings[key]) {
        hasChanges = true
        state.settings[key] = settings[key]
      }
    }
    if (hasChanges) {
      state.settingsListeners.forEach((listener) => {
        listener.meth(state.settings)
      })
    }
  },
  addSettingsListener(state, listener) {
    var index = state.settingsListeners.findIndex(l => l.id === listener.id)
    if (index >= 0) state.settingsListeners.splice(index, 1, listener)
    else state.settingsListeners.push(listener)
  },
  removeSettingsListener(state, listenerId) {
    state.settingsListeners = state.settingsListeners.filter(l => l.id !== listenerId)
  },
  setCollections(state, collections) {
    state.collectionsLoaded = true
    state.collections = collections
    state.collectionsListeners.forEach((listener) => listener.meth())
  },
  addUpdateCollection(state, collection) {
    var index = state.collections.findIndex(c => c.id === collection.id)
    if (index >= 0) {
      state.collections.splice(index, 1, collection)
    } else {
      state.collections.push(collection)
    }
    state.collectionsListeners.forEach((listener) => listener.meth())
  },
  removeCollection(state, collection) {
    state.collections = state.collections.filter(c => c.id !== collection.id)
    state.collectionsListeners.forEach((listener) => listener.meth())
  },
  addCollectionsListener(state, listener) {
    var index = state.collectionsListeners.findIndex(l => l.id === listener.id)
    if (index >= 0) state.collectionsListeners.splice(index, 1, listener)
    else state.collectionsListeners.push(listener)
  },
  removeCollectionsListener(state, listenerId) {
    state.collectionsListeners = state.collectionsListeners.filter(l => l.id !== listenerId)
  },
}