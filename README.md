<div align="center">
  <h1 align="center">WIP @zekemostov/staking-payouts</h1>
  <h4 align="center">💸 CLI to make staking payout transactions for Substrate FRAME-based chains 💸</h4>

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

## Getting started

### Install

```bash
# NPM
npm install -G @zekemostov/staking-payouts

# Github
git clone https://github.com/emostov/staking-payouts.git
cd staking-payouts
yarn install
yarn build
```

### Run

```bash
# NPM
payouts -w wss://kusama-rpc.polkadot.io \
  -s GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT \
  -u ./key.example.txt \
  -e 8

# Github
node build/index.js -w wss://kusama-rpc.polkadot.io \
  -s GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT \
  -u ./key.example.txt \
  -e 8
```

**Note:** you can also specify a json file with an array of validator stash addresses

```bash
payouts -ws wss://kusama-rpc.polkadot.io \
  -stashesFile stashes.example.json \
  -suriFile ./key.example.txt \
```

## Options

```bash
Options:
      --help         Show help                                         [boolean]
      --version      Show version number                               [boolean]
  -w, --ws           The API endpoint to connect to, e.g.
                     wss://kusama-rpc.polkadot.io            [string] [required]
  -S, --stashesFile  Path to .json file containing an array of the stash
                     addresses to call payouts for.                     [string]
  -s, --stashes      Array of stash addresses to call payouts for. Required if
                     not using stashesFile.                              [array]
  -u, --suriFile     Path to .txt file containing private key seed.
                                                             [string] [required]
  -e, --eraDepth                                           [number] [default: 0]
```

## Docker

### Build

```bash
# The docker files rely on the TS already being transpiled to JS so we first do standard install
yarn install
yarn build
docker build -t payouts .
```

### Run

```bash
docker run payouts -w wss://kusama-rpc.polkadot.io \
  -s GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT \
  -u ./key.example.txt \
```

## Debugging

In order to get debug log messages you can set `PAYOUTS_DEBUG=1`.

## Substrate chain assumptions

The chain must at least use the `Babe` and `Staking` pallets.

## Want to support this project?

Nominate me!

- **polkadot**: 13zBFyK97dg4hWjXwEpigeVdu69sHa4fc8JYegpB369PAafq
- **kusama**: GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT
