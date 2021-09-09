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

export interface Repo {
	graphqlId: string;
	sourceId: string;
	name: string;
	defaultBranch: string;
	org: {
		graphqlId: string;
		installationToken: string;
		name: string;
		url: string;
		baseUrl: string;
	};
}

export interface Commit {
	sha: string;
	message: string;
	repo: Repo;
	author: {
		name: string;
		login: string;
		emails: Array<{ address: string }>;
	};
	refs: Array<{ name: string; type: "branch" }>;
}

export interface DockerImage {
	digest: string;
	tags?: string[];
	sha: string;
	labels?: Array<{ name: string; value: string }>;
	repository: {
		host: string;
		name: string;
	};
	platform: Array<{ architecture: string; os: string }>;
}

export enum DockerRegistryType {
	Ecr = "ECR",
	Gcr = "GCR",
	DockerHub = "DOCKER_HUB",
}

export interface DockerRegistry {
	id: string;
	type: DockerRegistryType;
	secret: string;
	username: string;
	serverUrl: string;
}

export enum DockerImageVulnerabilitySeverity {
	Unspecified = "SEVERITY_UNSPECIFIED",
	Minimal = "MINIMAL",
	Low = "LOW",
	Medium = "MEDIUM",
	High = "HIGH",
	Critical = "CRITICAL",
}

export interface BaseDockerVulnerability {
	sourceId: string;
	severity: DockerImageVulnerabilitySeverity;
	fixAvailable: boolean;
	affected: Array<{ name: string; version: string }>;
}

export interface DockerImageVulnerability extends BaseDockerVulnerability {
	title: string;
	description: string;
	cvssScore: string;
	fixed: Array<{ name: string; version: string }>;
}

export enum DockerAnalysisDiscoverySource {
	Gcr = "GCR",
	Trivy = "TRIVY",
}

export enum DockerAnalysisDiscoveryStatus {
	Pending = "PENDING",
	Scanning = "SCANNING",
	FinishedSuccess = "FINISHED_SUCCESS",
	FinishedFailed = "FINISHED_FAILED",
	FinishedUnsupported = "FINISHED_UNSUPPORTED",
	Unspecified = "ANALYSIS_STATUS_UNSPECIFIED",
}

export type BaseDockerImageWithVulnerabilities = Pick<
	DockerImage,
	"digest" | "sha"
> & {
	vulnerabilities: BaseDockerVulnerability[];
};

export type DockerImageWithVulnerabilities = DockerImage & {
	layers: Array<{
		blob: {
			digest: string;
			vulnerabilities: Array<{ sourceId: string }>;
		};
	}>;
	platform: Array<{
		os: string;
		variant?: string;
		architecture: string;
	}>;
	repository: {
		baseline: Array<{ vulnerabilities: DockerImageVulnerability[] }>;
	};
	vulnerabilities: DockerImageVulnerability[];
	dockerFile: {
		path: string;
		sha: string;
		lines: Array<{
			number: number;
			instruction: string;
			argsMap: Record<string, string>;
			argsArray: string[];
			argsString: string;
			tag: string;
			digest: string;
			layers: Array<{ digest: string }>;
			repository: {
				host: string;
				name: string;
			};
			image: {
				digest: string;
				tags: string[];
				vulnerabilities: Array<
					Pick<
						DockerImageVulnerability,
						"sourceId" | "fixAvailable" | "affected" | "fixed"
					>
				>;
				distro: {
					name: string;
					version: string;
					id: string;
					idLike: string[];
				};
				packageManager: {
					type: string;
					sources: string[];
				};
				platform: Array<{
					os: string;
					variant?: string;
					architecture: string;
				}>;
			};
			manifestList: {
				digest: string;
				tags: string[];
				images: Array<{
					digest: string;
					tags: string[];
					vulnerabilities: Array<
						Pick<
							DockerImageVulnerability,
							"sourceId" | "fixAvailable" | "affected" | "fixed"
						>
					>;
					distro: {
						name: string;
						version: string;
						id: string;
						idLike: string[];
					};
					packageManager: {
						type: string;
						sources: string[];
					};
					platform: Array<{
						os: string;
						variant?: string;
						architecture: string;
					}>;
				}>;
			};
		}>;
	};
};

export interface WithCommitAndRegistry {
	commit: Commit;
	registry: DockerRegistry;
}

/**
 * Subscription type to be used with the on_docker_image datalog subscription
 */
export interface OnDockerImage extends WithCommitAndRegistry {
	image: DockerImage[];
}

/**
 * Subscription type to be used with on_docker_image_unlinked
 */
export interface OnDockerImageUnlinked {
	image: DockerImage;
	registry: DockerRegistry;
}

export type OrderedList = Array<{ ordinal: number; string: string }>;

/**
 * Subscription type to be used with the on_dockerfile datalog subscription
 */
export interface OnDockerFile extends WithCommitAndRegistry {
	image: DockerImage;
	file: {
		id: number;
		path: string;
		sha: string;
		lines: Array<{
			number: number;
			instruction: string;
			argsMap: Record<string, string>;
			argsString: string;
			argsList: OrderedList;
		}>;
	};
}

/**
 * Subscription type to be used with the on_docker_analysis_complete datalog subscription
 */
export interface OnDockerAnalysisComplete {
	discovery: {
		status: DockerAnalysisDiscoveryStatus;
		source: DockerAnalysisDiscoverySource;
	};
	commit: Commit;
	image: [DockerImageWithVulnerabilities, BaseDockerImageWithVulnerabilities];
}

/**
 * Subscription type to be used with the on_push datalog subscription
 */
export interface OnPush {
	commit: Commit;
}

import sortBy = require("lodash.sortby");

export function orderedListToArray(list: OrderedList): string[] {
	return sortBy(list, "ordinal").map(l => l.string);
}
