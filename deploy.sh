#!/bin/zsh

source .env

echo -n "Deploy the stack (Y/N): "
read confirmStack
echo -n "Deploy the client (Y/N): "
read confirmClient

if [[ $confirmStack == [yY] || $confirmStack == [yY][eE][sS] ]]; then
  cd stack
  npm run build
  npm run deploy
  node test.js
  cd ..
fi

if [[ $confirmClient == [yY] || $confirmClient == [yY][eE][sS] ]]; then
  cd website
  npm run build
  aws s3 cp --recursive ./src/_site s3://$BUCKET_NAME/ --acl bucket-owner-full-control --metadata-directive REPLACE
  cd ..
fi
