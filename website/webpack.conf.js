const path = require('path');

const config = {
	mode: 'production',
  entry: {
		profile: './website/ts/profile.ts',
	},
  output: {
    path: path.resolve(__dirname, 'js'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.ts(x)?$/,
        loader: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [
      '.tsx',
      '.ts',
      '.js'
    ]
  },
	devtool: 'inline-source-map',
};

module.exports = config;
