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
      // Electrobun adds --disable-gpu by default, which forces WebGL onto
      // SwiftShader (software). Three.js becomes ~10-100x slower. Override
      // it so cards / lighting / shaders run on the actual GPU.
      chromiumFlags: {
        'disable-gpu': false,
      },
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: 'cef',
      icon: 'public/app-icon.png',
      // Linux is the worst-affected platform: in addition to Electrobun's
      // default --disable-gpu, Chromium's GPU blocklist excludes most
      // Linux drivers (Mesa, NVIDIA proprietary, AMDGPU) by default, so
      // even with GPU "enabled" it falls back to software unless we tell
      // it to ignore the blocklist. enable-zero-copy + gpu-rasterization
      // give the rest of the WebGL pipeline its best path.
      chromiumFlags: {
        'disable-gpu': false,
        'ignore-gpu-blocklist': true,
        'enable-zero-copy': true,
        'enable-gpu-rasterization': true,
        'enable-features': 'VaapiVideoDecoder',
      },
    },
    win: {
      bundleCEF: true,
      defaultRenderer: 'cef',
      icon: 'public/app-icon.png',
      chromiumFlags: {
        'disable-gpu': false,
        'ignore-gpu-blocklist': true,
        'enable-zero-copy': true,
        'enable-gpu-rasterization': true,
      },
    },
  },
};
