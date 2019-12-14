# @korourke/awsmfa

Fetch temporary AWS session credentials for an MFA-protected account, and merge them into local dotenv file (`.env`).

## Installation

```
$ npm i -g @korourke/awsmfa
```

## Prerequisites

Your [aws credentials file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) should have at least one profile, configured with an `aws_access_key_id` and `aws_secret_access_key`:

```
[default]
aws_access_key_id=EXAMPLEACCESSKEYID
aws_secret_access_key=exampleSecretAccessKey
```

## Usage

Running this script will retrieve session credentials with the passed MFA token/code, then populate the `.env` file in the current working directory with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`. If a `.env` file already exists these values will be merged into the existing file, and all other variables and comments will be preserved.

Basic usage (profile `[default]`):

```
$ awsmfa <MFA_CODE>
```

Usage with other options:

```
$ awsmfa --profile some.profile --duration-hours 12 <MFA_CODE>
```
