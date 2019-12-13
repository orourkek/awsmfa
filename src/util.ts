import { exec } from 'child_process';
import {
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

export async function promiseExec(cmd: string | string[]): Promise<string> {
  return new Promise((resolve, reject) => exec(
    Array.isArray(cmd) ? cmd.join(' ') : cmd,
    (err, stdout) => resolve(stdout.toString().trim())
  ));
}

export function getUserNameFromArn(userArn: string) {
  return userArn.replace(/arn:aws:iam::[0-9]+:user\//, '');
}

/**
 * Custom dotenv parser that preserves comments and newlines. Parses .env
 * file into an array with comments & blank lines as strings, and key/value
 * pairs as tuples.
 */
export function parseDotenv(contents: string | Buffer) {
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
export async function updateDotenv(
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
