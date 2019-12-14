#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'child_process';
import {
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

const program = new Command();
let mfaCode: string = '';

program
  .version(require('../package.json').version)
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
    process.stderr.write('ERROR: MFA code must be supplied\n');
    program.help();
  }

  if (program.durationHours < 1 || program.durationHours > 36) {
    process.stderr.write('ERROR: duration must be between 1 and 36 hours');
    process.exit(2);
  }

  const durationSeconds = 60 * 60 * program.durationHours;

  const userArn = await promiseExec(
    `aws sts get-caller-identity ` +
    `--profile ${program.profile} --query "Arn" --output text`
  );

  const mfaSerial = await promiseExec(
    `aws iam list-mfa-devices ` +
    `--profile ${program.profile} --user-name ${getUserNameFromArn(userArn)} ` +
    `--query 'MFADevices[].SerialNumber' --output text`
  );

  const sessionInfo = await promiseExec(
    `aws sts get-session-token ` +
    `--profile ${program.profile} --serial-number ${mfaSerial} ` +
    `--token-code ${mfaCode} --duration-seconds ${durationSeconds} ` +
    `--output json`
  );

  const parsedCredentials = JSON.parse(sessionInfo)['Credentials'];
  const expiration = parsedCredentials['Expiration'];
  const replacements = {
    AWS_ACCESS_KEY_ID: parsedCredentials['AccessKeyId'],
    AWS_SECRET_ACCESS_KEY: parsedCredentials['SecretAccessKey'],
    AWS_SESSION_TOKEN: parsedCredentials['SessionToken'],
  };

  await updateDotenv(process.cwd(), replacements);

  process.stdout.write(`Success! .env file updated\n`);
  process.stdout.write(`Credentials expire at: ${expiration}`);
  process.exit(0);
}

async function promiseExec(cmd: string | string[]): Promise<string> {
  return new Promise((resolve, reject) => exec(
    Array.isArray(cmd) ? cmd.join(' ') : cmd,
    (err, stdout) => resolve(stdout.toString().trim())
  ));
}

function getUserNameFromArn(userArn: string) {
  return userArn.replace(/arn:aws:iam::[0-9]+:user\//, '');
}

/**
 * Custom dotenv parser that preserves comments and newlines. Parses .env
 * file into an array with comments & blank lines as strings, and key/value
 * pairs as tuples.
 */
function parseDotenv(contents: string | Buffer) {
  const parsedLines: Array<string | [string, string]> = [];
  contents.toString().split(/\r|\n|\r\n/).forEach((line) => {
    const kvPair = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (kvPair) {
      parsedLines.push([ kvPair[1], (kvPair[2] || '').trim() ]);
    } else {
      parsedLines.push(line);
    }
  });
  return parsedLines;
}

/**
 * Updates a .env file, replacing keys according to the passed object
 */
async function updateDotenv(
  location: string,
  replacements: { [key: string]: string }
) {
  return new Promise((resolve, reject) => {
    const filename = join(location, '.env');
    if (!existsSync(filename)) {
      writeFileSync(filename, '');
    }

    const contents = parseDotenv(readFileSync(filename));
    const stream = createWriteStream(filename);

    contents.forEach((lineOrKvTuple, idx) => {
      const newLine = idx < (contents.length - 1) ? '\n' : '';
      if (Array.isArray(lineOrKvTuple)) {
        const key = lineOrKvTuple[0];
        const val = replacements.hasOwnProperty(key) ?
          replacements[key] :
          lineOrKvTuple[1];
        stream.write(`${key}=${val}${newLine}`);
      } else {
        stream.write(`${lineOrKvTuple}${newLine}`);
      }
    });

    // explicitly wait for stream end to avoid process.exit()ing too early
    stream.end(resolve);
  });
}
