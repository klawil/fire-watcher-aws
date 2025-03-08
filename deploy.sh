#!/bin/zsh

source ~/.zshrc
nvm use 18

npm run build-lambda
cdk deploy --all

npm run build-website
cd website
jekyll build
rm _site/webpack.conf.js
rm _site/tsconfig.json
rm -rf _site/ts
rm _site/js/*.LICENSE.txt
cd ..
aws s3 cp --recursive ./website/_site s3://***REMOVED***/ --acl bucket-owner-full-control --metadata-directive REPLACE
