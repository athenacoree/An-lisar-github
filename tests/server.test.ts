import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/server';
import * as githubModule from '../src/github';

jest.mock('../src/github', () => ({
  triggerWorkflowDispatch: jest.fn().mockResolvedValue(undefined)
}));

describe('Express Server & Webhook Listener', () => {
  test('GET /health returns 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'pr-guard-backend' });
  });

  test('POST /webhook ping event returns pong', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('x-github-event', 'ping')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ msg: 'pong' });
  });

  test('POST /webhook pull_request opened event triggers dispatch', async () => {
    const payload = {
      action: 'opened',
      number: 42,
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' }
      },
      pull_request: { head: { sha: 'abc123def456' } },
      installation: { id: 12345 }
    };

    const res = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .send(payload);

    expect(res.status).toBe(202);
    expect(res.body.message).toContain('triggered successfully');
    expect(githubModule.triggerWorkflowDispatch).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      commitSha: 'abc123def456',
      installationId: 12345
    });
  });

  test('POST /webhook validates signature when secret is present', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'mysecret';
    const body = JSON.stringify({ ping: true });

    const hmac = crypto.createHmac('sha256', 'mysecret');
    const validSignature = `sha256=${hmac.update(body).digest('hex')}`;

    const validRes = await request(app)
      .post('/webhook')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', validSignature)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(validRes.status).toBe(200);

    const invalidRes = await request(app)
      .post('/webhook')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', 'sha256=invalid')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(invalidRes.status).toBe(401);

    delete process.env.GITHUB_WEBHOOK_SECRET;
  });
});
