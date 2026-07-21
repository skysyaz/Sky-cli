/**
 * OpenAPI 3.1 document for the Sky daemon HTTP API (Phase 4).
 * Kept as a typed constant so it can be served or written without codegen.
 */

export const skyDaemonOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'Sky Daemon API',
    version: '1.1.0',
    description:
      'Localhost HTTP + SSE API for the Sky agent daemon (OpenCode-style). Bound to 127.0.0.1; authenticate with Bearer or X-Sky-Token.',
  },
  servers: [{ url: 'http://127.0.0.1:{port}', variables: { port: { default: '4096' } } }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      skyToken: { type: 'apiKey', in: 'header', name: 'X-Sky-Token' },
    },
  },
  security: [{ bearerAuth: [] }, { skyToken: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Liveness',
        security: [],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    version: { type: 'string' },
                    pid: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/sessions': {
      get: {
        summary: 'List sessions',
        responses: {
          '200': {
            description: 'Session list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessions: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create session',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  mode: { type: 'string', enum: ['agent', 'plan', 'ask'] },
                  cwd: { type: 'string' },
                  provider: { type: 'string' },
                  model: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/sessions/{id}': {
      get: {
        summary: 'Session metadata',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/sessions/{id}/message': {
      post: {
        summary: 'Run a turn (SSE)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['prompt'],
                properties: {
                  prompt: { type: 'string' },
                  yolo: { type: 'boolean' },
                  force: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE stream of AgentEvent frames',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/sessions/{id}/events': {
      get: {
        summary: 'Subscribe to session events (SSE)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'SSE',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/sessions/{id}/abort': {
      post: {
        summary: 'Abort in-flight turn',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/approvals/{id}': {
      post: {
        summary: 'Resolve a parked approval',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['answer'],
                properties: {
                  answer: { type: 'string', enum: ['yes', 'no', 'always', 'edit'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Resolved' }, '404': { description: 'Unknown id' } },
      },
    },
  },
} as const;

export type SkyDaemonOpenApi = typeof skyDaemonOpenApi;
