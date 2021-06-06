#!/usr/bin/env node

import { ApiPromise, WsProvider } from '@polkadot/api';
import fs from 'fs';
import yargs from 'yargs';

import { collectPayouts } from './collectPayouts';
import { parseStashes, payout } from './handlers';
import { isValidSeed } from './isValidSeed';
import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

async function main() {
	const { ws, stashesFile, stashes, suriFile, eraDepth } = yargs
		.command(['payout', '$0'], 'Claim payouts', (yargs) => {
			return yargs.options({
				suriFile: {
					alias: 'u',
					description: 'Path to .txt file containing private key seed.',
					string: true,
					demandOption: true,
				},
			});
		})
		.command({
			handler: payout,
		})
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
		.command('ls', 'List pending payouts').argv;

	DEBUG && log.debug(`suriFile: ${suriFile}`);
	let suriData;
	try {
		suriData = fs.readFileSync(suriFile, 'utf-8');
	} catch (e) {
		log.error('Suri file could not be opened');
		log.error(e);
		return;
	}
	const suri = suriData.split(/\r?\n/)[0];
	if (!suri) {
		log.error('No suri could be read in from file.');
		return;
	}
	if (!isValidSeed(suri)) {
		log.error('Suri is invalid');
		return;
	}

	const stashesParsed = parseStashes(stashesFile, stashes);
	if (!stashesParsed) return;
	DEBUG && log.debug(`Parsed stash address: ${stashesParsed.join(', ')}`);

	const provider = new WsProvider(ws);
	const api = await ApiPromise.create({
		provider,
	});

	await collectPayouts({
		api,
		suri,
		stashes: stashesParsed,
		eraDepth,
	});
}

main()
	.catch(log.error)
	.finally(() => {
		log.info('Exiting ...');
		process.exit(1);
	});
