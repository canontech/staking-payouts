<div align="center">
  <h1 align="center">@zekemostov/staking-payouts</h1>
  <h4 align="center">💸 CLI to make staking payout transactions for Substrate FRAME-based chains 💸</h4>
  <h4 align="center">🤖 Automation friendly 🤖</h4>
  <h4 align="center">🧱⛓💰🚀</h4>

  <p align="center">
    <a href="https://www.npmjs.com/package/@zekemostov/staking-payouts"">
      <img alt="npm" src="https://img.shields.io/npm/v/@zekemostov/staking-payouts" />
    </a>
    <a href="https://github.com/emostov/staking-payouts/blob/master/LICENSE">
      <img alt="GPL-3.0-or-later" src="https://img.shields.io/npm/l/@zekemostov/staking-payouts"" />
    </a>
  </p>
</div>

<br /><br />

### Table of contents

- [About](#about)
- [Usage notes](#usage-notes)
- [Getting started](#getting-started)
- [Options](#options)
- [Docker](#docker)
- [Debugging](#debugging)
- [Questions, feature request, or bug reports](#questions-feature-request-or-bug-reports)
- [Substrate chain assumptions](#substrate-chain-assumptions)
- [Support this project](#support-this-project)

### About

This simple tool enables you to create a batch of payout transactions for a given list of validators and/or nominators - automating the process of gathering unclaimed rewards.

For each validator it finds the last era where they collected payouts and then creates payout transactions for the eras that have ocurred since and for which they where in the validator set. If you think there are un-paid out eras prior to the last payed out, you can also specify a `eraDepth`; the tool will check `lastPayedOutEra` through `lastPayedOutEra - eraDepth` to see if there are any eras where they where in the validator set and payouts have not been collected.

#### Motivation

Have a large list of validators and/or nominators you want to get payouts for?
> Put their addresses in a JSON file once and simply run this program each time you want to collect.

Want to automate the payout gather process?
> Using something like systemd.timers or cron, run this program at regular intervals. Plus, its already docker ready!

### Usage Notes

#### Perquisites

- node.js > 14

#### Updating

Substrate chains use a non self describing codec, meaning clients that communicate with the chain need type definitions to decode the data. Some runtime upgrades require new type definitions which may affect this CLI.

Thus, it is recommended to upgrade this CLI to the latest version prior to runtime upgrade in order to ensure it will always have the latest type definitions from polkadot-js/api.

## Getting started

### Install

```bash
# NPM
npm install -G @zekemostov/staking-payouts

# Github
git clone https://github.com/emostov/staking-payouts.git
cd staking-payouts
yarn install
yarn run build
```

### Collect unclaimed payouts

```bash
# NPM
payouts collect \
  -w wss://kusama.api.onfinality.io/public \
  -s 15Jbynf3EcRqdHV1K14LXYh7PQFTbp5wiXfrc4kbMReR9KxA \
  -u ./key.example.txt \
  -e 8

# Github
node build/index.js collect \
  -w wss://kusama.api.onfinality.io/public \
  -s 15Jbynf3EcRqdHV1K14LXYh7PQFTbp5wiXfrc4kbMReR9KxA \
  -u ./key.example.txt \
  -e 8
```

**NOTE:** you can also specify a json file with an array of validator stash addresses:

```bash
payouts collect \
  -w wss://kusama.api.onfinality.io/public \
  --stashesFile ./stashes.example.json \
  --suriFile ./key.example.txt
```

### List unclaimed payouts

```bash
payouts ls \
  -w wss://kusama.api.onfinality.io/public \
  --stashesFile ./stashes.example.json \
  -e 8
```

### List nominators of the given stash addresses in order of bonded funds

```bash
payouts lsNominators \
  -w wss://rpc.polkadot.io \
  -s 111B8CxcmnWbuDLyGvgUmRezDCK1brRZmvUuQ6SrFdMyc3S \
```

### List count of validator's commission under and above the given value

```bash
payouts commission \
        -w wss://rpc.polkadot.io \
        -p 0.9
```

## Options

```log
Commands:
  index.ts collect       Collect pending payouts                       [default]
  index.ts ls            List pending payouts
  index.ts lsNominators  List nominators backing the given stashes
  index.ts commission    List validators with commission under and above the
                         given value

Options:
      --help         Show help                                         [boolean]
      --version      Show version number                               [boolean]
  -w, --ws           The API endpoint to connect to, e.g.
                     wss://kusama-rpc.polkadot.io            [string] [required]
  -S, --stashesFile  Path to .json file containing an array of the stash
                     addresses to call payouts for.                     [string]
  -s, --stashes      Array of stash addresses to call payouts for. Required if
                     not using stashesFile.                              [array]
  -e, --eraDepth     How many eras prior to the last collected era to check for
                     uncollected payouts.                  [number] [default: 0]
  -u, --suriFile                                             [string] [required]
```

**NOTES:**

  - `collect` is the default command and as such can be omitted.
  - `--suriFile` is only require for the `collect` command.
  - `lsNominators` only requires a stash address and api endpoint.

## Docker

### Build

```bash
docker build -t payouts .
```

### Run

```bash
docker run payouts collect \
  -w wss://kusama.api.onfinality.io/public \
  -s GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT \
  -u ./key.example.txt
```

## Debugging

In order to get debug log messages you can set `PAYOUTS_DEBUG=1`.

## Questions, feature request, or bug reports

If you have a question, feature request or believe you found a bug please open up a issue in the github repo. All feedback is appreciated.

## Substrate chain assumptions

The chain must be `FRAME`-based and use the substrate staking pallet.

## Support this project

- 👩‍💻 Contribute to the docs or code
- ⭐️ Star the github repo
- 🗳 Nominate (or tip) me!
  - **polkadot**: 13zBFyK97dg4hWjXwEpigeVdu69sHa4fc8JYegpB369PAafq
  - **kusama**: GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT
