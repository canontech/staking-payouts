import { isHex } from '@polkadot/util';
import { keyExtractSuri, mnemonicValidate } from '@polkadot/util-crypto';

import { log } from './logger';

const SEED_LENGTHS = [12, 15, 18, 21, 24];

/**
 * Validate a mnemonic or hex seed.
 *
 * @source https://github.com/polkadot-js/tools/blob/31375f26804f5e3658d55981ff4531d3e5d77517/packages/signer-cli/src/cmdSign.ts#L14-L31
 */
export function isValidSeed(suri: string): boolean {
	const { phrase } = keyExtractSuri(suri);

	if (isHex(phrase)) {
		if (!isHex(phrase, 256)) {
			log.error('Hex seed needs to be 256-bits');
			return false;
		}
	} else {
		if (!SEED_LENGTHS.includes((phrase as string).split(' ').length)) {
			log.error(`Mnemonic needs to contain ${SEED_LENGTHS.join(', ')} words`);
			return false;
		}

		if (!mnemonicValidate(phrase)) {
			log.error('Not a valid mnemonic seed');
			return false;
		}
	}

	return true;
}
