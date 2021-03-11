import { ApiPromise, Keyring, WsProvider } from '@polkadot/api';
import { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import { ISubmittableResult } from '@polkadot/types/types';

import { log } from './logger';

const DEBUG = process.env.PAYOUTS_DEBUG;

export async function collectPayouts({
	url,
	uri,
	stashes,
	sessionSlots,
	eraDepth,
}: {
	url: string;
	uri: string;
	stashes: string[];
	sessionSlots: number;
	eraDepth: number;
}): Promise<void> {
	const provider = new WsProvider(url);
	const api = await ApiPromise.create({
		provider,
	});

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

	const validatorsCache: Record<number, string[]> = {};
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
		DEBUG && log.info(`${stash} claimed rewards: ${claimedRewards.toString()}`);

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

			// yes this is a super sketch calc, but idk how to do it better
			const aproxEraBlock = currBlockNumber - sessionSlots * e;
			const hash = await api.rpc.chain.getBlockHash(aproxEraBlock);
			validatorsCache[e] =
				validatorsCache[e] ||
				(await api.query.session.validators.at(hash)).map((valId) =>
					valId.toString()
				);

			// Check they nominated that era
			if (validatorsCache[e]?.includes(stash)) {
				const payoutStakes = api.tx.staking.payoutStakers(stash, e);
				batch.push(payoutStakes);
			}
		}

		// Check from the last collected era up until current
		for (let e = lastEra + 1; e < currEra.toNumber(); e += 1) {
			// Get payouts for each era where payouts have not been claimed
			const payoutStakes = api.tx.staking.payoutStakers(stash, e);
			batch.push(payoutStakes);
		}
	}

	if (!batch.length) {
		log.info('No txs to send');
		return;
	}

	await signAndSendMaybeBatch(api, batch, uri);
}

async function signAndSendMaybeBatch(
	api: ApiPromise,
	batch: SubmittableExtrinsic<'promise', ISubmittableResult>[],
	uri: string
) {
	const keyring = new Keyring();
	const signingKeys = keyring.addFromUri(uri, { type: 'sr25519' });
	try {
		let res;
		if (batch.length == 1) {
			res = await batch[0]?.signAndSend(signingKeys);
		} else if (batch.length > 1) {
			res = await api.tx.utility.batch(batch).signAndSend(signingKeys);
		}
		log.info('Node response to tx: ', res);
	} catch (e) {
		log.error('Tx failed to sign and send');
		log.error(e);
	}
}
