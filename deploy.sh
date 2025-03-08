#!/bin/zsh

source ~/.zshrc
nvm use 18

cd stack
npm run build
cdk deploy --all
cd ..

cd website
npm run build
aws s3 cp --recursive ./src/_site s3://***REMOVED***/ --acl bucket-owner-full-control --metadata-directive REPLACE
cd ..
