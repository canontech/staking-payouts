/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ApiPromise, Keyring } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import { Option, Vec } from '@polkadot/types/codec';
import {
	AccountId,
	PalletStakingNominations,
} from '@polkadot/types/interfaces';
import { Codec, ISubmittableResult } from '@polkadot/types/types';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import BN from 'bn.js';

import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;
const MAX_CALLS = 9;

export interface ServiceArgs {
	api: ApiPromise;
	suri: string;
	stashes: string[];
	eraDepth: number;
	portion: number;
}

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
}: Omit<ServiceArgs, 'portion'>): Promise<void> {
	const payouts = await listPendingPayouts({
		stashes,
		eraDepth,
		api,
	});

	if (!payouts || !payouts.length) {
		log.info('No payouts to claim');
		return;
	}

	log.info(
		`Transactions are being created. This may take some time if there are many unclaimed eras.`
	);

	await signAndSendTxs(api, payouts, suri);
}

export async function listPendingPayouts({
	api,
	stashes,
	eraDepth,
}: Omit<ServiceArgs, 'suri' | 'portion'>): Promise<
	SubmittableExtrinsic<'promise', ISubmittableResult>[] | null
> {
	const activeInfoOpt = await api.query.staking.activeEra();
	if (activeInfoOpt.isNone) {
		log.warn('ActiveEra is None, pending payouts could not be fetched.');
		return null;
	}
	const currEra = activeInfoOpt.unwrap().index.toNumber();

	// Get all the validator address to get payouts for
	const validatorStashes = [];
	for (const stash of stashes) {
		const maybeNominations = await api.query.staking.nominators(stash);
		if (maybeNominations.isSome) {
			const targets = maybeNominations.unwrap().targets.map((a) => a.toHuman());
			DEBUG &&
				log.debug(
					`Nominator address detected: ${stash}. Adding its targets: ${targets.join(
						', '
					)}`
				);
			validatorStashes.push(...targets);
		} else {
			DEBUG && log.debug(`Validator address detected: ${stash}`);
			validatorStashes.push(stash);
		}
	}

	// Get pending payouts for the validator addresses
	const payouts = [];
	for (const stash of validatorStashes) {
		const controllerOpt = await api.query.staking.bonded(stash);
		if (controllerOpt.isNone) {
			log.warn(`${stash} is not a valid stash address.`);
			continue;
		}

		const controller = controllerOpt.unwrap();
		// Get payouts for a validator
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

	payouts.length &&
		log.info(
			`The following unclaimed payouts where found: \n${payouts
				.map(
					({ method: { section, method, args } }) =>
						`${section}.${method}(${
							args.map ? args.map((a) => `${a.toHuman()}`).join(', ') : args
						})`
				)
				.join('\n')}`
		) &&
		log.info(`Total of ${payouts.length} unclaimed payouts.`);

	return payouts;
}

export async function listLowestNominators({
	api,
	stashes,
	portion,
}: Omit<ServiceArgs, 'suri' | 'eraDepth'>): Promise<void> {
	const maxBackers = Math.floor(256 * portion);
	log.info(`Max backers per validator: ${maxBackers}`);

	const nominators = await api.query.staking.nominators.entries<
		Option<PalletStakingNominations>,
		[AccountId]
	>();

	// get the ledgers of all the nominators. Same ordering a s nominators array.
	const nomLedgers = await Promise.all(
		nominators.map(async ([[stashAccountId], _]) => {
			const cntOpt: Option<AccountId> = (await api.query.staking.bonded(
				stashAccountId
			)) as Option<AccountId>;

			if (cntOpt.isNone) {
				throw `Could not find controller for ${stashAccountId.toString()}`;
			}

			const cnt = cntOpt.unwrap().toString();
			return await api.query.staking.ledger(cnt);
		})
	);

	const stashNoms = new Map<string, [string, BN][]>();
	nominators.forEach(([nom, nomInfoOpt], index) => {
		if (nomInfoOpt.isNone) {
			return;
		}
		const targets = nomInfoOpt.unwrap().targets.map((a) => a.toString());
		const active = nomLedgers[index].unwrap().active;

		// go through each stash and check if this nominator backs them.
		stashes.forEach((s) => {
			if (!targets.includes(s)) {
				// if they don't back this stash, skip.
				return;
			}

			// they back this stash, so add them to the validats stashes array of backerss.
			const backers = stashNoms.get(s) || [];
			backers.push([nom.toString(), active.toBn()]);
			stashNoms.set(s, backers);
		});
	});

	for (const val of Object.keys(stashNoms)) {
		const backers = stashNoms.get(val);
		if (!backers) {
			continue;
		}

		// sort in descending order
		backers?.sort((a, b) => b[1].sub(a[1]).toNumber());
		const backersToKick = backers?.slice(maxBackers);

		log.info(`Nominations to remove from validator ${val}`);
		backersToKick.forEach((n) => {
			log.info(`Nominator: ${n[0]}, ${n[1].toString(10)}`);
		});
	}
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

	const maxExtrinsic =
		api.consts.system.blockWeights.perClass.normal.maxExtrinsic.unwrap().toBn();
	// Assume most of the time we want batches of size 8. Below we check if that is
	// to big, and if it is we reduce the number of calls in each batch until it is
	// below the max allowed weight.
	// Note: 8 may need to be adjusted in the future - can look into adding a CLI flag.
	const byMaxCalls = payouts.reduce((byMaxCalls, tx, idx) => {
		if (idx % MAX_CALLS === 0) {
			byMaxCalls.push([]);
		}
		byMaxCalls[byMaxCalls.length - 1].push(tx);

		return byMaxCalls;
	}, [] as SubmittableExtrinsic<'promise'>[][]);

	// We will create multiple transactions if the batch is too big.
	const txs = [];
	while (byMaxCalls.length) {
		const calls = byMaxCalls.shift();
		if (!calls) {
			// Shouldn't be possible, but this makes tsc happy
			break;
		}

		let toHeavy = true;
		while (toHeavy) {
			const batch = api.tx.utility.batch(calls);
			const { weight } = await batch.paymentInfo(signingKeys);
			if (weight.muln(batch.length).gte(maxExtrinsic)) {
				// Remove a call from the batch since it will get rejected for exhausting resources.
				const removeTx = calls.pop();
				if (!removeTx) {
					// `removeTx` is undefined, which shouldn't happen and means we can't even
					// fit one call into a batch.
					toHeavy = false;
				} else if (
					!byMaxCalls[byMaxCalls.length - 1] ||
					byMaxCalls[byMaxCalls.length - 1].length >= MAX_CALLS
				) {
					// There is either no subarray of txs left OR the subarray at the front is greater
					// then the max size we want, so we create a new subarray.
					byMaxCalls.push([removeTx]);
				} else {
					// Add the removed tx to the last subarray, which at this point only has
					// other remvoed txs.
					byMaxCalls[byMaxCalls.length - 1].push(removeTx);
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

	DEBUG &&
		log.debug(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
			`Calls per tx ${txs
				.map((t) =>
					t.method.method.toLowerCase() == 'batch'
						? (t.args[0] as Vec<Codec>).length
						: 1
				)
				.toString()}`
		);

	// Send all the transactions
	log.info(`Getting ready to send ${txs.length} transactions.`);
	for (const [i, tx] of txs.entries()) {
		log.info(
			`Sending ${tx.method.section}.${tx.method.method} (tx ${i + 1}/${
				txs.length
			})`
		);

		DEBUG &&
			tx.method.method.toLowerCase() === 'batch' &&
			log.debug(
				`${tx.method.section}.${tx.method.method} has ${
					(tx.method.args[0] as unknown as [])?.length
				} calls`
			);

		try {
			const res = await tx.signAndSend(signingKeys, { nonce: -1 });
			log.info(`Node response to tx: ${res.toString()}`);
		} catch (e) {
			log.error(`Tx failed to sign and send (tx ${i + 1}/${txs.length})`);
			throw e;
		}
	}
}
