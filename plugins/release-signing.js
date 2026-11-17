// Signs release builds with the key named in ~/.gradle/gradle.properties (PING_*), never committed.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// release-signing';

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes(MARK)) return c;
    g = g.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        ${MARK}
        release {
            storeFile file(findProperty('PING_STORE_FILE') ?: 'missing.keystore')
            storePassword findProperty('PING_STORE_PASSWORD')
            keyAlias findProperty('PING_KEY_ALIAS')
            keyPassword findProperty('PING_KEY_PASSWORD')
        }
`,
    );
    g = g.replace(/(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    c.modResults.contents = g;
    return c;
  });
