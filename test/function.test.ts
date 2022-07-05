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

import { parseEDNString } from "edn-data";
import * as assert from "power-assert";

import { processEvent } from "../lib/function";
import { State } from "../lib/handler/handler";
import { EventIncoming } from "../lib/payload";
import { completed } from "../lib/status";

describe("function", () => {
	describe("processEvent", () => {
		it("should execute datalog subscription handler", async () => {
			const payloadString = `{:execution-id
   "698e4c21-bf56-482b-be70-54273910fc37.YgDUPm3oIpDTT0SbYH5t5"
 :skill
   {:namespace "atomist"
    :name "go-sample-skill"
    :version "0.1.0-42"}
 :workspace-id "T29E48P34"
 :type :subscription
 :context
   {:subscription
      {:name "on_push"
       :configuration {:name "go_sample_skill"}
       :result
         ([{:schema/entity-type :git/commit
            :git.commit/repo
              {:git.repo/name "go-sample-skill"
               :git.repo/source-id "490643782"
               :git.repo/default-branch "main"
               :git.repo/org
                 {:github.org/installation-token
                    "[GITHUB_TOKEN]"
                  :git.org/name "atomist-skills"
                  :git.provider/url "https://github.com"}}
            :git.commit/author
              {:git.user/name "Christian Dupuis"
               :git.user/login "cdupuis"
               :git.user/emails
                 [{:email.email/address "cd@atomist.com"}]}
            :git.commit/sha
              "68c3d821eddc46c4dc4b1de0ffb1a6c29a5342a9"
            :git.commit/message "Update README.md"
            :git.ref/refs
              [{:git.ref/name "main"
                :git.ref/type
                  {:db/id 83562883711320
                   :db/ident :git.ref.type/branch}}]}])
       :after-basis-t 4284274
       :tx 13194143817586}}
 :urls
   {:execution
      "https://api.atomist.com/executions/698e4c21-bf56-482b-be70-54273910fc37.YgDUPm3oIpDTT0SbYH5t5"
    :logs
      "https://api.atomist.com/executions/698e4c21-bf56-482b-be70-54273910fc37.YgDUPm3oIpDTT0SbYH5t5/logs"
    :transactions
      "https://api.atomist.com/executions/698e4c21-bf56-482b-be70-54273910fc37.YgDUPm3oIpDTT0SbYH5t5/transactions"
    :query
      "https://api.atomist.com/datalog/team/T29E48P34/queries"}
 :token "[JSON_WEB_TOKEN]"}`;

			const event: EventIncoming = parseEDNString(payloadString, {
				mapAs: "object",
				keywordAs: "string",
				listAs: "array",
			}) as any;

			const publish = async msg => {
				assert.deepStrictEqual(msg.state, State.Completed);
			};

			await processEvent(event, async name => {
				assert.deepStrictEqual(name, "on_push");
				return async ctx => {
					ctx.status.publish = publish;
					assert.deepStrictEqual(ctx.event, event);
					return completed();
				};
			});
		});
	});
});
