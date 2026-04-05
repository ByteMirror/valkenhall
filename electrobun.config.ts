export default {
  app: {
    name: 'arsenal',
    identifier: 'dev.fabianurbanek.arsenal',
    version: '0.1.0',
  },
  release: {
    baseUrl: 'https://github.com/ByteMirror/valkenhall/releases/latest/download',
  },
  build: {
    bun: {
      entrypoint: 'src/bun/index.js',
    },
    copy: {
      dist: 'dist',
      'server/upscaling': 'server/upscaling',
    },
    mac: {
      bundleCEF: true,
      defaultRenderer: 'cef',
      icons: 'assets/app-icons/icon.iconset',
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: 'cef',
      icon: 'public/app-icon.png',
    },
    win: {
      bundleCEF: true,
      defaultRenderer: 'cef',
      icon: 'public/app-icon.png',
    },
  },
};
