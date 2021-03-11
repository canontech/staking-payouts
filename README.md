<div align="center">
  <h1 align="center">@zekemostov/staking-payouts</h1>
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

# OR

# Github
git clone https://github.com/emostov/staking-payouts.git
cd staking-payouts
yarn install
npm install -g # Install the binary globally
```

### Run

```bash
payouts -w wss://kusama-rpc.polkadot.io \
  -s GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT \
  -u ./key.txt \
  -e 8
```

## Debugging

In order to get debug log messages you can set `PAYOUTS_DEBUG=1`.

## Substrate chain assumptions

The chain must at least use the `Babe` and `Staking` pallets.

## Want to support this project?

Nominate me!

**polkadot**: 13zBFyK97dg4hWjXwEpigeVdu69sHa4fc8JYegpB369PAafq
**kusama**: GCporqtiw7ybKYUqAftjvUAjZnp3x9gfrWsTy1GrvrGwmYT
