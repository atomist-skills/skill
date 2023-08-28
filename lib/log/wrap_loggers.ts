import { Logger } from "./logger";

export function wrapLoggers(...loggers: Logger[]): Logger {
	return {
		debug(msg: string, ...parameters) {
			loggers.forEach(l => l.debug(msg, ...parameters));
		},
		info(msg: string, ...parameters) {
			loggers.forEach(l => l.info(msg, ...parameters));
		},
		warn(msg: string, ...parameters) {
			loggers.forEach(l => l.warn(msg, ...parameters));
		},
		error(msg: string, ...parameters) {
			loggers.forEach(l => l.error(msg, ...parameters));
		},
		async close() {
			await Promise.all(loggers.map(l => l.close()));
		},
	};
}
