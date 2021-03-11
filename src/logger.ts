import { createLogger, format, transports } from 'winston';

export const log = createLogger({
	level: 'info',
	format: format.combine(
		format.timestamp({
			format: 'YYYY-MM-DD HH:mm:ss',
		}),
		format.errors({ stack: true }),
		format.colorize({ all: true }),
		format.simple()
	),
	transports: [new transports.Console()],
	defaultMeta: { service: '@zekemostov/staking-payouts' },
});
