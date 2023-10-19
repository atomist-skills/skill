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

import { ECRClient } from "@aws-sdk/client-ecr";
import { ECRPUBLICClient } from "@aws-sdk/client-ecr-public";
import { AssumeRoleCommandOutput } from "@aws-sdk/client-sts";
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
	github?: { "atomist-bot": { pat: string } };
}

export async function authenticate(
	ctx: EventContext<any, DefaultDockerCredentials>,
	registries: DockerRegistry[],
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
			const url = registry["docker.registry/server-url"].split("/");
			switch (registry["docker.registry/type"]) {
				case DockerRegistryType.Ecr:
					dockerConfig.auths[url[0]] = {
						auth: await getEcrAccessToken(
							registry["docker.registry.ecr/arn"],
							registry["docker.registry.ecr/external-id"],
							registry["docker.registry.ecr/region"],
						),
					};
					break;
				case DockerRegistryType.Gcr:
				case DockerRegistryType.Gar:
					if (
						registry["docker.registry.gcr/service-account"] ||
						registry["docker.registry.gar/service-account"]
					) {
						const token = await getGcrOAuthAccessToken(
							registry["docker.registry.gcr/service-account"] ||
								registry["docker.registry.gar/service-account"],
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
								"_json_key:" +
									registry["docker.registry/secret"],
							)?.toString("base64"),
						};
					}
					break;
				default:
					if (
						registry["docker.registry/server-url"]?.startsWith(
							"registry.hub.docker.com",
						) &&
						registry["docker.registry/username"] &&
						registry["docker.registry/secret"]
					) {
						dockerConfig.auths["https://index.docker.io/v1/"] = {
							auth: Buffer.from(
								registry["docker.registry/username"] +
									":" +
									registry["docker.registry/secret"],
							)?.toString("base64"),
						};
					} else {
						dockerConfig.auths[url[0]] = {
							auth: Buffer.from(
								registry["docker.registry/username"] +
									":" +
									registry["docker.registry/secret"],
							)?.toString("base64"),
						};
					}
					break;
			}
		}
	}
	// Add default creds
	/*if (
                          ctx.configuration.parameters?.github &&
                          !dockerConfig.auths["ghcr.io"]
                      ) {
                          dockerConfig.auths["ghcr.io"] = {
                              auth: Buffer.from(
                                  "atomist-bot:" +
                                      ctx.event.skill.configuration?.github["atomist-bot"].pat,
                              )?.toString("base64"),
                          };
                      }*/
	const dockerConfigPath = path.join(os.homedir(), ".docker", "config.json");
	await createFile(ctx, {
		path: dockerConfigPath,
		content: JSON.stringify(dockerConfig, undefined, 2),
	});
}

export async function getGcrOAuthAccessToken(
	serviceAccount: string,
	ctx: Contextual,
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

export async function getEcrClient(
	arn: string,
	externalId: string,
	region: string,
): Promise<ECRClient> {
	const stsResponse = await getStsToken(arn, externalId, region);

	const ecrClient = new (await import("@aws-sdk/client-ecr")).ECRClient({
		region,
		credentials: {
			accessKeyId: stsResponse.Credentials.AccessKeyId,
			secretAccessKey: stsResponse.Credentials.SecretAccessKey,
			sessionToken: stsResponse.Credentials.SessionToken,
		},
	});
	return ecrClient;
}

export async function getEcrPublicClient(
	arn: string,
	externalId: string,
	region: string,
): Promise<ECRPUBLICClient> {
	const stsResponse = await getStsToken(arn, externalId, region);

	const ecrClient = new (
		await import("@aws-sdk/client-ecr-public")
	).ECRPUBLICClient({
		region,
		credentials: {
			accessKeyId: stsResponse.Credentials.AccessKeyId,
			secretAccessKey: stsResponse.Credentials.SecretAccessKey,
			sessionToken: stsResponse.Credentials.SessionToken,
		},
	});
	return ecrClient;
}

async function getStsToken(
	arn: string,
	externalId: string,
	region: string,
): Promise<AssumeRoleCommandOutput> {
	const awsCreds = await retrieveAwsCreds();

	const stsClient = new (await import("@aws-sdk/client-sts")).STSClient({
		region,
		credentials: {
			accessKeyId: awsCreds.accessKeyId,
			secretAccessKey: awsCreds.secretAccessKey,
		},
	});
	return await stsClient.send(
		new (
			await import("@aws-sdk/client-sts")
		).AssumeRoleCommand({
			ExternalId: externalId,
			RoleArn: arn,
			RoleSessionName: "atomist",
		}),
	);
}

export async function getEcrAccessToken(
	arn: string,
	externalId: string,
	region: string,
): Promise<string> {
	const ecrResponse = await (
		await getEcrClient(arn, externalId, region)
	).send(
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
