<template>
  <div class="p5-error-boundary">
    <strong class="title">{{ title }}</strong>
    <p class="message">
      {{ message }}
    </p>
    <pre
      v-if="details"
      class="details"
    >{{ details }}</pre>
    <div class="actions">
      <button @click="copy">
        Copy
      </button>
      <button @click="$emit('clear')">
        Dismiss
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title?: string; message?: string; details?: string }>()
defineEmits<{ (e: 'clear'): void }>()

const title = props.title || 'Sketch Error'
const message = props.message || 'An error occurred while running the sketch.'
const details = props.details || ''

function copy() {
  try {
    void navigator.clipboard.writeText([message, details].filter(Boolean).join('\n\n'))
  } catch (e) {
    void 0
  }
}
</script>

<style scoped>
.p5-error-boundary {
  border: 1px solid #e55353;
  background: #fff6f6;
  color: #800;
  padding: 12px;
  border-radius: 6px;
}
.p5-error-boundary .title { display:block; margin-bottom:6px }
.p5-error-boundary .message { margin:0 0 8px 0 }
.p5-error-boundary .details { background:#fff; padding:8px; border-radius:4px; max-height:200px; overflow:auto }
.p5-error-boundary .actions { margin-top:8px }
.p5-error-boundary button { margin-right:8px }
</style>
