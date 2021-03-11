import { ApiPromise } from '@polkadot/api';
/**
 *
 * @param param0
 * @returns Promise<void>
 */
export declare function collectPayouts({ api, suri, stashes, eraDepth, }: {
    api: ApiPromise;
    suri: string;
    stashes: string[];
    eraDepth: number;
}): Promise<void>;
