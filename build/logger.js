"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const winston_1 = require("winston");
const myFormat = winston_1.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
});
exports.log = winston_1.createLogger({
    level: 'info',
    format: winston_1.format.combine(winston_1.format.label({ label: 'payouts' }), winston_1.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
    }), winston_1.format.errors({ stack: true }), winston_1.format.colorize({ all: false }), myFormat),
    transports: [new winston_1.transports.Console()],
});
//# sourceMappingURL=logger.js.map