import { ApiPromise, Keyring } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import { ISubmittableResult } from '@polkadot/types/types';

import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

type ValidatorsCache = Record<number, string[]>;

/**
 *
 * @param param0
 * @returns Promise<void>
 */
export async function collectPayouts({
	api,
	suri,
	stashes,
	eraDepth,
}: {
	api: ApiPromise;
	suri: string;
	stashes: string[];
	eraDepth: number;
}): Promise<void> {
	const [currBlockHash, activeInfo] = await Promise.all([
		api.rpc.chain.getFinalizedHead(),
		api.query.staking.activeEra(),
	]);
	if (activeInfo.isNone) {
		log.warn('ActiveEra is None, txs could not be completed.');
		return;
	}
	const currEra = activeInfo.unwrap().index;
	const currBlockNumber = (
		await api.rpc.chain.getHeader(currBlockHash)
	).number.toNumber();

	const validatorsCache: ValidatorsCache = {};
	const batch = [];
	for (const stash of stashes) {
		// Get payouts for a validator
		const _controller = await api.query.staking.bonded(stash);
		if (_controller.isNone) {
			log.warn(`${stash} is not a valid stash address.`);
			continue;
		}
		const controller = _controller.unwrap();

		const _ledger = await api.query.staking.ledger(controller);
		if (_ledger.isNone) {
			log.warn(`Staking ledger for ${stash} was not found.`);
			continue;
		}
		const ledger = _ledger.unwrap();

		const { claimedRewards } = ledger;
		DEBUG &&
			log.info(
				`${stash} claimed rewards for eras:\n		${claimedRewards.toString()}`
			);

		const lastEra = claimedRewards[claimedRewards.length - 1]?.toNumber();
		if (!lastEra) {
			// This shouldn't happen but here anyways.
			continue;
		}
		// See if there are any gaps in eras we have not claimed but should
		for (let e = lastEra - eraDepth; e < lastEra; e += 1) {
			if (claimedRewards.includes(e)) {
				continue;
			}

			await maybeUpdateValidators({
				api,
				checkEra: e,
				currBlockNumber,
				currEra: currEra.toNumber(),
				validatorsCache,
			});

			// Check they nominated that era
			if (validatorsCache[e]?.includes(stash)) {
				const payoutStakes = api.tx.staking.payoutStakers(stash, e);
				batch.push(payoutStakes);
			}
		}

		// Check from the last collected era up until current
		for (let e = lastEra + 1; e < currEra.toNumber(); e += 1) {
			await maybeUpdateValidators({
				api,
				checkEra: e,
				currBlockNumber,
				currEra: currEra.toNumber(),
				validatorsCache,
			});

			if (validatorsCache[e]?.includes(stash)) {
				// Get payouts for each era where payouts have not been claimed
				const payoutStakes = api.tx.staking.payoutStakers(stash, e);
				batch.push(payoutStakes);
			}
		}
	}

	if (!batch.length) {
		log.info('No txs to send');
		return;
	}

	// log.info(`Sending batch: ${JSON.stringify(batch, undefined, 2)}`);
	log.info(
		`Sending tx: \n${batch.map((t) =>
			JSON.stringify(t.method.toHuman(), undefined, 2)
		)}`
	);

	await signAndSendMaybeBatch(api, batch, suri);
}

/**
 * Get the validator set for a particular era, and update the `validatorsCache`
 * with that set. Does not do computation if validator set has already been fetched
 * for that era.
 *
 * N.B. Mutates validatorsCache in place
 *
 * @param param0
 * @returns Promise<void>
 */
async function maybeUpdateValidators({
	api,
	currEra,
	checkEra,
	currBlockNumber,
	validatorsCache,
}: {
	api: ApiPromise;
	currEra: number;
	checkEra: number;
	currBlockNumber: number;
	validatorsCache: ValidatorsCache;
}) {
	if (checkEra in validatorsCache) {
		// The validator set for the era has already been fetched
		return;
	}

	// We calculate a block in the era to get the validator set.
	// This calculation is imperfect at best due to the fact a decent number of slots
	// have no block authored.
	const eraDiff = currEra - checkEra;
	const slotsSinceEra = api.consts.babe.epochDuration.toNumber() * eraDiff;
	const aproxEraBlock = currBlockNumber - slotsSinceEra;

	const hash = await api.rpc.chain.getBlockHash(aproxEraBlock);
	validatorsCache[checkEra] = (
		await api.query.session.validators.at(hash)
	).map((valId) => valId.toString());
}

async function signAndSendMaybeBatch(
	api: ApiPromise,
	batch: SubmittableExtrinsic<'promise', ISubmittableResult>[],
	suri: string
) {
	const keyring = new Keyring();
	const signingKeys = keyring.addFromUri(suri, { type: 'sr25519' });
	try {
		let res;
		if (batch.length == 1) {
			res = await batch[0]?.signAndSend(signingKeys);
		} else if (batch.length > 1) {
			res = await api.tx.utility.batch(batch).signAndSend(signingKeys);
		}
		log.info(`Node response to tx:\n		${res}`);
	} catch (e) {
		log.error('Tx failed to sign and send');
		log.error(e);
	}
}
