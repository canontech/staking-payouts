"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectPayouts = void 0;
const api_1 = require("@polkadot/api");
async function collectPayouts({ url, seed, stashes, sessionSlots, eraDepth, }) {
    var _a, _b;
    const provider = new api_1.WsProvider(url);
    const api = await api_1.ApiPromise.create({
        provider,
    });
    const [currBlockHash, activeInfo] = await Promise.all([
        api.rpc.chain.getFinalizedHead(),
        api.query.staking.activeEra(),
    ]);
    if (activeInfo.isNone) {
        console.log('ActiveEra is None, txs could not be completed.');
        return;
    }
    const currEra = activeInfo.unwrap().index;
    const currBlockNumber = (await api.rpc.chain.getHeader(currBlockHash)).number.toNumber();
    const validatorsCache = {};
    const batch = [];
    for (const stash of stashes) {
        // Get payouts for a validator
        const _controller = await api.query.staking.bonded(stash);
        if (_controller.isNone) {
            console.log(`${stash} is not a valid stash address.`);
            continue;
        }
        const controller = _controller.unwrap();
        const _ledger = await api.query.staking.ledger(controller);
        if (_ledger.isNone) {
            console.log(`Staking ledger for ${stash} was not found.`);
            continue;
        }
        const ledger = _ledger.unwrap();
        const { claimedRewards } = ledger;
        console.log(`${stash} claimed rewards: ${claimedRewards.toString()}`);
        const lastEra = (_a = claimedRewards[claimedRewards.length - 1]) === null || _a === void 0 ? void 0 : _a.toNumber();
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
                    (await api.query.session.validators.at(hash)).map((valId) => valId.toString());
            // Check they nominated that era
            if ((_b = validatorsCache[e]) === null || _b === void 0 ? void 0 : _b.includes(stash)) {
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
    return batch;
}
exports.collectPayouts = collectPayouts;
//# sourceMappingURL=collectPayouts.js.map