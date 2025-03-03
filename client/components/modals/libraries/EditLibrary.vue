<template>
  <div class="w-full h-full px-4 py-2 mb-4">
    <div v-show="showDirectoryPicker" class="flex items-center py-1 mb-2">
      <span class="material-icons text-3xl cursor-pointer hover:text-gray-300" @click="backArrowPress">arrow_back</span>
      <p class="px-4 text-xl">{{ title }}</p>
    </div>

    <div v-if="!showDirectoryPicker" class="w-full h-full py-4">
      <div class="flex flex-wrap md:flex-nowrap -mx-1">
        <div class="w-full md:flex-grow px-1 py-1 md:py-0">
          <ui-text-input-with-label v-model="name" label="Library Name" />
        </div>
        <div class="w-1/2 md:w-72 px-1 py-1 md:py-0">
          <ui-media-category-picker v-model="mediaCategory" />
        </div>
        <div class="w-1/2 md:w-72 px-1 py-1 md:py-0">
          <ui-dropdown v-model="provider" :items="providers" label="Metadata Provider" small />
        </div>
      </div>

      <div class="w-full py-4">
        <p class="px-1 text-sm font-semibold">Folders</p>
        <div v-for="(folder, index) in folders" :key="index" class="w-full flex items-center py-1 px-2">
          <span class="material-icons bg-opacity-50 mr-2 text-yellow-200" style="font-size: 1.2rem">folder</span>
          <ui-editable-text v-model="folder.fullPath" readonly type="text" class="w-full" />
          <span v-show="folders.length > 1" class="material-icons ml-2 cursor-pointer hover:text-error" @click="removeFolder(folder)">close</span>
        </div>
        <!-- <p v-if="!folders.length" class="text-sm text-gray-300 px-1 py-2">No folders</p> -->

        <div class="flex py-1 px-2 items-center w-full">
          <span class="material-icons bg-opacity-50 mr-2 text-yellow-200" style="font-size: 1.2rem">folder</span>
          <ui-editable-text v-model="newFolderPath" placeholder="New folder path" type="text" class="w-full" />
        </div>

        <ui-btn class="w-full mt-2" color="primary" @click="showDirectoryPicker = true">Browse for Folder</ui-btn>
      </div>
      <div class="absolute bottom-0 left-0 w-full py-4 px-4">
        <div class="flex items-center">
          <div class="flex-grow" />
          <ui-btn v-show="!disableSubmit" color="success" :disabled="disableSubmit" @click="submit">{{ library ? 'Update Library' : 'Create Library' }}</ui-btn>
        </div>
      </div>
    </div>

    <modals-libraries-folder-chooser v-else :paths="folderPaths" @select="selectFolder" />

    <div v-if="!showDirectoryPicker">
      <div class="flex items-center pt-2">
        <ui-toggle-switch v-if="!globalWatcherDisabled" v-model="disableWatcher" />
        <ui-toggle-switch v-else disabled :value="false" />
        <p class="pl-4 text-lg">Disable folder watcher for library</p>
      </div>
      <p v-if="globalWatcherDisabled" class="text-xs text-warning">*Watcher is disabled globally in server settings</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    library: {
      type: Object,
      default: () => null
    },
    processing: Boolean
  },
  data() {
    return {
      name: '',
      provider: 'google',
      mediaCategory: '',
      folders: [],
      showDirectoryPicker: false,
      disableWatcher: false,
      newFolderPath: ''
    }
  },
  computed: {
    title() {
      if (this.showDirectoryPicker) return 'Choose a Folder'
      return ''
    },
    folderPaths() {
      return this.folders.map((f) => f.fullPath)
    },
    disableSubmit() {
      if (!this.library) {
        return false
      }
      var newfolderpaths = this.folderPaths.join(',')
      var origfolderpaths = this.library.folders.map((f) => f.fullPath).join(',')

      return newfolderpaths === origfolderpaths && this.name === this.library.name && this.provider === this.library.provider && this.disableWatcher === this.library.disableWatcher && this.mediaCategory === this.library.mediaCategory && !this.newFolderPath
    },
    providers() {
      return this.$store.state.scanners.providers
    },
    globalWatcherDisabled() {
      return this.$store.getters['getServerSetting']('scannerDisableWatcher')
    }
  },
  methods: {
    removeFolder(folder) {
      this.folders = this.folders.filter((f) => f.fullPath !== folder.fullPath)
    },
    backArrowPress() {
      if (this.showDirectoryPicker) {
        this.showDirectoryPicker = false
      }
    },
    init() {
      this.name = this.library ? this.library.name : ''
      this.provider = this.library ? this.library.provider : 'google'
      this.folders = this.library ? this.library.folders.map((p) => ({ ...p })) : []
      this.disableWatcher = this.library ? !!this.library.disableWatcher : false
      this.mediaCategory = this.library ? this.library.mediaCategory : 'default'
      this.showDirectoryPicker = false
    },
    selectFolder(fullPath) {
      this.folders.push({ fullPath })
      this.showDirectoryPicker = false
    },
    submit() {
      if (this.newFolderPath) {
        this.folders.push({ fullPath: this.newFolderPath })
      }

      if (this.library) {
        this.updateLibrary()
      } else {
        this.createLibrary()
      }
    },
    updateLibrary() {
      if (!this.name) {
        this.$toast.error('Library must have a name')
        return
      }
      if (!this.folders.length) {
        this.$toast.error('Library must have at least 1 path')
        return
      }
      var newLibraryPayload = {
        name: this.name,
        provider: this.provider,
        folders: this.folders,
        mediaCategory: this.mediaCategory,
        icon: this.mediaCategory,
        disableWatcher: this.disableWatcher
      }

      this.$emit('update:processing', true)
      this.$axios
        .$patch(`/api/libraries/${this.library.id}`, newLibraryPayload)
        .then((res) => {
          this.$emit('update:processing', false)
          this.$emit('close')
          this.$toast.success(`Library "${res.name}" updated successfully`)
        })
        .catch((error) => {
          console.error(error)
          if (error.response && error.response.data) {
            this.$toast.error(error.response.data)
          } else {
            this.$toast.error('Failed to update library')
          }
          this.$emit('update:processing', false)
        })
    },
    createLibrary() {
      if (!this.name) {
        this.$toast.error('Library must have a name')
        return
      }
      if (!this.folders.length) {
        this.$toast.error('Library must have at least 1 path')
        return
      }
      var newLibraryPayload = {
        name: this.name,
        provider: this.provider,
        folders: this.folders,
        mediaCategory: this.mediaCategory,
        icon: this.mediaCategory,
        disableWatcher: this.disableWatcher
      }

      this.$emit('update:processing', true)
      this.$axios
        .$post('/api/libraries', newLibraryPayload)
        .then((res) => {
          this.$emit('update:processing', false)
          this.$emit('close')
          this.$toast.success(`Library "${res.name}" created successfully`)
        })
        .catch((error) => {
          console.error(error)
          if (error.response && error.response.data) {
            this.$toast.error(error.response.data)
          } else {
            this.$toast.error('Failed to create library')
          }
          this.$emit('update:processing', false)
        })
    }
  },
  mounted() {
    this.init()
  }
}
</script>
