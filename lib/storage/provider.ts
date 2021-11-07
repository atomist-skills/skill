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

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { guid } from "../util";

export interface StorageProvider {
	store(key: string, sourceFilePath: string): Promise<void>;

	retrieve(
		key: string,
		options?: { targetFilePath?: string; ttl?: number },
	): Promise<string>;

	delete(key: string): Promise<void>;
}

export function createStorageProvider(workspaceId: string): StorageProvider {
	return new GoogleCloudStorageProvider(bucketName(workspaceId));
}

export class GoogleCloudStorageProvider implements StorageProvider {
	constructor(private readonly bucket: string) {}

	public async retrieve(
		key: string,
		options?: { targetFilePath?: string; ttl?: number },
	): Promise<string> {
		const targetFilePath =
			options?.targetFilePath || path.join(os.tmpdir() || "/tmp", guid());
		await fs.ensureDir(path.dirname(targetFilePath));
		const storage = new (await import("@google-cloud/storage")).Storage();
		const file = storage.bucket(this.bucket).file(key);
		if (options?.ttl !== undefined) {
			const [metadata] = await file.getMetadata();
			const lastModified = new Date(metadata.updated);
			if (lastModified.getTime() + options.ttl < Date.now()) {
				throw new Error(`Storage item '${key}' expired`);
			}
		}

		if (await file.exists()) {
			await file.download({ destination: targetFilePath });
			return targetFilePath;
		} else {
			return undefined;
		}
	}

	public async store(key: string, filePath: string): Promise<void> {
		const storage = new (await import("@google-cloud/storage")).Storage();
		await storage.bucket(this.bucket).upload(filePath, {
			destination: key,
			resumable: false,
		});
	}

	public async delete(key: string): Promise<void> {
		const storage = new (await import("@google-cloud/storage")).Storage();
		await storage
			.bucket(this.bucket)
			.file(key)
			.delete({ ignoreNotFound: true });
	}
}

export function bucketName(workspaceId: string): string {
	const bucket =
		process.env.ATOMIST_STORAGE ||
		(workspaceId
			? `gs://${workspaceId.toLowerCase()}-workspace-storage`
			: undefined);
	if (bucket) {
		return bucket.replace(/gs:\/\//, "");
	} else {
		return undefined;
	}
}
