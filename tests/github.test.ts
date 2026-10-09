import axios from 'axios';
import { getAuthHeader, triggerWorkflowDispatch } from '../src/github';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitHub Integration Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('getAuthHeader returns Bearer token when GITHUB_TOKEN is present', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    const authHeader = await getAuthHeader();
    expect(authHeader).toBe('Bearer ghp_test123');
  });

  test('triggerWorkflowDispatch sends POST request to correct GitHub API endpoint', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    mockedAxios.post.mockResolvedValueOnce({ status: 204, data: {} });

    await triggerWorkflowDispatch({
      owner: 'test-org',
      repo: 'test-repo',
      prNumber: 12,
      commitSha: 'sha999'
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/test-repo/actions/workflows/pr-guard.yml/dispatches',
      {
        ref: 'sha999',
        inputs: {
          pr_number: '12',
          commit_sha: 'sha999',
          callback_url: 'https://pr-guard.onrender.com/api/results',
          installation_id: ''
        }
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test123'
        })
      })
    );
  });
});
