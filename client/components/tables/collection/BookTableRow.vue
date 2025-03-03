<template>
  <div class="w-full px-2 py-2 overflow-hidden relative" @mouseover="mouseover" @mouseleave="mouseleave" :class="isHovering ? 'bg-white bg-opacity-5' : ''">
    <div v-if="book" class="flex h-20">
      <div class="w-16 max-w-16 h-full">
        <div class="flex h-full items-center justify-center">
          <span class="material-icons drag-handle text-xl">menu</span>
        </div>
      </div>
      <div class="h-full relative" :style="{ width: coverWidth + 'px' }">
        <covers-book-cover :library-item="book" :width="coverWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" />
        <div class="absolute top-0 left-0 bg-black bg-opacity-50 flex items-center justify-center h-full w-full z-10" v-show="isHovering && showPlayBtn">
          <div class="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-40 cursor-pointer" @click="playClick">
            <span class="material-icons">play_arrow</span>
          </div>
        </div>
      </div>
      <div class="w-80 h-full px-2 flex items-center">
        <div>
          <nuxt-link :to="`/item/${book.id}`" class="truncate hover:underline">{{ bookTitle }}</nuxt-link>
          <!-- <nuxt-link :to="`/library/${book.libraryId}/bookshelf?filter=authors.${$encode(bookAuthor)}`" class="truncate block text-gray-400 text-sm hover:underline">{{ bookAuthor }}</nuxt-link> -->
        </div>
      </div>
      <div class="flex-grow flex items-center">
        <p class="font-mono text-sm">{{ bookDuration }}</p>
      </div>

      <!-- <div class="w-12 flex items-center justify-center">
        <span class="material-icons text-lg text-white text-opacity-70 hover:text-opacity-100 cursor-pointer">radio_button_unchecked</span>
      </div> -->
    </div>
    <!-- <div class="absolute top-0 left-0 z-40 bg-red-500 w-full h-full">
      <div class="w-24 h-full absolute top-0 -right-24 transform transition-transform" :class="isHovering ? 'translate-x-0' : '-translate-x-24'">
        <span class="material-icons">edit</span>
      </div>
    </div> -->
    <div class="w-40 absolute top-0 -right-24 h-full transform transition-transform" :class="!isHovering ? 'translate-x-0' : '-translate-x-24'">
      <div class="flex h-full items-center">
        <ui-tooltip :text="isRead ? 'Mark as Not Read' : 'Mark as Read'" direction="top">
          <ui-read-icon-btn :disabled="isProcessingReadUpdate" :is-read="isRead" borderless class="mx-1 mt-0.5" @click="toggleRead" />
        </ui-tooltip>
        <div class="mx-1" :class="isHovering ? '' : 'ml-6'">
          <ui-icon-btn icon="edit" borderless @click="clickEdit" />
        </div>
        <div class="mx-1">
          <ui-icon-btn icon="close" borderless @click="removeClick" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    collectionId: String,
    book: {
      type: Object,
      default: () => {}
    },
    isDragging: Boolean,
    bookCoverAspectRatio: Number
  },
  data() {
    return {
      isProcessingReadUpdate: false,
      processingRemove: false,
      isHovering: false
    }
  },
  watch: {
    userIsRead: {
      immediate: true,
      handler(newVal) {
        this.isRead = newVal
      }
    },
    isDragging: {
      handler(newVal) {
        if (newVal) {
          this.isHovering = false
        }
      }
    }
  },
  computed: {
    media() {
      return this.book.media || {}
    },
    mediaMetadata() {
      return this.media.metadata || {}
    },
    bookTitle() {
      return this.mediaMetadata.title || ''
    },
    bookAuthor() {
      return (this.mediaMetadata.authors || []).map((au) => au.name).join(', ')
    },
    bookDuration() {
      return this.$secondsToTimestamp(this.media.duration)
    },
    isMissing() {
      return this.book.isMissing
    },
    isInvalid() {
      return this.book.isInvalid
    },
    numTracks() {
      return this.media.tracks.length
    },
    isStreaming() {
      return this.$store.getters['getLibraryItemIdStreaming'] === this.book.id
    },
    showPlayBtn() {
      return !this.isMissing && !this.isInvalid && !this.isStreaming && this.numTracks
    },
    userAudiobooks() {
      return this.$store.state.user.user ? this.$store.state.user.user.audiobooks || {} : {}
    },
    userAudiobook() {
      return this.userAudiobooks[this.book.id] || null
    },
    userIsRead() {
      return this.userAudiobook ? !!this.userAudiobook.isRead : false
    },
    coverWidth() {
      if (this.bookCoverAspectRatio === 1) return 50 * 1.6
      return 50
    }
  },
  methods: {
    mouseover() {
      if (this.isDragging) return
      this.isHovering = true
    },
    mouseleave() {
      this.isHovering = false
    },
    playClick() {
      this.$eventBus.$emit('play-item', this.book.id)
    },
    clickEdit() {
      this.$emit('edit', this.book)
    },
    toggleRead() {
      var updatePayload = {
        isRead: !this.isRead
      }
      this.isProcessingReadUpdate = true
      this.$axios
        .$patch(`/api/me/audiobook/${this.book.id}`, updatePayload)
        .then(() => {
          this.isProcessingReadUpdate = false
          this.$toast.success(`"${this.bookTitle}" Marked as ${updatePayload.isRead ? 'Read' : 'Not Read'}`)
        })
        .catch((error) => {
          console.error('Failed', error)
          this.isProcessingReadUpdate = false
          this.$toast.error(`Failed to mark as ${updatePayload.isRead ? 'Read' : 'Not Read'}`)
        })
    },
    removeClick() {
      this.processingRemove = true

      this.$axios
        .$delete(`/api/collections/${this.collectionId}/book/${this.book.id}`)
        .then((updatedCollection) => {
          console.log(`Book removed from collection`, updatedCollection)
          this.$toast.success('Book removed from collection')
          this.processingRemove = false
        })
        .catch((error) => {
          console.error('Failed to remove book from collection', error)
          this.$toast.error('Failed to remove book from collection')
          this.processingRemove = false
        })
    }
  },
  mounted() {}
}
</script>