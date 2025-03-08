source ~/.zshrc

nvm use 14

cd website
jekyll build
cd ..

cdk deploy
aws s3 cp --recursive ./website/_site s3://***REMOVED***/ --acl bucket-owner-full-control --metadata-directive REPLACE
