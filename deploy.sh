#!/bin/zsh

source .env

# Build the website
cd website-react
npm run build
cd ..

# Build and deploy the stack
cd stack
npm run build
npm run deploy
# node test.js
cd ..
