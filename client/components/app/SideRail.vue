<template>
  <div class="w-20 bg-bg h-full relative box-shadow-side z-40" style="min-width: 80px">
    <div class="absolute top-0 -right-4 w-4 bg-bg h-10 pointer-events-none" />
    <nuxt-link :to="`/library/${currentLibraryId}`" class="w-full h-20 flex flex-col items-center justify-center text-white border-b border-primary border-opacity-70 hover:bg-primary cursor-pointer relative" :class="homePage ? 'bg-primary bg-opacity-80' : 'bg-bg bg-opacity-60'">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>

      <p class="font-book pt-1.5" style="font-size: 0.9rem">Home</p>

      <div v-show="homePage" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
    </nuxt-link>

    <nuxt-link :to="`/library/${currentLibraryId}/bookshelf`" class="w-full h-20 flex flex-col items-center justify-center text-white border-b border-primary border-opacity-70 hover:bg-primary cursor-pointer relative" :class="showLibrary ? 'bg-primary bg-opacity-80' : 'bg-bg bg-opacity-60'">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>

      <p class="font-book pt-1.5" style="font-size: 0.9rem">Library</p>

      <div v-show="showLibrary" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
    </nuxt-link>

    <nuxt-link :to="`/library/${currentLibraryId}/bookshelf/series`" class="w-full h-20 flex flex-col items-center justify-center text-white text-opacity-80 border-b border-primary border-opacity-70 hover:bg-primary cursor-pointer relative" :class="isSeriesPage ? 'bg-primary bg-opacity-80' : 'bg-bg bg-opacity-60'">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>

      <p class="font-book pt-1.5" style="font-size: 0.9rem">Series</p>

      <div v-show="isSeriesPage" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
    </nuxt-link>

    <nuxt-link :to="`/library/${currentLibraryId}/bookshelf/collections`" class="w-full h-20 flex flex-col items-center justify-center text-white text-opacity-80 border-b border-primary border-opacity-70 hover:bg-primary cursor-pointer relative" :class="paramId === 'collections' ? 'bg-primary bg-opacity-80' : 'bg-bg bg-opacity-60'">
      <span class="material-icons-outlined">collections_bookmark</span>

      <p class="font-book pt-1.5" style="font-size: 0.9rem">Collections</p>

      <div v-show="paramId === 'collections'" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
    </nuxt-link>

    <nuxt-link :to="`/library/${currentLibraryId}/authors`" class="w-full h-20 flex flex-col items-center justify-center text-white text-opacity-80 border-b border-primary border-opacity-70 hover:bg-primary cursor-pointer relative" :class="isAuthorsPage ? 'bg-primary bg-opacity-80' : 'bg-bg bg-opacity-60'">
      <svg class="w-6 h-6" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z"
        />
      </svg>

      <p class="font-book pt-1.5" style="font-size: 0.9rem">Authors</p>

      <div v-show="isAuthorsPage" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
    </nuxt-link>

    <nuxt-link v-if="showExperimentalFeatures && isPodcastLibrary" :to="`/library/${currentLibraryId}/podcast/search`" class="w-full h-20 flex flex-col items-center justify-center text-white text-opacity-80 border-b border-primary border-opacity-70 hover:bg-primary cursor-pointer relative" :class="isPodcastSearchPage ? 'bg-primary bg-opacity-80' : 'bg-bg bg-opacity-60'">
      <icons-podcasts-svg class="w-6 h-6" />

      <p class="font-book pt-1.5" style="font-size: 0.9rem">Search</p>

      <div v-show="isPodcastSearchPage" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
    </nuxt-link>

    <nuxt-link v-if="numIssues" :to="`/library/${currentLibraryId}/bookshelf?filter=issues`" class="w-full h-20 flex flex-col items-center justify-center text-white text-opacity-80 border-b border-primary border-opacity-70 hover:bg-opacity-40 cursor-pointer relative" :class="showingIssues ? 'bg-error bg-opacity-40' : ' bg-error bg-opacity-20'">
      <span class="material-icons text-2xl">warning</span>

      <p class="font-book pt-1.5" style="font-size: 1rem">Issues</p>

      <div v-show="showingIssues" class="h-full w-0.5 bg-yellow-400 absolute top-0 left-0" />
      <div class="absolute top-1 right-1 w-4 h-4 rounded-full bg-white bg-opacity-30 flex items-center justify-center">
        <p class="text-xs font-mono pb-0.5">{{ numIssues }}</p>
      </div>
    </nuxt-link>
  </div>
</template>

<script>
export default {
  data() {
    return {}
  },
  computed: {
    showExperimentalFeatures() {
      return this.$store.state.showExperimentalFeatures
    },
    paramId() {
      return this.$route.params ? this.$route.params.id || '' : ''
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    currentLibraryMediaType() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType']
    },
    isPodcastLibrary() {
      return this.currentLibraryMediaType === 'podcasts'
    },
    isPodcastSearchPage() {
      return this.$route.name === 'library-library-podcast-search'
    },
    homePage() {
      return this.$route.name === 'library-library'
    },
    isSeriesPage() {
      return this.$route.name === 'library-library-series-id' || this.paramId === 'series'
    },
    isAuthorsPage() {
      return this.$route.name === 'library-library-authors'
    },
    libraryBookshelfPage() {
      return this.$route.name === 'library-library-bookshelf-id'
    },
    showLibrary() {
      return this.libraryBookshelfPage && this.paramId === '' && !this.showingIssues
    },
    showingIssues() {
      if (!this.$route.query) return false
      return this.libraryBookshelfPage && this.$route.query.filter === 'issues'
    },
    numIssues() {
      return this.$store.state.libraries.issues || 0
    }
  },
  methods: {},
  mounted() {}
}
</script>