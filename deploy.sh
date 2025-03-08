source ~/.zshrc

nvm use 14

cd website
jekyll build
cd ..

cdk deploy
