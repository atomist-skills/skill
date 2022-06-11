/*
 * Copyright © 2021 Atomist, Inc.
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

import * as assert from "power-assert";

import { processEvent, processWebhook } from "../lib/function";
import { transform, wrapEventHandler } from "../lib/handler/index";
import { success } from "../lib/status";
import { guid } from "../lib/util";

describe("function", () => {
	describe("processEvent", () => {
		it("should execute datalog subscription handler", async () => {
			const payload = {
				correlation_id: guid(),
				subscription: {
					name: "check-complete",
					result: [
						[
							{
								"schema/entity-type": "git/commit",
								"git.commit/sha": "123456",
							},
						],
					],
				},
				team_id: "123456",
				type: "not sure what goes here",
				secrets: [
					{
						uri: "atomist://api-key",
						value: "123456",
					},
				],
				skill: {
					namespace: "atomist",
					name: "container-run-skill",
					id: "70b0b9cf-737b-4c61-b90c-c47f461d8615",
					version: "2.1.9-75",
					configuration: {
						name: "sonarcloud",
						enabled: true,
						resourceProviders: [
							{
								name: "github",
								typeName: "GitHubAppResourceProvider",
								selectedResourceProviders: [
									{
										id: "AK748NQC5_75b34148-c780-4cdb-a641-d4c34b74515e",
									},
								],
							},
							{
								name: "secret",
								typeName: "SecretProvider",
								selectedResourceProviders: [
									{
										id: "AK748NQC5_d35537a0-9c72-4b23-81ea-96de97d79d5e",
									},
								],
							},
						],
						parameters: [
							{
								name: "env_map",
								value: '[{"name":"SONAR_TOKEN","secret":"AK748NQC5_d35537a0-9c72-4b23-81ea-96de97d79d5e"}]',
							},
							{
								name: "subscription_filter",
								value: ["onPush"],
							},
							{
								name: "docker_image",
								value: "sonarsource/sonar-scanner-cli:4.4",
							},
							{
								name: "docker_command",
								value: "/usr/bin/entrypoint.sh sonar-scanner -Dsonar.host.url=https://sonarcloud.io -Dsonar.projectKey=${data.Push[0].repo.owner}:${data.Push[0].repo.name} -Dsonar.organization=sdm-org",
							},
							{
								name: "docker_env",
								value: [
									"SONAR_USER_HOME=/atm/home/.sonar",
									"SONAR_PROJECT_BASE_DIR=/atm/home",
								],
							},
							{
								name: "docker_cache",
								value: [".scannerwork/**", ".sonar/**"],
							},
							{
								name: "docker_check",
								value: true,
							},
							{
								name: "repos",
								value: {
									includes: [
										{
											providerId:
												"AK748NQC5_75b34148-c780-4cdb-a641-d4c34b74515e",
											ownerId:
												"AK748NQC5_atomisthqa_AK748NQC5",
											repoIds: [
												"AK748NQC5_AK748NQC5_atomisthqa_242068264",
											],
										},
									],
									excludes: null,
								},
							},
						],
					},
				},
			};
			const publish = async msg => {
				assert.deepStrictEqual(msg.code, 0);
			};

			await processEvent(
				payload as any,
				{ eventId: "654321" },
				async name => {
					assert.deepStrictEqual(
						name,
						`${payload.subscription.name}`,
					);
					return wrapEventHandler(
						transform(async ctx => {
							(ctx.message as any).publish = publish;
							assert.deepStrictEqual(ctx.data, {
								commit: { sha: "123456" },
							});
							return success();
						}),
					);
				},
			);
		});
	});

	describe("processWebhook", () => {
		it("should execute webhook handler", async () => {
			const payload = {
				correlation_id:
					"583a683e-ece0-41d8-8428-405d7559ca05.w3Xsv5KbRcWfByAQuYBp9",
				type: "webhook_raw_payload",
				team_id: "AK748NQC5",
				skill: {
					namespace: "atomist",
					name: "container-run-skill",
					id: "70b0b9cf-737b-4c61-b90c-c47f461d8615",
					version: "2.1.9-75",
					configuration: {
						name: "sonarcloud",
						enabled: true,
						resourceProviders: [
							{
								name: "github",
								typeName: "GitHubAppResourceProvider",
								selectedResourceProviders: [
									{
										id: "AK748NQC5_75b34148-c780-4cdb-a641-d4c34b74515e",
									},
								],
							},
							{
								name: "secret",
								typeName: "SecretProvider",
								selectedResourceProviders: [
									{
										id: "AK748NQC5_d35537a0-9c72-4b23-81ea-96de97d79d5e",
									},
								],
							},
						],
						parameters: [
							{
								name: "env_map",
								value: '[{"name":"SONAR_TOKEN","secret":"AK748NQC5_d35537a0-9c72-4b23-81ea-96de97d79d5e"}]',
							},
							{
								name: "subscription_filter",
								value: ["onPush"],
							},
							{
								name: "docker_image",
								value: "sonarsource/sonar-scanner-cli:4.4",
							},
							{
								name: "docker_command",
								value: "/usr/bin/entrypoint.sh sonar-scanner -Dsonar.host.url=https://sonarcloud.io -Dsonar.projectKey=${data.Push[0].repo.owner}:${data.Push[0].repo.name} -Dsonar.organization=sdm-org",
							},
							{
								name: "docker_env",
								value: [
									"SONAR_USER_HOME=/atm/home/.sonar",
									"SONAR_PROJECT_BASE_DIR=/atm/home",
								],
							},
							{
								name: "docker_cache",
								value: [".scannerwork/**", ".sonar/**"],
							},
							{
								name: "docker_check",
								value: true,
							},
							{
								name: "repos",
								value: {
									includes: [
										{
											providerId:
												"AK748NQC5_75b34148-c780-4cdb-a641-d4c34b74515e",
											ownerId:
												"AK748NQC5_atomisthqa_AK748NQC5",
											repoIds: [
												"AK748NQC5_AK748NQC5_atomisthqa_242068264",
											],
										},
									],
									excludes: null,
								},
							},
						],
					},
				},
				webhook: {
					parameter_name: "sonarcloud-event-manual",
					url: "h********************************************************************************************3",
					headers: {
						"x-forwarded-proto": "https",
						"user-agent": "c*********1",
						"x-scheme": "https",
						"x-forwarded-port": "443",
						"host": "webhook-staging.atomist.services",
						"content-length": "35",
						"x-forwarded-host": "webhook-staging.atomist.services",
						"content-type": "application/json",
						"x-real-ip": "93.220.126.54",
						"x-forwarded-for": "93.220.126.54",
						"x-request-id": "53268bdd7f6f9a0568228246b41fcb4f",
						"accept": "*/*",
					},
					body: '{"username":"xyz","password":"zyx"}',
				},
				secrets: [
					{
						uri: "atomist://api-key",
						value: "123456",
					},
				],
				log_url:
					"h**************************************************************************************************9",
			};

			const publish = async msg => {
				assert.deepStrictEqual(msg.code, 0);
			};

			await processWebhook(
				payload as any,
				{ eventId: "654321" },
				async name => {
					assert.deepStrictEqual(
						name,
						`${payload.webhook.parameter_name}`,
					);
					return async ctx => {
						(ctx.message as any).publish = publish;
						assert.deepStrictEqual(ctx.json, {
							username: "xyz",
							password: "zyx",
						});
						return success();
					};
				},
			);
		});
	});
});
