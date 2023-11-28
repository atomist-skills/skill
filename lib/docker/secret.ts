import * as _ from "lodash";

import { DockerRegistry } from "../definition/subscription/common_types";
import { EventContext } from "../handler";
import { error } from "../log";
import { hash, isStaging } from "../util";

export async function storeRegistryCredentials(
	ctx: EventContext,
	registry: DockerRegistry,
): Promise<void> {
	const SecretManagerServiceClient = (
		await import("@google-cloud/secret-manager")
	).SecretManagerServiceClient;
	const client = new SecretManagerServiceClient();

	let hasSecret = false;
	try {
		const [secret] = await client.accessSecretVersion({
			name: `${getSecretVersionName(ctx, registry)}/versions/latest`,
		});
		hasSecret = true;
		const existingRegistry = JSON.parse(
			Buffer.from(secret.payload.data).toString(),
		);
		if (_.isEqual(existingRegistry, registry)) {
			return;
		}
	} catch (e) {
		// Intentionally left blank
	}

	try {
		if (!hasSecret) {
			await client.createSecret({
				parent: getProjectId(),
				secretId: getSecretName(ctx, registry),
				secret: {
					replication: {
						automatic: {},
					},
				},
			});
		}
		await client.addSecretVersion({
			parent: getSecretVersionName(ctx, registry),
			payload: {
				data: Buffer.from(JSON.stringify(registry)).toString("base64"),
			},
		});
	} catch (e) {
		error(`Failed to store Docker registry creds: ${e.stack}`);
	}
}

export async function retrieveRegistryCredentials(
	ctx: EventContext,
	registry: DockerRegistry,
): Promise<DockerRegistry> {
	const SecretManagerServiceClient = (
		await import("@google-cloud/secret-manager")
	).SecretManagerServiceClient;
	const client = new SecretManagerServiceClient();

	try {
		const [secret] = await client.accessSecretVersion({
			name: `${getSecretVersionName(ctx, registry)}/versions/latest`,
		});
		return JSON.parse(Buffer.from(secret.payload.data).toString());
	} catch (e) {
		// warn(`Failed to retrieve Docker registry creds: ${e.stack}`);
	}
	return registry;
}

function getProjectId(): string {
	if (isStaging()) {
		return "projects/atomist-skill-staging";
	} else {
		return "projects/atomist-skill-production";
	}
}

function getSecretName(ctx: EventContext, registry: DockerRegistry): string {
	const type = registry["docker.registry/type"];
	const url = registry["docker.registry/server-url"];
	const id = hash(`${type}-${url}`);
	return `global-skill-${ctx.event["workspace-id"]}-docker-registry-${id}`;
}

function getSecretVersionName(ctx: EventContext, registry: DockerRegistry) {
	return `${getProjectId()}/secrets/${getSecretName(ctx, registry)}`;
}
