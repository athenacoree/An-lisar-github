import axios from 'axios';
import { formatPRComment, postOrUpdatePRComment, handleAnalysisResults } from '../src/comments';
import { AnalysisResult } from '../src/checker/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PR Comment Renderer & Callback Handler', () => {
  const sampleResults: AnalysisResult = {
    summary: {
      criticalCount: 1,
      warningCount: 1,
      passed: false
    },
    issues: [
      {
        rule: 'phantom-package',
        severity: 'critical',
        message: "Phantom package detected: 'fake-pkg' does not exist!",
        file: 'src/index.ts',
        line: 5
      },
      {
        rule: 'placeholder',
        severity: 'warning',
        message: "Unresolved placeholder found: 'TODO'",
        file: 'src/index.ts',
        line: 10
      }
    ]
  };

  test('formatPRComment produces valid Markdown table and badge', () => {
    const md = formatPRComment(sampleResults, 'test-owner', 'test-repo', 'sha123');
    expect(md).toContain('PR--Guard-FAILED-red');
    expect(md).toContain('Critical Issues:** 1');
    expect(md).toContain('Warnings:** 1');
    expect(md).toContain('fake-pkg');
    expect(md).toContain('https://github.com/test-owner/test-repo/blob/sha123/src/index.ts#L5');
  });

  test('postOrUpdatePRComment creates new comment if no PR-Guard comment exists', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    mockedAxios.post.mockResolvedValueOnce({ status: 201 });

    await postOrUpdatePRComment('test-owner', 'test-repo', 1, 'Comment body text');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/issues/1/comments',
      { body: 'Comment body text' },
      expect.anything()
    );
  });

  test('postOrUpdatePRComment updates existing comment if PR-Guard comment is found', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { id: 999, body: '<!-- PR-GUARD-ANALYSIS-COMMENT --> Old comment' }
      ]
    });
    mockedAxios.patch.mockResolvedValueOnce({ status: 200 });

    await postOrUpdatePRComment('test-owner', 'test-repo', 1, 'Updated comment body text');

    expect(mockedAxios.patch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-owner/test-repo/issues/comments/999',
      { body: 'Updated comment body text' },
      expect.anything()
    );
  });
});
