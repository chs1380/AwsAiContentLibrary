# AWS AI Documents Moderator
This project uses AWS AI services to speed up grading task.

### AWS Cloud9 Setup Environment
```
git clone https://github.com/wongcyrus/AwsAiContentLibrary
cd AwsAiContentLibrary/  
npm i nvm  
nvm install 16
nvm alias default 16
npm install -g yarn  
npm install -g --force npx  
echo "" >> ~/.bash_profile   
echo "alias pj='npx projen'" >> ~/.bash_profile
alias pj='npx projen'
bash <(curl -sL https://gist.githubusercontent.com/wongcyrus/a4e726b961260395efa7811cab0b4516/raw/490162cebcaa44210bb2eab0e6883e57fd880a27/resize.sh) 50
```
### Cloud9 TypeScript Formatter
Follow
https://gist.github.com/wongcyrus/4e8a2e78045e11f7c5a55e4e244fe3d2
### Source Code Folder
src/
Don't touch code in lib/ which generates by projen.
### Auto compile
You need to run TypeScript compiler at the background with new terminal.
```
pj watch
```

/usr/local/lib/python3.7.10/dist-packages:/usr/local/lib/python3.5/dist-packages