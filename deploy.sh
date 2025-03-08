#!/bin/zsh

source ~/.zshrc
nvm use 14

cdk deploy

cd website
jekyll build
cd ..
aws s3 cp --recursive ./website/_site s3://***REMOVED***/ --acl bucket-owner-full-control --metadata-directive REPLACE
