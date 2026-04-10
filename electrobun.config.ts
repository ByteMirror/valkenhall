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
      // Electrobun defaults disable-gpu, disable-gpu-compositing, and
      // disable-gpu-memory-buffer-video-frames. Override all three so
      // Three.js / WebGL runs on the actual GPU. ignore-gpu-blocklist
      // is needed because Chromium's blocklist excludes most Linux
      // drivers (Mesa, NVIDIA, AMDGPU).
      chromiumFlags: {
        'disable-gpu': false,
        'disable-gpu-compositing': false,
        'disable-gpu-memory-buffer-video-frames': false,
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
      // Full GPU override set for Windows CEF. The GPU process can crash
      // silently on some Windows drivers (especially Intel integrated),
      // leaving WebGL/Three.js stuck on a black screen.
      // - ignore-gpu-blocklist: allow GPUs that Chromium would normally block
      // - use-angle=d3d11: force ANGLE's D3D11 backend (most compatible)
      // - use-gl=angle: use ANGLE translation layer for OpenGL calls
      // - enable-gpu-rasterization: offload raster work to GPU
      // - disable-gpu-sandbox: prevent sandbox from blocking GPU init
      chromiumFlags: {
        'disable-gpu': false,
        'disable-gpu-compositing': false,
        'disable-gpu-memory-buffer-video-frames': false,
        'ignore-gpu-blocklist': true,
        'use-angle': 'd3d11',
        'use-gl': 'angle',
        'enable-zero-copy': true,
        'enable-gpu-rasterization': true,
        'disable-gpu-sandbox': true,
      },
    },
  },
};
