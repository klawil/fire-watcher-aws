#!/bin/bash

source ~/.bash_profile
nvm use 14

cd website
jekyll build
cd ..

cdk deploy
