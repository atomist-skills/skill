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

export async function sign<T = string>(
	payload: T,
	privateKey: crypto.KeyObject,
): Promise<string> {
	const jws = await new jose.CompactSign(
		Buffer.from(
			typeof payload === "string" ? payload : JSON.stringify(payload),
		),
	)
		.setProtectedHeader({ alg: "ES512" })
		.sign(privateKey);
	return jws;
}

export async function verify<T>(
	signature: string,
	publicKey: crypto.KeyObject,
): Promise<T> {
	const { payload } = await jose.compactVerify(signature, publicKey);
	try {
		return JSON.parse(Buffer.from(payload).toString()) as T;
	} catch (e) {
		return Buffer.from(payload).toString() as any;
	}
}
