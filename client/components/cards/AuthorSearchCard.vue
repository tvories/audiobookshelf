<template>
  <div class="flex h-full px-1 overflow-hidden">
    <div class="overflow-hidden bg-primary rounded" style="height: 50px; width: 40px">
      <covers-author-image :author="author" />
    </div>
    <div class="flex-grow px-2 authorSearchCardContent h-full">
      <p class="truncate text-sm">{{ name }}</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    author: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {}
  },
  computed: {
    userToken() {
      return this.$store.getters['user/getToken']
    },
    name() {
      return this.author.name
    }
  },
  methods: {},
  mounted() {}
}
</script>

<style>
.authorSearchCardContent {
  width: calc(100% - 80px);
  height: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>