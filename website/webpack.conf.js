const path = require('path');

const config = {
	mode: 'production',
  entry: {
		conference: './website/ts/conference.ts',
		profile: './website/ts/profile.ts',
		login: './website/ts/login.ts',
		texts: './website/ts/texts.ts',
		weather: './website/ts/weather.ts',
		users: './website/ts/users.ts',
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
  devtool: 'eval-source-map',
	// devtool: 'inline-source-map',
};

module.exports = config;
