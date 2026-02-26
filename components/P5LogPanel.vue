<template>
  <details
    v-if="hasLogs"
    class="p5-log-panel"
  >
    <summary>Logs ({{ logs.length }})</summary>
    <pre>{{ renderedLogs }}</pre>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface LogEntry {
  level?: string
  args?: unknown[]
  sketchInstanceId?: string
  ts?: string
}

const props = withDefaults(defineProps<{ logs?: LogEntry[] }>(), {
  logs: () => [],
})

const errorLogs = computed(() => {
  return props.logs.filter((entry) => (entry.level || '').toLowerCase() === 'error')
})

const hasLogs = computed(() => errorLogs.value.length > 0)

const stringifyArg = (arg: unknown): string => {
  if (typeof arg === 'string')
    return arg
  if (arg === undefined)
    return 'undefined'
  if (arg === null)
    return 'null'
  try {
    return JSON.stringify(arg)
  }
  catch {
    return String(arg)
  }
}

const renderedLogs = computed(() => {
  return errorLogs.value
    .map((entry) => {
      const level = (entry.level || 'log').toUpperCase()
      const ts = entry.ts || ''
      const args = Array.isArray(entry.args) ? entry.args.map(stringifyArg).join(' ') : ''
      return `${ts} [${level}] ${args}`.trim()
    })
    .join('\n')
})
</script>

<style scoped>
.p5-log-panel {
  margin-top: 0.5rem;
  max-height: 240px;
  overflow: auto;
}

.p5-log-panel summary {
  cursor: pointer;
  font-size: 0.875rem;
}

.p5-log-panel pre {
  margin: 0.5rem 0 0;
  padding: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: pre-wrap;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: #f8fafc;
}
</style>
