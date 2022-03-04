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

import * as assert from "assert";

import { mapSubscription } from "../lib/map";

describe("map", () => {
	describe("mapSubscription", () => {
		it("should map single array result", () => {
			const result = [
				{
					"schema/entity-type": "git/commit",
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
					"git.commit/author": {
						"git.user/name": "C**************s",
						"git.user/login": "c*****s",
						"git.user/emails": [
							{
								"email.email/address": "cd@atomist.com",
							},
						],
					},
					"git.commit/sha":
						"4f73e634a41c2ba41be7a80e16fbb731196f5776",
					"git.commit/message": "Update touch.txt",
				},
			];
			assert.deepStrictEqual(mapSubscription(result), {
				commit: {
					repo: {
						name: "view-service",
						org: {
							installationToken:
								"v*****************************************4",
							name: "atomisthq",
							url: "h****************m",
						},
					},
					author: {
						name: "C**************s",
						login: "c*****s",
						emails: [{ address: "cd@atomist.com" }],
					},
					sha: "4f73e634a41c2ba41be7a80e16fbb731196f5776",
					message: "Update touch.txt",
				},
			});
		});

		it("should map array result", () => {
			const result = [
				{
					"schema/entity-type": "git/commit",
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
					"git.commit/author": {
						"git.user/name": "C**************s",
						"git.user/login": "c*****s",
						"git.user/emails": [
							{
								"email.email/address": "cd@atomist.com",
							},
						],
					},
					"git.commit/sha":
						"4f73e634a41c2ba41be7a80e16fbb731196f5776",
					"git.commit/message": "Update touch.txt",
				},
				{
					"schema/entity-type": "git/commit",
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
					"git.commit/author": {
						"git.user/name": "C**************s",
						"git.user/login": "c*****s",
						"git.user/emails": [
							{
								"email.email/address": "cd@atomist.com",
							},
						],
					},
					"git.commit/sha":
						"4f73e634a41c2ba41be7a80e16fbb731196f5776",
					"git.commit/message": "Update touch.txt",
				},
			];
			assert.deepStrictEqual(mapSubscription(result), {
				commit: [
					{
						repo: {
							name: "view-service",
							org: {
								installationToken:
									"v*****************************************4",
								name: "atomisthq",
								url: "h****************m",
							},
						},
						author: {
							name: "C**************s",
							login: "c*****s",
							emails: [{ address: "cd@atomist.com" }],
						},
						sha: "4f73e634a41c2ba41be7a80e16fbb731196f5776",
						message: "Update touch.txt",
					},
					{
						repo: {
							name: "view-service",
							org: {
								installationToken:
									"v*****************************************4",
								name: "atomisthq",
								url: "h****************m",
							},
						},
						author: {
							name: "C**************s",
							login: "c*****s",
							emails: [{ address: "cd@atomist.com" }],
						},
						sha: "4f73e634a41c2ba41be7a80e16fbb731196f5776",
						message: "Update touch.txt",
					},
				],
			});
		});

		it("should map array result", () => {
			const result = [
				{
					"schema/entity-type": "git/commit",
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
					"git.commit/author": {
						"git.user/name": "C**************s",
						"git.user/login": "c*****s",
						"git.user/emails": [
							{
								"email.email/address": "cd@atomist.com",
							},
						],
					},
					"git.commit/sha":
						"4f73e634a41c2ba41be7a80e16fbb731196f5776",
					"git.commit/message": "Update touch.txt",
				},
				{
					"schema/entity-type": "docker/image",
					"docker.image/image":
						"gcr.io/atomist-container-registry/view-service:4f73e634a41c2ba41be7a80e16fbb731196f5776",
					"docker.image/tags": [
						"4f73e634a41c2ba41be7a80e16fbb731196f5776",
					],
					"docker.image/labels": [
						{
							"docker.image.label/name":
								"org.label-schema.build-date",
							"docker.image.label/value":
								"2021-01-20T10:06:03+01:00",
						},
						{
							"docker.image.label/name": "org.label-schema.name",
							"docker.image.label/value": "view-service",
						},
						{
							"docker.image.label/name":
								"org.label-schema.schema-version",
							"docker.image.label/value": "1.0",
						},
						{
							"docker.image.label/name":
								"org.label-schema.vcs-ref",
							"docker.image.label/value":
								"4f73e634a41c2ba41be7a80e16fbb731196f5776",
						},
						{
							"docker.image.label/name":
								"org.label-schema.vcs-url",
							"docker.image.label/value":
								"git@github.com::atomisthq/view-service.git",
						},
						{
							"docker.image.label/name":
								"org.label-schema.vendor",
							"docker.image.label/value": "atomisthq",
						},
					],
					"docker.image/repository": {
						"docker.repository/host": "gcr.io",
						"name": "atomist-container-registry/view-service",
					},
				},
				{
					"schema/entity-type": "docker/registry",
					"docker.registry/type": {
						"db/id": 237494511989711,
						"db/ident": "docker.registry.type/GCR",
					},
					"docker.registry/secret":
						"{*********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************n",
					"docker.registry/server-url":
						"g*******************************y",
				},
			];
			assert.deepStrictEqual(mapSubscription(result), {
				commit: {
					repo: {
						name: "view-service",
						org: {
							installationToken:
								"v*****************************************4",
							name: "atomisthq",
							url: "h****************m",
						},
					},
					author: {
						name: "C**************s",
						login: "c*****s",
						emails: [{ address: "cd@atomist.com" }],
					},
					sha: "4f73e634a41c2ba41be7a80e16fbb731196f5776",
					message: "Update touch.txt",
				},
				image: {
					image: "gcr.io/atomist-container-registry/view-service:4f73e634a41c2ba41be7a80e16fbb731196f5776",
					tags: ["4f73e634a41c2ba41be7a80e16fbb731196f5776"],
					labels: [
						{
							name: "org.label-schema.build-date",
							value: "2021-01-20T10:06:03+01:00",
						},
						{
							name: "org.label-schema.name",
							value: "view-service",
						},
						{
							name: "org.label-schema.schema-version",
							value: "1.0",
						},
						{
							name: "org.label-schema.vcs-ref",
							value: "4f73e634a41c2ba41be7a80e16fbb731196f5776",
						},
						{
							name: "org.label-schema.vcs-url",
							value: "git@github.com::atomisthq/view-service.git",
						},
						{
							name: "org.label-schema.vendor",
							value: "atomisthq",
						},
					],
					repository: {
						host: "gcr.io",
						name: "atomist-container-registry/view-service",
					},
				},
				registry: {
					type: "GCR",
					secret: "{*********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************n",
					serverUrl: "g*******************************y",
				},
			});
		});
		it("should map unknown entity", () => {
			const result = [
				{
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
				},
			];
			assert.deepStrictEqual(mapSubscription(result), {
				repo: {
					name: "view-service",
					org: {
						installationToken:
							"v*****************************************4",
						name: "atomisthq",
						url: "h****************m",
					},
				},
			});
		});
		it("should ignore undefined entity", () => {
			const result = [
				{
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
				},
				undefined,
			];
			assert.deepStrictEqual(mapSubscription(result), {
				repo: {
					name: "view-service",
					org: {
						installationToken:
							"v*****************************************4",
						name: "atomisthq",
						url: "h****************m",
					},
				},
			});
		});

		it("should ignore serialize tuple", () => {
			const result = [
				"035f392e-dfad-5606-af9c-75702648b5df",
				{
					"git.commit/repo": {
						"git.repo/name": "view-service",
						"git.repo/org": {
							"github.org/installation-token":
								"v*****************************************4",
							"git.org/name": "atomisthq",
							"git.provider/url": "h****************m",
						},
					},
				},
				undefined,
			];
			assert.deepStrictEqual(mapSubscription(result), {
				repo: {
					name: "view-service",
					org: {
						installationToken:
							"v*****************************************4",
						name: "atomisthq",
						url: "h****************m",
					},
				},
			});
		});
	});
});
