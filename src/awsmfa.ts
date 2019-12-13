#!/usr/bin/env node

import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

function exec(cmd: string | string[]) {
  return execSync(Array.isArray(cmd) ? cmd.join(' ') : cmd).toString().trim();
}

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: string;
}

function updateDotenv(credentials: Credentials) {
  const filename = join(process.cwd(), '.env');

  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, '');
  }

  const contents = dotenv.parse(fs.readFileSync(filename), {debug: true});
  const stream = fs.createWriteStream(filename);

  contents.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
  contents.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
  contents.AWS_SESSION_TOKEN = credentials.sessionToken;

  for (const key in contents) {
    stream.write(`${key}=${contents[key]}\n`)
  }

  stream.end();
}

const getUserName = (userArn: string) => {
  const matches = userArn.match(/arn:aws:iam::[0-9]+:user\/(.+)/);
  if (matches && matches[1]) {
    return matches[1];
  }
  throw new Error(`unable to get username for user ${userArn}`);
};

const program = new Command();
let mfaCode;

program
  .version('0.0.1')
  .description(
    'Fetch temporary AWS session credentials and merge into dotenv file (.env)'
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
  .action(function (code) {
    mfaCode = code;
  })
  .parse(process.argv);

if (!mfaCode) {
  process.stderr.write('ERROR: MFA code must be supplied');
  process.exit(1);
}

if (program.durationHours < 1 || program.durationHours > 36) {
  process.stderr.write('ERROR: duration must be between 1 and 36 hours');
  process.exit(2);
}

const userArn = exec(
  `aws sts get-caller-identity ` +
  `--profile ${program.profile} --query "Arn" --output text`
);

const mfaSerial = exec(
  `aws iam list-mfa-devices ` +
  `--profile ${program.profile} --user-name ${getUserName(userArn)} ` +
  `--query 'MFADevices[].SerialNumber' --output text`
);

const sessionInfo = exec(
  `aws sts get-session-token ` +
  `--profile ${program.profile} --serial-number ${mfaSerial} ` +
  `--token-code ${mfaCode} --duration-seconds ${60 * 60 * 36} --output json`
);

const parsedCredentials = JSON.parse(sessionInfo)['Credentials'];
const credentials: Credentials = {
  accessKeyId: parsedCredentials['AccessKeyId'],
  secretAccessKey: parsedCredentials['SecretAccessKey'],
  sessionToken: parsedCredentials['SessionToken'],
  expiration: parsedCredentials['Expiration'],
};

updateDotenv(credentials);

process.stdout.write('Success! .env file updated');
process.exit(0);
