const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.22.0',
  defaultReleaseBranch: 'main',
  name: 'aws-ai-document-moderator',

  deps: ['@aws-cdk/aws-lambda-python-alpha'],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});

project.addTask('hotswap',{
  exec:'npx projen deploy --hotswap --require-approval never'
});
project.synth();