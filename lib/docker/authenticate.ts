/*
 * Copyright © 2022 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as os from "os";
import * as path from "path";

import {
	DockerRegistry,
	DockerRegistryType,
} from "../definition/subscription/common_types";
import { Contextual, EventContext } from "../handler/handler";
import { debug, warn } from "../log/index";
import { createFile } from "../tmp_fs";
import { replacer, toArray } from "../util";

export type ExtendedDockerRegistry = DockerRegistry & {
	serviceAccount: string;
	arn: string;
	externalId: string;
	region: string;
};

export async function doAuthed<T>(
	ctx: EventContext<any, any>,
	registries: Array<ExtendedDockerRegistry | ExtendedDockerRegistry[]>,
	cb: (
		registry: ExtendedDockerRegistry | ExtendedDockerRegistry[],
	) => Promise<T>,
): Promise<T> {
	let error;
	for (const registry of registries) {
		try {
			await authenticate(ctx, toArray(registry));
			const result = await cb(registry);
			return result;
		} catch (e) {
			warn(`Error running authenticated Docker operation: ${e.stack}`);
			error = e;
		}
	}
	if (error) {
		throw error;
	}
	return undefined;
}

export interface DefaultDockerCredentials {
	dockerhub?: {
		"username": string;
		"api-key": string;
		"global-username": string;
		"global-api-key": string;
	};
	github?: { "atomist-bot": { pat: string } };
}

export async function authenticate(
	ctx: EventContext<any, any & DefaultDockerCredentials>,
	registries: ExtendedDockerRegistry[],
): Promise<void> {
	if (process.env.ATOMIST_SKIP_DOCKER_AUTH) {
		return;
	}
	debug(
		`Authenticating using registries: ${JSON.stringify(
			registries,
			replacer,
			undefined,
		)}`,
	);
	const dockerConfig = {
		auths: {},
	} as any;
	if (registries?.length > 0) {
		for (const registry of registries.filter(r => !!r)) {
			const url = registry.serverUrl.split("/");
			switch (registry.type) {
				case DockerRegistryType.Ecr:
					dockerConfig.auths[url[0]] = {
						auth: await getEcrAccessToken(
							registry.arn,
							registry.externalId,
							registry.region,
						),
					};
					break;
				case DockerRegistryType.Gcr:
				case DockerRegistryType.Gar:
					if (registry.serviceAccount) {
						const token = await getGcrOAuthAccessToken(
							registry.serviceAccount,
							ctx,
						);
						dockerConfig.auths[url[0]] = {
							auth: Buffer.from(
								"oauth2accesstoken:" + token,
							)?.toString("base64"),
						};
					} else {
						dockerConfig.auths[url[0]] = {
							auth: Buffer.from(
								"_json_key:" + registry.secret,
							)?.toString("base64"),
						};
					}
					break;
				default:
					if (
						registry.serverUrl?.startsWith(
							"registry.hub.docker.com",
						) &&
						registry.username &&
						registry.secret
					) {
						dockerConfig.auths["https://index.docker.io/v1/"] = {
							auth: Buffer.from(
								registry.username + ":" + registry.secret,
							)?.toString("base64"),
						};
					} else {
						dockerConfig.auths[url[0]] = {
							auth: Buffer.from(
								registry.username + ":" + registry.secret,
							)?.toString("base64"),
						};
					}
					break;
			}
		}
	}
	// Add default creds
	if (
		ctx.configuration.parameters?.dockerhub &&
		!dockerConfig.auths["https://index.docker.io/v1/"]
	) {
		dockerConfig.auths["https://index.docker.io/v1/"] = {
			auth: Buffer.from(
				(ctx.configuration.parameters?.dockerhub.username ||
					ctx.configuration.parameters?.dockerhub[
						"global-username"
					]) +
					":" +
					(ctx.configuration.parameters?.dockerhub["api-key"] ||
						ctx.configuration.parameters?.dockerhub[
							"global-api-key"
						]),
			)?.toString("base64"),
		};
	}
	if (
		ctx.configuration.parameters?.github &&
		!dockerConfig.auths["ghcr.io"]
	) {
		dockerConfig.auths["ghcr.io"] = {
			auth: Buffer.from(
				"atomist-bot:" +
					ctx.configuration.parameters?.github["atomist-bot"].pat,
			)?.toString("base64"),
		};
	}
	const dockerConfigPath = path.join(os.homedir(), ".docker", "config.json");
	await createFile(ctx, {
		path: dockerConfigPath,
		content: JSON.stringify(dockerConfig, undefined, 2),
	});
}

export async function getGcrOAuthAccessToken(
	serviceAccount: string,
	ctx: Contextual<any, any>,
): Promise<string> {
	// 1. Obtain token from metadata service
	const accessToken = await (
		await ctx.http.request<{ access_token: string }>(
			"http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
			{ method: "GET", headers: { "Metadata-Flavor": "Google" } },
		)
	).json();

	// 2. Exchange token with oauth token for the passed service account
	const oauthAccessToken = await (
		await ctx.http.request<{ accessToken: string }>(
			`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
			{
				body: JSON.stringify({
					scope: "https://www.googleapis.com/auth/cloud-platform",
					lifetime: "1800s",
					delegates: ["atomist-bot@atomist.iam.gserviceaccount.com"],
				}),
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken.access_token}`,
				},
			},
		)
	).json();

	return oauthAccessToken.accessToken;
}

export async function getEcrAccessToken(
	arn: string,
	externalId: string,
	region: string,
): Promise<string> {
	const awsCreds = await retrieveAwsCreds();

	const stsClient = new (await import("@aws-sdk/client-sts")).STSClient({
		region,
		credentials: {
			accessKeyId: awsCreds.accessKeyId,
			secretAccessKey: awsCreds.secretAccessKey,
		},
	});
	const stsResponse = await stsClient.send(
		new (
			await import("@aws-sdk/client-sts")
		).AssumeRoleCommand({
			ExternalId: externalId,
			RoleArn: arn,
			RoleSessionName: "atomist",
		}),
	);

	const ecrClient = new (await import("@aws-sdk/client-ecr")).ECRClient({
		region,
		credentials: {
			accessKeyId: stsResponse.Credentials.AccessKeyId,
			secretAccessKey: stsResponse.Credentials.SecretAccessKey,
			sessionToken: stsResponse.Credentials.SessionToken,
		},
	});

	const ecrResponse = await ecrClient.send(
		new (
			await import("@aws-sdk/client-ecr")
		).GetAuthorizationTokenCommand({}),
	);
	return ecrResponse.authorizationData[0].authorizationToken;
}

export async function retrieveAwsCreds(): Promise<{
	awsAccountId: string;
	accessKeyId: string;
	secretAccessKey: string;
}> {
	const secretName = `projects/atomist-skill-production/secrets/aws-assume-role-creds/versions/latest`;
	const SecretManagerServiceClient = (
		await import("@google-cloud/secret-manager")
	).SecretManagerServiceClient;
	const client = new SecretManagerServiceClient();

	try {
		const [secret] = await client.accessSecretVersion({
			name: secretName,
		});
		return JSON.parse(Buffer.from(secret.payload.data).toString());
	} catch (e) {
		warn(`Failed to retrieve AWS creds: ${e.stack}`);
		return undefined;
	}
}
