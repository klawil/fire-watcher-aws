const path = require('path');

const config = {
	mode: 'production',
  entry: {
		audio: './website/ts/audio.ts',
		conference: './website/ts/conference.ts',
		login: './website/ts/login.ts',
		profile: './website/ts/profile.ts',
		status: './website/ts/status.ts',
		texts: './website/ts/texts.ts',
		users: './website/ts/users.ts',
		weather: './website/ts/weather.ts',
	},
  output: {
    path: path.resolve(__dirname, 'js'),
    filename: '[name].js',
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
  devtool: 'source-map',
};

module.exports = config;
