// Resource shrinking drops res/raw/ring.mp3 since only the notification channel names it at runtime.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'keep_sounds.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@raw/ring" />\n');
      return c;
    },
  ]);
