#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
function main() {
    const { ws, stashesFile, stashes, keyFile, erasDepth } = yargs_1.default.options({
        ws: {
            alias: 'w',
            description: 'The API endpoint to connect to, e.g. wss://kusama-rpc.polkadot.io',
            string: true,
            demandOption: true,
        },
        stashesFile: {
            alias: 'sf',
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
        keyFile: {
            alias: 'kf',
            description: 'Path to .txt file containing private key URI.',
            string: true,
            demandOption: true,
        },
        erasDepth: {
            alias: 'ed',
            decription: 'How many eras prior to the last collected era to check for uncollected payouts.',
            number: true,
            demandOption: false,
            default: 0,
        },
    }).argv;
    if (!stashesFile && !stashes) {
        console.log('You must provide a list of stashes with the --stashes or --stashesFile opton.');
        return;
    }
    console.log(ws, keyFile, console.log(erasDepth));
}
main();
//# sourceMappingURL=index.js.map