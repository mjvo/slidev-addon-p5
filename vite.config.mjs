const ASYNC_MODULES = ['file-saver', 'vue', '@vue']

export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Let Rollup auto-chunk shiki + monaco types to avoid Slidev's cross-chunk cycle.
          if (id.startsWith('~icons/'))
            return 'modules/unplugin-icons'

          const matchedAsyncModule = ASYNC_MODULES.find(mod => id.includes(`/node_modules/${mod}`))
          if (matchedAsyncModule)
            return `modules/${matchedAsyncModule.replace('@', '').replace('/', '-')}`
        },
      },
    },
  },
}
