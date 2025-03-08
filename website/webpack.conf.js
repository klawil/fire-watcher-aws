const path = require('path');

const config = {
	mode: 'production',
  entry: {
		audio: path.resolve(__dirname, 'ts', 'audio.ts'),
		conference: path.resolve(__dirname, 'ts', 'conference.ts'),
		login: path.resolve(__dirname, 'ts', 'login.ts'),
		profile: path.resolve(__dirname, 'ts', 'profile.ts'),
		status: path.resolve(__dirname, 'ts', 'status.ts'),
		texts: path.resolve(__dirname, 'ts', 'texts.ts'),
		users: path.resolve(__dirname, 'ts', 'users.ts'),
		weather: path.resolve(__dirname, 'ts', 'weather.ts'),
	},
  output: {
    path: path.resolve(__dirname, 'src', 'js'),
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
