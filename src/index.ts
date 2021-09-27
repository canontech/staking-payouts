#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/await-thenable */

import yargs from 'yargs';

import { collect, kickLs, ls } from './handlers';
import { log } from './logger';

async function main() {
	await yargs
		.options({
			ws: {
				alias: 'w',
				description:
					'The API endpoint to connect to, e.g. wss://kusama-rpc.polkadot.io',
				string: true,
				demandOption: true,
				global: true,
			},
			stashesFile: {
				alias: 'S',
				description:
					'Path to .json file containing an array of the stash addresses to call payouts for.',
				string: true,
				demandOption: false,
				global: true,
			},
			stashes: {
				alias: 's',
				description:
					'Array of stash addresses to call payouts for. Required if not using stashesFile.',
				array: true,
				demandOption: false,
				global: true,
			},
			eraDepth: {
				alias: 'e',
				description:
					'How many eras prior to the last collected era to check for uncollected payouts.',
				number: true,
				demandOption: false,
				default: 0,
				global: true,
			},
		})
		.command(
			['collect', '$0'],
			'Collect pending payouts',
			// @ts-ignore
			(yargs) => {
				return yargs.options({
					suriFile: {
						alias: 'u',
						description: 'Path to .txt file containing private key seed.',
						string: true,
						demandOption: true,
					},
				});
			},
			// @ts-ignore
			collect
		)
		// @ts-ignore
		.command('ls', 'List pending payouts', {}, ls)
		// @ts-ignore
		.command(
			['kick-ls'],
			'List the bottom `portion` of nominators.',
			// @ts-ignore
			(yargs) => {
				return yargs.options({
					portion: {
						alias: 'p',
						description:
							'The portion of nominators to keep, expressed as decimal. I.E. `.75` would list the bottom 25% of nominators.',
						string: true,
						demandOption: true,
					},
				});
			},
			kickLs
		)
		.parse();
}

main()
	.then(() => {
		log.info('Exiting ...');
		process.exit(0);
	})
	.catch((err) => {
		log.error(err);
		process.exit(1);
	});
