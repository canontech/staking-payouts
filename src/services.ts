/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { ApiPromise, Keyring } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import { Option, Vec } from '@polkadot/types/codec';
import { u32 } from '@polkadot/types/primitive';
import {
	AccountId,
	ActiveEraInfo,
	Balance,
	Exposure,
	EraRewardPoints,
	StakingLedger,
	Nominations,
	ValidatorPrefs,
} from '@polkadot/types/interfaces';
import { Codec, ISubmittableResult } from '@polkadot/types/types';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import BN from 'bn.js';

import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;
const MAX_CALLS = 3;

export interface ServiceArgs {
	api: ApiPromise;
	suri: string;
	stashes: string[];
	eraDepth: number;
}

interface NominatorInfo {
	nominatorId: string;
	voteWeight: Balance;
	targets: string[];
}

type NominatorWeight = Omit<NominatorInfo, 'targets'>;
type NominatorTargets = Omit<NominatorInfo, 'voteWeight'>;

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
}: ServiceArgs): Promise<void> {
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

export async function payoutClaimedForAddressForEra(api: ApiPromise, stashAddress: string, eraIndex: number): Promise<boolean> {
	const claimed = (await api.query.staking.claimedRewards<Vec<u32>>(eraIndex, stashAddress)).length > 0;
	if (claimed) {
		// payout already issued
		return true;
	}
	const exposureForEra = await api.query.staking.erasStakersOverview<Option<any>>(eraIndex, stashAddress);
	return exposureForEra.isNone;
}

export async function listPendingPayouts({
	api,
	stashes,
	eraDepth,
}: Omit<ServiceArgs, 'suri'>): Promise<
	SubmittableExtrinsic<'promise', ISubmittableResult>[] | null
> {
	const activeInfoOpt = await api.query.staking.activeEra<
		Option<ActiveEraInfo>
	>();
	if (activeInfoOpt.isNone) {
		log.warn('ActiveEra is None, pending payouts could not be fetched.');
		return null;
	}
	const currEra = activeInfoOpt.unwrap().index.toNumber();

	// Get all the validator address to get payouts for
	const validatorStashes = [];
	for (const stash of stashes) {
		const maybeNominations = await api.query.staking.nominators<
			Option<Nominations>
		>(stash);
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
		const controllerOpt = await api.query.staking.bonded<Option<AccountId>>(
			stash
		);
		if (controllerOpt.isNone) {
			log.warn(`${stash} is not a valid stash address.`);
			continue;
		}

		const controller = controllerOpt.unwrap();
		// Check for unclaimed payouts from `current-eraDepth` to `current` era
		// The current era is not claimable. Therefore we need to substract by 1.
		for (let e = (currEra - 1) - eraDepth; e < (currEra - 1); e++) {
			const payoutClaimed = await payoutClaimedForAddressForEra(api, controller.toString(), e);
			if (payoutClaimed) {
				continue;
			}
			// Check if they received points that era
			if (await hasEraPoints(api, stash, e)) {
				const payoutStakes = api.tx.staking.payoutStakers(stash, e);
				payouts.push(payoutStakes);
			}
		}
	}

	if (payouts.length) {
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
	} else {
		log.info(`No payouts found.`)
	}

	return payouts;
}

export async function listNominators({
	api,
	stashes,
}: Omit<ServiceArgs, 'suri' | 'eraDepth'>): Promise<void> {
	log.info('Querrying for nominators ...');
	// Query for the nominators and make the data easy to use
	const nominatorEntries = await api.query.staking.nominators.entries<
		Option<Nominations>,
		[AccountId]
	>();
	const nominatorWithTargets = nominatorEntries
		.filter(([_, noms]) => {
			return noms.isSome && noms.unwrap().targets?.length;
		})
		.map(([key, noms]) => {
			return {
				nominatorId: key.args[0].toHuman(),
				targets: noms.unwrap().targets.map((a) => a.toHuman()),
			};
		});

	// Create a map of validator stash to arrays. The arrays will eventually be filled with nominators
	// backing them.
	const validatorMap = stashes.reduce((acc, cur) => {
		acc[cur] = [];
		return acc;
	}, {} as Record<string, NominatorWeight[]>);

	// Find the nominators who are backing the given stashes
	const nominatorsBackingOurStashes = nominatorWithTargets.reduce(
		(acc, { nominatorId, targets }) => {
			for (const val of targets) {
				if (validatorMap[val] !== undefined) {
					acc.push({ nominatorId, targets });
					return acc;
				}
			}

			return acc;
		},
		[] as NominatorTargets[]
	);

	log.info('Querrying for the ledgers of nominators ...');
	// Query for the ledgers of the nominators we care about
	const withLedgers = await Promise.all(
		nominatorsBackingOurStashes.map(({ nominatorId, targets }) =>
			api.query.staking
				.bonded<Option<AccountId>>(nominatorId)
				.then((controller) => {
					if (controller.isNone) {
						log.warn(
							`An error occured while unwrapping the controller for ${nominatorId}. ` +
								'Please file an issue at: https://github.com/canontech/staking-payouts/issues'
						);
						process.exit(1);
					}
					return api.query.staking
						.ledger<Option<StakingLedger>>(controller.unwrap().toHex())
						.then((ledger) => {
							if (ledger.isNone) {
								log.warn(
									`An error occured while unwrapping a ledger for ${nominatorId}. ` +
										'Please file an issue at: https://github.com/canontech/staking-payouts/issues'
								);
								process.exit(1);
							}
							return {
								voteWeight: ledger.unwrap().active.unwrap(),
								nominatorId,
								targets,
							};
						});
				})
		)
	);

	log.info('Finishing up some final computation ...');

	// Add the nominators to the `validatorMap`
	withLedgers.reduce((acc, { nominatorId, targets, voteWeight }) => {
		for (const validator of targets) {
			if (acc[validator]) {
				acc[validator].push({ nominatorId, voteWeight });
			}
		}

		return acc;
	}, validatorMap);

	// Sort the nominators in place and print them out
	Object.entries(validatorMap).forEach(([validator, nominators]) => {
		const nominatorsDisplay = nominators
			.sort((a, b) => a.voteWeight.cmp(b.voteWeight))
			.reverse()
			.reduce((acc, { nominatorId, voteWeight }, index) => {
				const start = `${index}) `.padStart(8, ' ');
				const middle = `${nominatorId},`.padEnd(50, ' ');
				return acc + start + middle + `${voteWeight.toHuman()}\n`;
			}, '');

		log.info(
			`\nValidator ${validator} has the following nominations:\n` +
				nominatorsDisplay
		);
	});
}

export async function commissionData(
	api: ApiPromise,
	mid: number
): Promise<void> {
	const tenMillion = new BN(10_000_000);
	const midPer = new BN(mid).mul(tenMillion);

	const validators = await api.query.staking.validators.entries<
		ValidatorPrefs,
		[AccountId]
	>();

	const activeInfoOpt = await api.query.staking.activeEra<
		Option<ActiveEraInfo>
	>();
	if (activeInfoOpt.isNone) {
		process.exit(1);
	}
	const currEra = activeInfoOpt.unwrap().index.toNumber() - 2;

	const greaterThanOrBlockedActive = [];
	const greaterThanOrBlockedWaiting = [];
	const lessThanActive = [];
	const lessThanWaiting = [];
	let sum = new BN(0);

	// For each validator determine if they are in the active set
	const withStatus = await Promise.all(
		validators.map(([valIdKey, prefs]) => {
			const commission = prefs.commission.unwrap();
			const valId = valIdKey.args[0].toString();

			sum = sum.add(commission);
			return isValidatingInEra(api, valId, currEra).then((isActive) => {
				return { isActive, valId, prefs };
			});
		})
	);

	// Go through validators and determine if their commision is greter than or less than than the
	// given commission (`mid`)
	withStatus.forEach((cur) => {
		const { prefs, isActive } = cur;
		const commission = prefs.commission.unwrap();
		sum = sum.add(commission);

		if (prefs.blocked.isTrue || commission.gt(midPer)) {
			if (isActive) {
				greaterThanOrBlockedActive.push(commission);
			} else {
				greaterThanOrBlockedWaiting.push(commission);
			}
		} else {
			if (isActive) {
				lessThanActive.push(commission);
			} else {
				lessThanWaiting.push(commission);
			}
		}
	});

	const sortedCommision = validators
		.map(([_, prefs]) => prefs.commission.unwrap())
		.sort((a, b) => a.cmp(b));
	const mean = sortedCommision[sortedCommision.length / 2];
	const allAvg = sum.div(new BN(validators.length));

	log.info(`average (floor): ${allAvg.div(tenMillion)}%`);
	log.info(`mean (floor): ${mean.div(tenMillion)}%`);
	log.info(
		`active validators blocked or commission > ${mid}%: ${greaterThanOrBlockedActive.length}`
	);
	log.info(
		`active validators with commission <= ${mid}%: ${lessThanActive.length}`
	);
	log.info(
		`waiting validators blocked or commission > ${mid}%: ${greaterThanOrBlockedWaiting.length}`
	);
	log.info(
		`waiting validators with commission <= ${mid}%: ${lessThanWaiting.length}`
	);
}

async function isValidatingInEra(
	api: ApiPromise,
	stash: string,
	eraToCheck: number
): Promise<boolean> {
	try {
		const exposure = await api.query.staking.erasStakers<Exposure>(
			eraToCheck,
			stash
		);
		// If their total exposure is greater than 0 they are validating in the era.
		return exposure.total.toBn().gtn(0);
	} catch {
		return false;
	}
}

async function hasEraPoints(
	api: ApiPromise,
	stash: string,
	eraToCheck: number
): Promise<boolean> {
	try {
		const rewardpoints =
			await api.query.staking.erasRewardPoints<EraRewardPoints>(eraToCheck);
		let found = false;
		rewardpoints.individual.forEach((_record, validator) => {
			if (stash === validator.toString()) found = true;
		});
		return found;
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

	// Create batch calls of size `MAX_CALLS` or less
	const txs = payouts
		.reduce((byMaxCalls, tx, idx) => {
			if (idx % MAX_CALLS === 0) {
				byMaxCalls.push([]);
			}
			byMaxCalls[byMaxCalls.length - 1].push(tx);

			return byMaxCalls;
		}, [] as SubmittableExtrinsic<'promise'>[][])
		.map((payoutTxs) => api.tx.utility.batch(payoutTxs));

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
