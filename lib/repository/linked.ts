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

import { CommandContext } from "../handler";
import { RepositoryId, RepositoryProviderType } from "./id";

const LinkedRepositoriesQuery = `query LinkedRepositories($id: String!) {
  ChatChannel(channelId: $id) {
    repos {
      name
      owner
      defaultBranch
      org {
        provider {
          apiUrl
        }
      }
    }
  }
}
`;

/**
 * Return all linked repositories from the given command context; or an empty array if no
 * linked repositories exist.
 */
export async function linkedRepositories(ctx: CommandContext): Promise<RepositoryId[]> {
    const channelId = ctx.trigger.source?.slack?.channel?.id;
    if (!channelId) {
        return [];
    }

    const channel = await ctx.graphql.query<{
        ChatChannel: Array<{
            repos: Array<{ name: string; owner: string; defaultBranch: string; org: { provider: { apiUrl: string } } }>;
        }>;
    }>(LinkedRepositoriesQuery, {
        id: channelId,
    });

    if (channel.ChatChannel?.length > 0 && channel.ChatChannel[0]?.repos?.length > 0) {
        return channel.ChatChannel[0].repos.map(r => ({
            owner: r.owner,
            repo: r.name,
            apiUrl: r.org?.provider?.apiUrl,
            branch: r.defaultBranch,
            type: RepositoryProviderType.GitHubCom,
        }));
    }

    return [];
}

export async function linkedRepository(ctx: CommandContext): Promise<RepositoryId> {
    const repositories = await linkedRepositories(ctx);
    if (repositories?.length === 1) {
        return repositories[0];
    } else if (repositories?.length > 1) {
        const repository = await ctx.parameters.prompt<{ slug: string }>({
            slug: {
                description: "Select repository",
                type: {
                    kind: "single",
                    options: repositories.map(r => ({
                        description: `${r.owner}/${r.repo}`,
                        value: `${r.owner}/${r.repo}`,
                    })),
                },
            },
        });
        const owner = repository.slug.split("/")[0];
        const repo = repository.slug.split("/")[1];
        return repositories.find(r => r.owner === owner && r.repo === repo);
    }
    return undefined;
}
