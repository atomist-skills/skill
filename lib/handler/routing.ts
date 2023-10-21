import { EventHandler } from "./handler";

export enum EventType {
	Webhoook = "webhook",
	Subscription = "subscription",
	SyncRequest = "sync-request",
	Validation = "validation",
}

export type HandlerRouting = (
	eventType: EventType,
	name: string,
) => Promise<EventHandler>;

class BuildableHandlerRouting {
	private handlers: Array<{
		eventType: EventType;
		name: string;
		handler: EventHandler;
	}> = [];

	public withWebhook(name: string, handler: EventHandler): this {
		this.handlers.push({
			eventType: EventType.Webhoook,
			name,
			handler,
		});
		return this;
	}

	public withSubscription(name: string, handler: EventHandler): this {
		this.handlers.push({
			eventType: EventType.Subscription,
			name,
			handler,
		});
		return this;
	}

	public withSyncRequest(name: string, handler: EventHandler): this {
		this.handlers.push({
			eventType: EventType.SyncRequest,
			name,
			handler,
		});
		return this;
	}

	public withValidation(name: string, handler: EventHandler): this {
		this.handlers.push({
			eventType: EventType.Validation,
			name,
			handler,
		});
		return this;
	}

	public route(): HandlerRouting {
		return async (
			eventType: EventType,
			name: string,
		): Promise<EventHandler> => {
			const entry = this.handlers.find(
				h => h.eventType === eventType && h.name === name,
			);
			if (entry) {
				return entry.handler;
			} else {
				throw new Error(`No ${eventType} handler found for '${name}'`);
			}
		};
	}
}

export function handlerRouting(): BuildableHandlerRouting {
	return new BuildableHandlerRouting();
}
