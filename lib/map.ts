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

import camelCase = require("lodash.camelcase");
import { toArray } from "./util";

/**
 * Map a Datalog subscription result to a JavaScript object
 */
export function mapSubscription<T = any>(result: any[]): T {
	if (!result) {
		return undefined;
	}

	const mapped = {};

	const mapper = (v: any) => {
		if (isPrimitive(v)) {
			return v;
		} else if (Array.isArray(v)) {
			return v.map(vr => mapper(vr));
		} else {
			// Special case for enums
			const values = Object.keys(v);
			if (
				values.length === 2 &&
				values.includes("db/id") &&
				values.includes("db/ident")
			) {
				return nameFromKey(v["db/ident"], false);
			}
			const m = {};
			for (const k in v) {
				m[nameFromKey(k)] = mapper(v[k]);
			}
			return m;
		}
	};

	toArray(result).forEach(r => {
		const value = {};
		let key;
		for (const k in r) {
			if (k === "schema/entity-type") {
				key = nameFromKey(r[k]);
			} else {
				value[nameFromKey(k)] = mapper(r[k]);
			}
		}
		if (key) {
			mapped[key] = value;
		}
	});

	return mapped as T;
}

function nameFromKey(value: string, toCamelCase = true): string {
	let name;
	if (value.includes("/")) {
		name = value.split("/")[1];
	} else {
		name = value;
	}
	if (toCamelCase) {
		return camelCase(name);
	} else {
		return name;
	}
}

function isPrimitive(test): boolean {
	return test !== Object(test);
}