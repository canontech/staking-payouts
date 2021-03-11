import { createLogger, format, transports } from 'winston';

const myFormat = format.printf(({ level, message, label, timestamp }) => {
	return `${timestamp} [${label}] ${level}: ${message}`;
});

export const log = createLogger({
	level: 'info',
	format: format.combine(
		format.label({ label: 'payouts' }),
		format.timestamp({
			format: 'YYYY-MM-DD HH:mm:ss',
		}),
		format.errors({ stack: true }),
		format.colorize({ all: false }),
		myFormat
	),
	transports: [new transports.Console()],
});
