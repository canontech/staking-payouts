#!/usr/bin/env node

import { ApiPromise, WsProvider } from '@polkadot/api';
import fs from 'fs';
import yargs from 'yargs';

import { collectPayouts } from './collectPayouts';
import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

async function main() {
	const { ws, stashesFile, stashes, suriFile, eraDepth } = yargs.options({
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
		suriFile: {
			alias: 'u',
			description: 'Path to .txt file containing private key seed.',
			string: true,
			demandOption: true,
		},
		eraDepth: {
			alias: 'e',
			description:
				'How many eras prior to the last collected era to check for uncollected payouts.',
			number: true,
			demandOption: false,
			default: 0,
		},
	}).argv;


	DEBUG && log.info(`suriFile: ${suriFile}`);
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

	let stashesParsed: string[];
	if (stashesFile) {
		let stashesData;
		try {
			stashesData = fs.readFileSync(stashesFile);
		} catch (e) {
			log.error('Stashes file could not be opened');
			log.error(e);
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		stashesParsed = JSON.parse((stashesData as unknown) as string);
		if (!Array.isArray(stashesParsed)) {
			console.error('The stash addresses must be in a JSON file as an array.');
			return;
		}
	} else if (Array.isArray(stashes)) {
		stashesParsed = stashes as string[];
	} else {
		log.error(
			'You must provide a list of stashes with the --stashes or --stashesFile opton.'
		);
		return;
	}
	DEBUG && log.info(`Parsed stash address:\n		${stashesParsed}`);

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
	.catch(console.log)
	.finally(() => {
		log.info('Exiting ...');
		process.exit(1);
	});
