import { ApiPromise, WsProvider } from '@polkadot/api';
import fs from 'fs';

import { isValidSeed } from './isValidSeed';
import { log } from './logger';
import {
	collectPayouts,
	listLowestNominators,
	listPendingPayouts,
} from './services';

const DEBUG = process.env.PAYOUTS_DEBUG;

interface HandlerArgs {
	suriFile: string;
	ws: string;
	stashesFile?: string;
	stashes?: (string | number)[];
	eraDepth: number;
	portion: number;
}

export async function collect({
	suriFile,
	ws,
	stashesFile,
	stashes,
	eraDepth,
}: Omit<HandlerArgs, 'portion'>): Promise<void> {
	DEBUG && log.debug(`suriFile: ${suriFile}`);
	let suriData;
	try {
		suriData = fs.readFileSync(suriFile, 'utf-8');
	} catch (e) {
		log.error('Suri file could not be opened');
		throw e;
	}
	const suri = suriData.split(/\r?\n/)[0];
	if (!suri) {
		throw Error('No suri could be read in from file.');
	}
	if (!isValidSeed(suri)) {
		throw Error('Suri is invalid');
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

export async function ls({
	ws,
	stashesFile,
	stashes,
	eraDepth,
}: Omit<HandlerArgs, 'suri'>): Promise<void> {
	const stashesParsed = parseStashes(stashesFile, stashes);
	DEBUG && log.debug(`Parsed stash address: ${stashesParsed.join(', ')}`);

	const provider = new WsProvider(ws);
	const api = await ApiPromise.create({
		provider,
	});

	await listPendingPayouts({
		api,
		stashes: stashesParsed,
		eraDepth,
	});
}

export async function kickLs({
	ws,
	stashesFile,
	stashes,
	portion,
}: Omit<HandlerArgs, 'suri' | 'eraDepth'>): Promise<void> {
	const stashesParsed = parseStashes(stashesFile, stashes);
	DEBUG && log.debug(`Parsed stash address: ${stashesParsed.join(', ')}`);

	const provider = new WsProvider(ws);
	const api = await ApiPromise.create({
		provider,
	});

	await listLowestNominators({
		api,
		stashes: stashesParsed,
		portion,
	});
}

export function parseStashes(
	stashesFile?: string,
	stashes?: (string | number)[]
): string[] {
	let stashesParsed: string[];
	if (stashesFile) {
		let stashesData;
		try {
			stashesData = fs.readFileSync(stashesFile);
		} catch (e) {
			log.error('Stashes file could not be opened');
			throw e;
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		stashesParsed = JSON.parse(stashesData as unknown as string);
		if (!Array.isArray(stashesParsed)) {
			throw Error('The stash addresses must be in a JSON file as an array.');
		}
	} else if (Array.isArray(stashes)) {
		stashesParsed = stashes as string[];
	} else {
		throw Error(
			'You must provide a list of stashes with the --stashes or --stashesFile opton.'
		);
	}

	return stashesParsed;
}
