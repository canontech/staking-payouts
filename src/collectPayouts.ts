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
	log.info(`Total of ${payouts.length} payouts.`);
	log.info(
		`Transactions are being created. This may take some time if there are many unclaimed eras.`
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
		log.debug(
			`Sender address: ${keyring.encodeAddress(
				signingKeys.address,
				api.registry.chainSS58
			)}`
		);

	const { maxExtrinsic } = api.consts.system.blockWeights.perClass.normal;
	// Assume most of the time we want batches of size 8. Below we check if that is
	// to big, and if it is we reduce the number of calls in each batch until it is
	// below the max allowed weight.
	const by8 = payouts.reduce((by8, tx, idx) => {
		if (idx % 8 === 0) {
			by8.push([]);
		}
		by8[by8.length - 1].push(tx);

		return by8;
	}, [] as SubmittableExtrinsic<'promise'>[][]);

	// We will have multiple transactions if the batch is too big.
	const txs = [];
	while (by8.length) {
		const calls = by8.pop();
		if (!calls) {
			break;
		}

		let toHeavy = true;
		while (toHeavy) {
			const batch = api.tx.utility.batch(calls);
			const { weight } = await batch.paymentInfo(signingKeys);
			if (weight.muln(batch.length).gte(maxExtrinsic)) {
				const removeTx = calls.pop();
				if (!removeTx) {
					// calls is empty, something strange happened and we can stop trying.
					toHeavy = false;
				} else if (!by8[0] || by8[0].length >= 8) {
					// There is either no subarray of txs left OR the subarray at the front is greater
					// then the max size we want, so we create a new subarray.
					by8.unshift([removeTx]);
				} else {
					by8[0].push(removeTx);
				}
			} else {
				toHeavy = false;
			}
		}

		if (calls.length == 1) {
			txs.push(calls[0]);
		} else if (calls.length > 1) {
			txs.push(api.tx.utility.batch(calls));
		}
	}

	// Send all the transactions
	log.info(`Getting ready to send ${txs.length} transactions.`);
	for (const [i, tx] of txs.entries()) {
		log.info(
			`Sending ${tx.method.section}.${tx.method.method} (tx ${i + 1}/${
				txs.length
			})`
		);
		DEBUG &&
			log.debug(
				`${tx.method.section}.${tx.method.method} has ${
					((tx.method.args[0] as unknown) as [])?.length
				} calls`
			);
		try {
			const res = await tx.signAndSend(signingKeys);
			log.info(`Node response to tx: ${res.toString()}`);
		} catch (e) {
			log.error(`Tx failed to sign and send (tx ${i + 1}/${txs.length})`);
			log.error(e);
		}
	}
}
