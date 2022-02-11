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

import * as http from "http";
import * as https from "https";
import { RequestInit, Response } from "node-fetch";
import forOwn = require("lodash.forown");

const httpAgent = new http.Agent({
	keepAlive: true,
});
const httpsAgent = new https.Agent({
	keepAlive: true,
});

export type HttpClientOptions = RequestInit & {
	parameters?: Record<string, number | string | boolean>;
};

export interface HttpClient {
	request<T>(
		url: string,
		options: HttpClientOptions,
	): Promise<Response & { json(): Promise<T> }>;

	get<T>(
		url: string,
		options?: Omit<HttpClientOptions, "method">,
	): Promise<Response & { json(): Promise<T> }>;

	post<T>(
		url: string,
		options?: Omit<HttpClientOptions, "method">,
	): Promise<Response & { json(): Promise<T> }>;
}

export function createHttpClient(): HttpClient {
	return new NodeFetchHttpClient();
}

export class NodeFetchHttpClient implements HttpClient {
	public async request<T>(
		url: string,
		options: HttpClientOptions,
	): Promise<Response & { json(): Promise<T> }> {
		if (options.agent === undefined) {
			options.agent = parsedUrl => {
				if (parsedUrl.protocol == "http:") {
					return httpAgent;
				} else {
					return httpsAgent;
				}
			};
		}

		const f = (await import("node-fetch")).default;
		return f(prepareUrl(url, options.parameters), options);
	}

	public async get<T>(
		url: string,
		options: Omit<HttpClientOptions, "method"> = {},
	): Promise<Response & { json(): Promise<T> }> {
		return this.request<T>(url, { method: "GET", ...options });
	}

	public async post<T>(
		url: string,
		options: Omit<HttpClientOptions, "method"> = {},
	): Promise<Response & { json(): Promise<T> }> {
		return this.request<T>(url, { method: "POST", ...options });
	}
}

export function prepareUrl(
	url: string,
	parameters: HttpClientOptions["parameters"],
): string {
	// Replace url parameters if provided
	forOwn(parameters || {}, (v, k) => {
		url = url.replace(new RegExp(`\\$\\{${k}\\}`, "gm"), v.toString());
	});
	return url;
}
