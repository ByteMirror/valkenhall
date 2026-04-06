export default {
  app: {
    name: 'Valkenhall',
    identifier: 'dev.fabianurbanek.valkenhall',
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

      'node_modules/@img': 'node_modules/@img',
      'node_modules/sharp': 'node_modules/sharp',
    },
    mac: {
      bundleCEF: true,
      defaultRenderer: 'cef',
      codesign: false,
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
