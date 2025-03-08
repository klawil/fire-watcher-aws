# Deployment

```bash
nvm use 14

export AWS_ACCESS_KEY_ID="{AWS Key}"
export AWS_SECRET_ACCESS_KEY="{AWS Secret Key}"

cd website
jekyll build
cd ..

cdk deploy
```
