import { Skill } from "../payload";
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
	skill: Skill,
) => Promise<EventHandler>;

class BuildableHandlerRouting {
	private handlers: Array<{
		eventType: EventType;
		name: string;
		skillName?: string;
		skillNamespace?: string;
		handler: EventHandler;
	}> = [];

	public withWebhook(
		handler: EventHandler,
		skillName?: string,
		skillNamespace?: string,
	): this {
		this.handlers.push({
			eventType: EventType.Webhoook,
			name: undefined,
			handler,
			skillName,
			skillNamespace,
		});
		return this;
	}

	public withSubscription(
		handler: EventHandler,
		name: string,
		skillName?: string,
		skillNamespace?: string,
	): this {
		this.handlers.push({
			eventType: EventType.Subscription,
			name,
			handler,
			skillName,
			skillNamespace,
		});
		return this;
	}

	public withSyncRequest(
		handler: EventHandler,
		name: string,
		skillName?: string,
		skillNamespace?: string,
	): this {
		this.handlers.push({
			eventType: EventType.SyncRequest,
			name,
			handler,
			skillName,
			skillNamespace,
		});
		return this;
	}

	public withValidation(
		handler: EventHandler,
		skillName?: string,
		skillNamespace?: string,
	): this {
		this.handlers.push({
			eventType: EventType.Validation,
			name: "validation",
			handler,
			skillName,
			skillNamespace,
		});
		return this;
	}

	public route(): HandlerRouting {
		return async (
			eventType: EventType,
			name: string,
			skill: Skill,
		): Promise<EventHandler> => {
			const entry = this.handlers.find(h => {
				return (
					h.eventType === eventType &&
					(!h.name || h.name === name) &&
					(!h.skillName || h.skillName === skill.name) &&
					(!h.skillNamespace || h.skillNamespace === skill.namespace)
				);
			});
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
