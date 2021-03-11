#!/usr/bin/env node

import yargs from 'yargs';

import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

function main() {
	const { ws, stashesFile, stashes, keyFile, erasDepth } = yargs.options({
		ws: {
			alias: 'w',
			description:
				'The API endpoint to connect to, e.g. wss://kusama-rpc.polkadot.io',
			string: true,
			demandOption: true,
		},
		stashesFile: {
			alias: 'S',
			description:
				'Path to .json file containing an array of the stash addresses to call payouts for.',
			string: true,
			demandOption: false,
		},
		stashes: {
			alias: 's',
			description:
				'Array of stash addresses to call payouts for. Required if not using stashesFile.',
			array: true,
			demandOption: false,
		},
		keyFile: {
			alias: 'k',
			description: 'Path to .txt file containing private key URI.',
			string: true,
			demandOption: true,
		},
		erasDepth: {
			alias: 'e',
			decription:
				'How many eras prior to the last collected era to check for uncollected payouts.',
			number: true,
			demandOption: false,
			default: 0,
		},
	}).argv;

	if (!stashesFile && !stashes) {
		log.error(
			'You must provide a list of stashes with the --stashes or --stashesFile opton.'
		);
		return;
	}

	DEBUG && log.info(ws, keyFile, erasDepth);
}

main();
