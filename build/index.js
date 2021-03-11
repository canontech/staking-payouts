#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const fs_1 = __importDefault(require("fs"));
const yargs_1 = __importDefault(require("yargs"));
const collectPayouts_1 = require("./collectPayouts");
const logger_1 = require("./logger");
const DEBUG = process.env.PAYOUTS_DEBUG;
async function main() {
    const { ws, stashesFile, stashes, suriFile, eraDepth } = yargs_1.default.options({
        ws: {
            alias: 'w',
            description: 'The API endpoint to connect to, e.g. wss://kusama-rpc.polkadot.io',
            string: true,
            demandOption: true,
        },
        stashesFile: {
            alias: 'S',
            description: 'Path to .json file containing an array of the stash addresses to call payouts for.',
            string: true,
            demandOption: false,
        },
        stashes: {
            alias: 's',
            description: 'Array of stash addresses to call payouts for. Required if not using stashesFile.',
            array: true,
            demandOption: false,
        },
        suriFile: {
            alias: 'u',
            description: 'Path to .txt file containing private key seed.',
            string: true,
            demandOption: true,
        },
        eraDepth: {
            alias: 'e',
            decription: 'How many eras prior to the last collected era to check for uncollected payouts.',
            number: true,
            demandOption: false,
            default: 0,
        },
    }).argv;
    DEBUG && logger_1.log.info('suriFile: ', suriFile);
    const suriData = fs_1.default.readFileSync(suriFile, 'utf-8');
    const suri = suriData.split(/|r?\n/)[0];
    if (!suri) {
        logger_1.log.error('No suri could be read in from file.');
        return;
    }
    let stashesParsed;
    if (stashesFile) {
        const stashesData = fs_1.default.readFileSync(stashesFile);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        stashesParsed = JSON.parse(stashesData);
        if (Array.isArray(stashesParsed)) {
            console.error('The stash addresses must be in a JSON file as an array.');
        }
    }
    else if (Array.isArray(stashes)) {
        stashesParsed = stashes;
    }
    else {
        logger_1.log.error('You must provide a list of stashes with the --stashes or --stashesFile opton.');
        return;
    }
    const provider = new api_1.WsProvider(ws);
    const api = await api_1.ApiPromise.create({
        provider,
    });
    await collectPayouts_1.collectPayouts({
        api,
        suri,
        stashes: stashesParsed,
        eraDepth,
    });
}
main()
    .catch(console.log)
    .finally(() => {
    logger_1.log.info('Exiting ...');
    process.exit(1);
});
//# sourceMappingURL=index.js.map