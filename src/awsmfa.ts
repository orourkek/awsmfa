#!/usr/bin/env node

import { Command } from 'commander';
import {
  getUserNameFromArn,
  promiseExec as exec,
  updateDotenv,
} from './util';

const program = new Command();
let mfaCode: string = '';

program
  .version('0.0.1')
  .description(
    'Fetch temporary AWS credentials and merge into dotenv file (.env)'
  )
  .option(
    '-p, --profile [profile]',
    'AWS profile to fetch temp credentials with',
    'default'
  )
  .option(
    '-d, --duration-hours [hours]',
    'Duration, in hours, credentials should remain valid (min:1 max:36)',
    36
  )
  .arguments('<mfa_code>')
  .action((code: string) => mfaCode = code)
  .parse(process.argv);

main();

async function main() {

  if (!mfaCode) {
    process.stderr.write('ERROR: MFA code must be supplied');
    process.exit(1);
  }

  if (program.durationHours < 1 || program.durationHours > 36) {
    process.stderr.write('ERROR: duration must be between 1 and 36 hours');
    process.exit(2);
  }

  const userArn = await exec(
    `aws sts get-caller-identity ` +
    `--profile ${program.profile} --query "Arn" --output text`
  );

  const mfaSerial = await exec(
    `aws iam list-mfa-devices ` +
    `--profile ${program.profile} --user-name ${getUserNameFromArn(userArn)} ` +
    `--query 'MFADevices[].SerialNumber' --output text`
  );

  const sessionInfo = await exec(
    `aws sts get-session-token ` +
    `--profile ${program.profile} --serial-number ${mfaSerial} ` +
    `--token-code ${mfaCode} --duration-seconds ${60 * 60 * 36} --output json`
  );

  const parsedCredentials = JSON.parse(sessionInfo)['Credentials'];

  const replacements = {
    AWS_ACCESS_KEY_ID: parsedCredentials['AccessKeyId'],
    AWS_SECRET_ACCESS_KEY: parsedCredentials['SecretAccessKey'],
    AWS_SESSION_TOKEN: parsedCredentials['SessionToken'],
  };

  await updateDotenv(process.cwd(), replacements);

  process.stdout.write('Success! .env file updated');
  process.exit(0);
}
