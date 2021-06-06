import { ApiPromise, WsProvider } from '@polkadot/api';
import fs from 'fs';

import { collectPayouts } from './collectPayouts';
import { isValidSeed } from './isValidSeed';
import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

export async function payout({
	suriFile,
	ws,
	stashesFile,
	stashes,
	eraDepth,
}: {
	suriFile: string;
	ws: string;
	stashesFile?: string;
	stashes?: (string | number)[];
	eraDepth: number;
}): Promise<void> {
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

export function parseStashes(
	stashesFile?: string,
	stashes?: (string | number)[]
): string[] | null {
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
		stashesParsed = JSON.parse(stashesData as unknown as string);
		if (!Array.isArray(stashesParsed)) {
			log.error('The stash addresses must be in a JSON file as an array.');
			return null;
		}
	} else if (Array.isArray(stashes)) {
		stashesParsed = stashes as string[];
	} else {
		log.error(
			'You must provide a list of stashes with the --stashes or --stashesFile opton.'
		);
		return null;
	}

	return stashesParsed;
}
