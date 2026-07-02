const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const usersRouter = require('../routes/users');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test('GET /users returns the default users response', async () => {
  const app = express();
  app.use('/users', usersRouter);

  const server = await listen(app);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/users`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, 'respond with a resource');
  } finally {
    await close(server);
  }
});
