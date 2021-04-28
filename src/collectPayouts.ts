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

	const payouts = [];
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
				payouts.push(payoutStakes);
			}
		}

		// Check from the last collected era up until current
		for (let e = lastEra + 1; e < currEra; e += 1) {
			if (await isValidatingInEra(api, stash, e)) {
				// Get payouts for each era where payouts have not been claimed
				const payoutStakes = api.tx.staking.payoutStakers(stash, e);
				payouts.push(payoutStakes);
			}
		}
	}

	if (!payouts.length) {
		log.info('No payouts to claim');
		return;
	}

	log.info(
		`Creating transasction(s) from the following payouts: \n${payouts
			.map((t) => JSON.stringify(t.method.toHuman(), undefined, 2))
			.toString()}`
	);

	await signAndSendTxs(api, payouts, suri);
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

async function signAndSendTxs(
	api: ApiPromise,
	payouts: SubmittableExtrinsic<'promise', ISubmittableResult>[],
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

	const { maxExtrinsic } = api.consts.system.blockWeights.perClass.normal;

	// Transactions to send. We will have multiple transactions if the batch
	// is too big
	const txs = [];

	while (payouts.length > 1) {
		const tempPayouts = [...payouts];

		let toHeavy = true;
		while (toHeavy) {
			const { weight: txWeight } = await api.tx.utility
				.batch(tempPayouts)
				.paymentInfo(signingKeys);

			if (txWeight.gte(maxExtrinsic)) {
				// If the tx weight is greater than the max allowed weight, try creating
				// a batch with one less payout
				tempPayouts.pop();
			} else {
				// If the tx wegith is under the max allowed weight don't remove any payouts
				toHeavy = false;
			}
		}

		if (tempPayouts.length) {
			// Add the batch we just created to the list of all the txs we will eventually send.
			txs.push(api.tx.utility.batch(tempPayouts));
		}
		// Remove the payouts that where included in the last created tx
		payouts = payouts.slice(tempPayouts.length);
	}

	if (payouts.length === 1) {
		txs.push(payouts[0]);
	}

	// Send all the transactions
	log.info(`Getting ready to send ${txs.length} transactions.`);
	for (const [i, tx] of txs.entries()) {
		log.info(
			`Sending ${tx.method.section}.${tx.method.method} (tx ${i}/${txs.length})`
		);
		try {
			const res = await tx.signAndSend(signingKeys);
			log.info(`Node response to tx: ${res.toString()}`);
		} catch (e) {
			log.error(`Tx failed to sign and send (tx ${i}/${txs.length})`);
			log.error(e);
		}
	}
}
