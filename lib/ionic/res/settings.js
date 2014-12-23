
exports.ResSettings = {
  apiUrl: 'http://res.ionic.io',
  //apiUrl: 'http://localhost:8080',
  apiUploadPath: '/api/v1/upload',
  apiTransformPath: '/api/v1/transform',
  resourceDir: 'resources',
  resourceTmpDir: '.tmp',
  iconDir: 'icon',
  splashDir: 'splash',
  iconSourceFile: 'icon',
  splashSourceFile: 'splash',
  sourceExtensions: ['psd', 'png'],
  configFile: 'config.xml',
  generateThrottle: 4,
  defaultMaxIconSize: 144
};


exports.ResPlatforms = {

  ios: {
    icon: {
      images: [
        { name: 'icon.png',             width: 57,    height: 57 },
        { name: 'icon@2x.png',          width: 114,   height: 114 },
        { name: 'icon-40.png',          width: 40,    height: 40 },
        { name: 'icon-40@2x.png',       width: 80,    height: 80 },
        { name: 'icon-50.png',          width: 50,    height: 50 },
        { name: 'icon-50@2x.png',       width: 100,   height: 100 },
        { name: 'icon-60.png',          width: 60,    height: 60 },
        { name: 'icon-60@2x.png',       width: 120,   height: 120 },
        { name: 'icon-60@3x.png',       width: 180,   height: 180 },
        { name: 'icon-72.png',          width: 72,    height: 72 },
        { name: 'icon-72@2x.png',       width: 144,   height: 144 },
        { name: 'icon-76.png',          width: 76,    height: 76 },
        { name: 'icon-76@2x.png',       width: 152,   height: 152 },
        { name: 'icon-small.png',       width: 29,    height: 29 },
        { name: 'icon-small@2x.png',    width: 58,    height: 58 },
        { name: 'iTunesArtwork.png',    width: 512,   height: 512 },
        { name: 'iTunesArtwork@2x.png', width: 1024,  height: 1024 }
      ],
      nodeName: 'icon',
      nodeAttributes: ['src', 'width', 'height']
    },
    splash: {
      images: [
        { name: 'Default-568h@2x~iphone.png',     width: 640,   height: 1136 },
        { name: 'Default-667h.png',               width: 750,   height: 1334 },
        { name: 'Default-736h.png',               width: 1242,  height: 2208 },
        { name: 'Default-Landscape-736h.png',     width: 2208,  height: 1242 },
        { name: 'Default-Landscape@2x~ipad.png',  width: 2048,  height: 1536 },
        { name: 'Default-Landscape~ipad.png',     width: 1024,  height: 768 },
        { name: 'Default-Portrait@2x~ipad.png',   width: 1536,  height: 2048 },
        { name: 'Default-Portrait~ipad.png',      width: 768,   height: 1024 },
        { name: 'Default@2x~iphone.png',          width: 640,   height: 960 },
        { name: 'Default~iphone.png',             width: 320,   height: 480 }
      ],
      nodeName: 'splash',
      nodeAttributes: ['src', 'width', 'height']
    }
  },

  android: {
    icon: {
      images: [
        { name: 'icon-ldpi.png',    width: 36,   height: 36,   density: "ldpi" },
        { name: 'icon-mdpi.png',    width: 48,   height: 48,   density: "mdpi" },
        { name: 'icon-hdpi.png',    width: 72,   height: 72,   density: "hdpi" },
        { name: 'icon-xhdpi.png',   width: 96,   height: 96,   density: "xhdpi" },
        { name: 'icon-xxhdpi.png',  width: 144,  height: 144,  density: "xxhdpi" },
        { name: 'icon-xxxhdpi.png', width: 192,  height: 192,  density: "xxxhdpi" }
      ],
      nodeName: 'icon',
      nodeAttributes: ['src', 'density']
    },
    splash: {
      images: [
        { name: 'screen-land-ldpi.png',    width: 320,   height: 200,   density: 'land-ldpi' },
        { name: 'screen-land-mdpi.png',    width: 480,   height: 320,   density: 'land-mdpi' },
        { name: 'screen-land-hdpi.png',    width: 800,   height: 480,   density: 'land-hdpi' },
        { name: 'screen-land-xhdpi.png',   width: 1280,  height: 720,   density: 'land-xhdpi' },
        { name: 'screen-land-xxhdpi.png',  width: 1600,  height: 960,   density: 'land-xxhdpi' },
        { name: 'screen-land-xxxhdpi.png', width: 1920,  height: 1280,  density: 'land-xxxhdpi' },
        { name: 'screen-port-ldpi.png',    width: 200,   height: 320,   density: 'port-ldpi' },
        { name: 'screen-port-mdpi.png',    width: 320,   height: 480,   density: 'port-mdpi' },
        { name: 'screen-port-hdpi.png',    width: 480,   height: 800,   density: 'port-hdpi' },
        { name: 'screen-port-xhdpi.png',   width: 720,   height: 1280,  density: 'port-xhdpi' },
        { name: 'screen-port-xxhdpi.png',  width: 960,   height: 1600,  density: 'port-xxhdpi' },
        { name: 'screen-port-xxxhdpi.png', width: 1280,  height: 1920,  density: 'port-xxxhdpi' }
      ],
      nodeName: 'splash',
      nodeAttributes: ['src', 'density']
    }
  }

};
