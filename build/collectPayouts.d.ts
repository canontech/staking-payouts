import { ApiPromise } from '@polkadot/api';
export declare function collectPayouts({ api, suri, stashes, eraDepth, }: {
    api: ApiPromise;
    suri: string;
    stashes: string[];
    eraDepth: number;
}): Promise<void>;
