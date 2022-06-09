const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.27.0',
  defaultReleaseBranch: 'main',
  name: 'aws-ai-document-moderator',

  deps: ['@aws-cdk/aws-lambda-python-alpha','dotenv'],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
  gitignore: [
    'output.json','.env'
  ],
});
project.addTask('hotswap',{
  exec:'npx projen deploy --hotswap --require-approval never --outputs-file ./output.json'
});
project.synth();