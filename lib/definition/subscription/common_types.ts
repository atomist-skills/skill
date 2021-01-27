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
	name: string;
	org: {
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
}

export interface DockerImage {
	image: string;
	digest: string;
	tags?: string[];
	labels?: Array<{ name: string; value: string }>;
	repository: {
		host: string;
		name: string;
	};
}

export enum DockerRegistryType {
	Gcr = "GCR",
	DockerHub = "DOCKER_HUB",
}

export interface DockerRegistry {
	type: DockerRegistryType;
	secret: string;
	username: string;
	serverUrl: string;
}

/**
 * Subscription type to be used with the onDockerImage datalog subscription
 */
export interface OnDockerImage {
	commit: Commit;
	image: DockerImage;
	registry: DockerRegistry;
}

export enum DockerImageVulnerabilitySeverity {
	Unspecified = "SEVERITY_UNSPECIFIED",
	Minimal = "MINIMAL",
	Low = "LOW",
	Medium = "MEDIUM",
	High = "HIGH",
	Critical = "CRITICAL",
}

export interface DockerImageVulnerability {
	sourceId: string;
	severity: DockerImageVulnerabilitySeverity;
	title: string;
	description: string;
	cvssScore: string;
	fixAvailable: boolean;
	affected: Array<{ name: string; version: string }>;
	fixed: Array<{ name: string; version: string }>;
}

export interface OnDockerAnalysisComplete {
	commit: Commit;
	image: DockerImage & {
		repository: { baseline: Array<{ cves: DockerImageVulnerability[] }> };
		vulnerabilities: DockerImageVulnerability[];
	};
}