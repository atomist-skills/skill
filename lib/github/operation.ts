/*
 * Copyright © 2020 Atomist, Inc.
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

import { Octokit } from "@octokit/rest"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { Endpoints } from "@octokit/types";
import { Contextual } from "../handler";
import { AuthenticatedRepositoryId } from "../repository/id";
import { GitHubAppCredential, GitHubCredential } from "../secret/provider";
import chunk = require("lodash.chunk");

const DefaultGitHubApiUrl = "https://api.github.com/";

export function api(
    id: Pick<AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>, "credential" | "apiUrl">,
): Octokit {
    const url = id.apiUrl || DefaultGitHubApiUrl;

    const { Octokit } = require("@octokit/rest"); // eslint-disable-line @typescript-eslint/no-var-requires
    const { throttling } = require("@octokit/plugin-throttling"); // eslint-disable-line @typescript-eslint/no-var-requires
    const { retry } = require("@octokit/plugin-retry"); // eslint-disable-line @typescript-eslint/no-var-requires
    const ConfiguredOctokit = Octokit.plugin(throttling, retry);

    return new ConfiguredOctokit({
        auth: `token ${id.credential.token}`,
        baseUrl: url.endsWith("/") ? url.slice(0, -1) : url,
        throttle: {
            onRateLimit: (retryAfter: any, options: any): boolean => {
                console.warn(`Request quota exhausted for request '${options.method} ${options.url}'`);

                if (options.request.retryCount === 0) {
                    // only retries once
                    console.debug(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
                return false;
            },
            onAbuseLimit: (retryAfter: any, options: any): void => {
                console.warn(`Abuse detected for request '${options.method} ${options.url}'`);
            },
        },
    });
}

export function formatMarkers(ctx: Contextual<any, any>, ...tags: string[]): string {
    return `
---

<details>
  <summary>Tags</summary>
  <br/>
  <code>[atomist:generated]</code>
  <br/>
  <code>[atomist-skill:${ctx.skill.namespace}/${ctx.skill.name}]</code>
  <br/>
  <code><a href="${ctx.audit.url}">[atomist-correlation-id:${ctx.correlationId}]</a></code>
  ${tags
      .map(
          t => `<br/>
  <code>[${t}]</code>`,
      )
      .join("\n")}
</details>`;
}

export async function convergeLabel(
    id: AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
    name: string,
    color: string,
    description?: string,
): Promise<void> {
    try {
        await api(id).issues.updateLabel({
            name,
            color,
            description,
            repo: id.repo,
            owner: id.owner,
        });
    } catch (err) {
        await api(id).issues.createLabel({
            name,
            color,
            description,
            repo: id.repo,
            owner: id.owner,
        });
    }
}

export interface CreateCheck {
    sha: string;
    name: string;
    title: string;
    body: string;
}

export interface UpdateCheck {
    conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required";
    body?: string;
    annotations?: Array<{
        path: string;
        startLine: number;
        endLine: number;
        startColumn?: number;
        endColumn?: number;
        annotationLevel: "notice" | "warning" | "failure";
        message: string;
        title?: string;
    }>;
}

export interface Check {
    data: Endpoints["POST /repos/:owner/:repo/check-runs"]["response"]["data"];
    update: (parameters: UpdateCheck) => Promise<void>;
}

export async function openCheck(
    ctx: Contextual<any, any>,
    id: AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
    parameters: CreateCheck,
): Promise<Check> {
    const start = new Date().toISOString();
    const check = await api(id).checks.create({
        owner: id.owner,
        repo: id.repo,
        head_sha: parameters.sha,
        name: parameters.name,
        started_at: start,
        external_id: ctx.correlationId,
        details_url: ctx.audit.url,
        status: "in_progress",
        output: {
            title: parameters.title,
            summary: `${parameters.body}
${formatMarkers(ctx)}`,
        },
    });
    return {
        data: check.data,
        update: async params => {
            await api(id).checks.update({
                owner: id.owner,
                repo: id.repo,
                check_run_id: check.data.id,
                conclusion: params.conclusion,
                completed_at: new Date().toISOString(),
                status: "completed",
            });
            await updateAnnotation(ctx, id, check, params);
        },
    };
}

async function updateAnnotation(
    ctx: Contextual<any, any>,
    id: AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
    check: Endpoints["POST /repos/:owner/:repo/check-runs"]["response"],
    parameters: UpdateCheck,
): Promise<void> {
    const gh = api(id);
    const chunks = chunk(parameters.annotations || [], 50);
    for (const chunk of chunks) {
        await gh.checks.update({
            owner: id.owner,
            repo: id.repo,
            check_run_id: check.data.id,
            output: {
                title: check.data.output.title,
                summary: parameters.body ? `${parameters.body}\n${formatMarkers(ctx)}` : check.data.output.summary,
                annotations: chunk.map(c => ({
                    annotation_level: c.annotationLevel,
                    title: c.title,
                    end_column: c.endColumn,
                    end_line: c.endLine,
                    message: c.message,
                    path: c.path,
                    start_column: c.startColumn,
                    start_line: c.startLine,
                })),
            },
        });
    }
}
