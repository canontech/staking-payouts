#!/usr/bin/env node

import yargs from 'yargs';

function main() {

	const { ws, stashesFile, stashes, keyFile } = yargs.options({
		ws: {
			alias: 'w',
			description: 'The API endpoint to connect to, e.g. wss://kusama-rpc.polkadot.io',
			string: true,
			demandOption: true
		},
		stashesFile: {
			alias: 'sf',
			description: 'Path to .json file containing an array of the stash addresses to call payouts for.',
			string: true,
			demandOption: false
		},
		stashes: {
			alias: 's',
			description: 'Array of stash addresses to call payouts for. Required if not using stashesFile.',
			array: true,
			demandOption: false,
		},
		keyFile: {
			alias: 'kf',
			description: 'Path to .txt file containing private key URI.',
			string: true,
			demandOption: true,
		}
	}).argv

}

main();