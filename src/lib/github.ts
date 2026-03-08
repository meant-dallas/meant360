const GITHUB_API = 'https://api.github.com';
const REPO = 'meantdallas/meant360';

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN environment variable is not set');
  return token;
}

async function githubFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function createIssue(
  title: string,
  body: string,
  labels: string[],
): Promise<{ number: number; html_url: string }> {
  return githubFetch(`/repos/${REPO}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels }),
  });
}

export async function listIssues(
  state: 'open' | 'closed' | 'all' = 'open',
): Promise<
  { number: number; title: string; state: string; html_url: string; labels: { name: string }[]; created_at: string }[]
> {
  return githubFetch(`/repos/${REPO}/issues?state=${state}&per_page=50&sort=created&direction=desc`);
}
