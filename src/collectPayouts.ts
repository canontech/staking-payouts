import { ApiPromise, Keyring } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { cryptoWaitReady } from '@polkadot/util-crypto';

import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

/**
 * Gather uncollected payouts for each validator, checking each era since there
 * last claimed payout, and creating a `batch` tx with `payoutStakers` txs.
 *
 * Additionally check `eraDepth` number of eras prior to the era of the last
 * claimed payout. This can help in the (potentially malicious) scenario where
 * someone may have claimed payouts for a recent era, but left some prior eras
 * with unclaimed rewards.
 *
 * If there are no payouts does not create tx.
 * If there is only one tx, it optimizes and just sends that lone tx.
 *
 *
 * @param collectionOptions
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
	const activeInfoOpt = await api.query.staking.activeEra();
	if (activeInfoOpt.isNone) {
		log.warn('ActiveEra is None, txs could not be completed.');
		return;
	}
	const currEra = activeInfoOpt.unwrap().index.toNumber();

	const batch = [];
	for (const stash of stashes) {
		// Get payouts for a validator
		const controllerOpt = await api.query.staking.bonded(stash);
		if (controllerOpt.isNone) {
			log.warn(`${stash} is not a valid stash address.`);
			continue;
		}
		const controller = controllerOpt.unwrap();

		const ledgerOpt = await api.query.staking.ledger(controller);
		if (ledgerOpt.isNone) {
			log.warn(`Staking ledger for ${stash} was not found.`);
			continue;
		}
		const ledger = ledgerOpt.unwrap();

		const { claimedRewards } = ledger;

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

			// Check they nominated that era
			if (await isValidatingInEra(api, stash, e)) {
				const payoutStakes = api.tx.staking.payoutStakers(stash, e);
				batch.push(payoutStakes);
			}
		}

		// Check from the last collected era up until current
		for (let e = lastEra + 1; e < currEra; e += 1) {
			if (await isValidatingInEra(api, stash, e)) {
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

	log.info(
		`Sending tx: \n${batch.map((t) =>
			JSON.stringify(t.method.toHuman(), undefined, 2)
		)}`
	);

	await signAndSendMaybeBatch(api, batch, suri);
}

async function isValidatingInEra(
	api: ApiPromise,
	stash: string,
	eraToCheck: number
): Promise<boolean> {
	try {
		const exposure = await api.query.staking.erasStakers(eraToCheck, stash);
		// If their total exposure is greater than 0 they are validating in the era.
		return exposure.total.toBn().gtn(0);
	} catch {
		return false;
	}
}

async function signAndSendMaybeBatch(
	api: ApiPromise,
	batch: SubmittableExtrinsic<'promise', ISubmittableResult>[],
	suri: string
) {
	await cryptoWaitReady();
	const keyring = new Keyring();
	const signingKeys = keyring.createFromUri(suri, {}, 'sr25519');
	DEBUG &&
		log.info(
			`Sender address: ${keyring.encodeAddress(
				signingKeys.address,
				api.registry.chainSS58
			)}`
		);

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
