<template>
  <div class="w-full">
    <p class="px-1 text-sm font-semibold" :class="disabled ? 'text-gray-400' : ''">{{ label }}</p>
    <div ref="wrapper" class="relative">
      <form @submit.prevent="submitForm">
        <div ref="inputWrapper" class="input-wrapper flex-wrap relative w-full shadow-sm flex items-center border border-gray-600 rounded px-2 py-2" :class="disabled ? 'pointer-events-none bg-black-300 text-gray-400' : 'bg-primary'">
          <input ref="input" v-model="textInput" :disabled="disabled" :readonly="!editable" class="h-full w-full bg-transparent focus:outline-none px-1" @keydown="keydownInput" @focus="inputFocus" @blur="inputBlur" />
        </div>
      </form>

      <ul ref="menu" v-show="isFocused && itemsToShow.length" class="absolute z-50 mt-0 w-full bg-bg border border-black-200 shadow-lg max-h-56 rounded py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" role="listbox" aria-labelledby="listbox-label">
        <template v-for="item in itemsToShow">
          <li :key="item" class="text-gray-50 select-none relative py-2 pr-3 cursor-pointer hover:bg-black-400" role="option" @click="clickedOption($event, item)" @mouseup.stop.prevent @mousedown.prevent>
            <div class="flex items-center">
              <span class="font-normal ml-3 block truncate">{{ item }}</span>
            </div>
            <span v-if="input === item" class="text-yellow-400 absolute inset-y-0 right-0 flex items-center pr-4">
              <span class="material-icons text-xl">checkmark</span>
            </span>
          </li>
        </template>
        <li v-if="!itemsToShow.length" class="text-gray-50 select-none relative py-2 pr-9" role="option">
          <div class="flex items-center justify-center">
            <span class="font-normal">No items</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    value: [String, Number],
    disabled: Boolean,
    label: String,
    items: {
      type: Array,
      default: () => []
    },
    editable: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      isFocused: false,
      // currentSearch: null,
      typingTimeout: null,
      textInput: null
    }
  },
  watch: {
    value: {
      immediate: true,
      handler(newVal) {
        this.textInput = newVal
      }
    }
  },
  computed: {
    input: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    itemsToShow() {
      if (!this.editable) return this.items
      if (!this.textInput || this.textInput === this.input) {
        return []
      }
      return this.items.filter((i) => {
        var iValue = String(i).toLowerCase()
        return iValue.includes(this.textInput.toLowerCase())
      })
    }
  },
  methods: {
    keydownInput() {
      clearTimeout(this.typingTimeout)
      this.typingTimeout = setTimeout(() => {
        // this.currentSearch = this.textInput
      }, 100)
    },
    inputFocus() {
      this.isFocused = true
    },
    blur() {
      // Handle blur immediately
      this.isFocused = false
      if (this.input !== this.textInput) {
        var val = this.textInput ? this.textInput.trim() : null
        this.input = val
        if (val && !this.items.includes(val)) {
          this.$emit('newItem', val)
        }
      }

      if (this.$refs.input) {
        this.$refs.input.blur()
      }
    },
    inputBlur() {
      if (!this.isFocused) return

      setTimeout(() => {
        if (document.activeElement === this.$refs.input) {
          return
        }
        this.isFocused = false
        if (this.input !== this.textInput) {
          var val = this.textInput ? this.textInput.trim() : null
          this.input = val
          if (val && !this.items.includes(val)) {
            this.$emit('newItem', val)
          }
        }
      }, 50)
    },
    submitForm() {
      var val = this.textInput ? this.textInput.trim() : null
      this.input = val
      if (val && !this.items.includes(val)) {
        this.$emit('newItem', val)
      }
      // this.currentSearch = null
    },
    clickedOption(e, item) {
      this.textInput = null
      // this.currentSearch = null
      this.input = item
      if (this.$refs.input) this.$refs.input.blur()
    }
  },
  mounted() {}
}
</script>
