import type { GitHubClient } from "./github.js";
import type { ProjectFieldUpdate, ProjectSyncConfig } from "./project-sync.js";

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as GraphqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("GraphQL response missing data");
  }
  return json.data;
}

async function getToken(github: GitHubClient): Promise<string> {
  const t = process.env.GITHUB_TOKEN;
  if (t) return t;
  throw new Error("GITHUB_TOKEN required for project sync");
}

async function resolveProjectId(
  token: string,
  config: ProjectSyncConfig
): Promise<string | null> {
  if (config.project_id) return config.project_id;
  if (!config.project_number) return null;

  const owner = config.owner;
  const isOrg = config.owner_type !== "user";
  const query = isOrg
    ? `query($login: String!, $number: Int!) {
        organization(login: $login) {
          projectV2(number: $number) { id }
        }
      }`
    : `query($login: String!, $number: Int!) {
        user(login: $login) {
          projectV2(number: $number) { id }
        }
      }`;

  const data = await graphqlRequest<Record<string, Record<string, { id: string }>>>(
    token,
    query,
    { login: owner, number: config.project_number }
  );
  const node = isOrg ? data.organization?.projectV2 : data.user?.projectV2;
  return node?.id ?? null;
}

async function findProjectItemId(
  token: string,
  projectId: string,
  issueNodeId: string
): Promise<string | null> {
  const data = await graphqlRequest<{
    node: {
      items: {
        nodes: Array<{ id: string; content?: { id?: string } }>;
      };
    };
  }>(
    token,
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content {
                ... on Issue { id }
              }
            }
          }
        }
      }
    }`,
    { projectId }
  );
  const match = data.node?.items?.nodes?.find((n) => n.content?.id === issueNodeId);
  return match?.id ?? null;
}

async function getIssueNodeId(
  token: string,
  github: GitHubClient,
  issueNumber: number
): Promise<string> {
  const data = await graphqlRequest<{ repository: { issue: { id: string } } }>(
    token,
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) { id }
      }
    }`,
    { owner: github.owner, repo: github.repo, number: issueNumber }
  );
  const id = data.repository?.issue?.id;
  if (!id) throw new Error(`Issue node not found: #${issueNumber}`);
  return id;
}

export async function applyProjectFieldUpdates(opts: {
  github: GitHubClient;
  config: ProjectSyncConfig;
  issueNumber: number;
  updates: ProjectFieldUpdate[];
}): Promise<{ projectItemId?: string; applied: number }> {
  const token = await getToken(opts.github);
  const projectId = await resolveProjectId(token, opts.config);
  if (!projectId) {
    throw new Error("project_id or project_number required in project-sync.yaml");
  }

  const issueNodeId = await getIssueNodeId(token, opts.github, opts.issueNumber);

  let itemId = await findProjectItemId(token, projectId, issueNodeId);
  if (!itemId) {
    try {
      const addData = await graphqlRequest<{
        addProjectV2ItemById: { item: { id: string } };
      }>(
        token,
        `mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }`,
        { projectId, contentId: issueNodeId }
      );
      itemId = addData.addProjectV2ItemById.item.id;
    } catch {
      itemId = await findProjectItemId(token, projectId, issueNodeId);
      if (!itemId) throw new Error("Could not add or find project item for issue");
    }
  }

  const fieldsData = await graphqlRequest<{
    node: {
      fields: {
        nodes: Array<{
          id: string;
          name: string;
          options?: { id: string; name: string }[];
        }>;
      };
    };
  }>(
    token,
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 30) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }`,
    { projectId }
  );

  const fieldNodes = fieldsData.node?.fields?.nodes ?? [];
  let applied = 0;

  for (const update of opts.updates) {
    const field = fieldNodes.find(
      (f) => f.name.toLowerCase() === update.field.toLowerCase()
    );
    if (!field) continue;

    if (update.field === "Blocked") {
      const checked = update.value === "true";
      await graphqlRequest(
        token,
        `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $checked: Boolean!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: { checkbox: $checked }
            }
          ) { projectV2Item { id } }
        }`,
        { projectId, itemId, fieldId: field.id, checked }
      );
      applied++;
      continue;
    }

    const option = field.options?.find(
      (o) => o.name.toLowerCase() === update.value.toLowerCase()
    );
    if (!option) continue;

    await graphqlRequest(
      token,
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) { projectV2Item { id } }
      }`,
      { projectId, itemId, fieldId: field.id, optionId: option.id }
    );
    applied++;
  }

  return { projectItemId: itemId, applied };
}
