const babelConfig = {
  presets: [
    '@babel/preset-env',
    [
      '@babel/preset-typescript',
      {
        rewriteImportExtensions: true,
      },
    ],
  ],
  sourceMaps: 'inline',
};

export default babelConfig;
