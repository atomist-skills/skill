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

import * as crypto from "crypto";
import * as jose from "jose";

export async function decrypt<T = string>(
	jwe: string,
	privateKey: crypto.KeyObject,
): Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { plaintext } = await jose.compactDecrypt(jwe, privateKey);
	try {
		return JSON.parse(Buffer.from(plaintext).toString());
	} catch (e) {
		return Buffer.from(plaintext).toString() as any;
	}
}

export async function encrypt<T>(
	payload: string | T,
	publicKey: crypto.KeyObject,
): Promise<string> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	return new jose.CompactEncrypt(
		Buffer.from(
			typeof payload === "string" ? payload : JSON.stringify(payload),
		),
	)
		.setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM" })
		.encrypt(publicKey);
}
