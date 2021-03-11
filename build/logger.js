"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const winston_1 = require("winston");
exports.log = winston_1.createLogger({
    level: 'info',
    format: winston_1.format.combine(winston_1.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
    }), winston_1.format.errors({ stack: true }), winston_1.format.colorize({ all: true }), winston_1.format.simple()),
    transports: [new winston_1.transports.Console()],
    defaultMeta: { service: '@zekemostov/staking-payouts' },
});
//# sourceMappingURL=logger.js.map