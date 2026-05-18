import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';

const PORT = Number.parseInt(String(process.env.SMTP_TRIGGER_PORT || '4101'), 10) || 4101;
const HOST = String(process.env.SMTP_TRIGGER_HOST || '127.0.0.1').trim() || '127.0.0.1';
const ALLOWED_ORIGIN = String(process.env.SMTP_TRIGGER_ORIGIN || 'http://localhost:3000').trim();
const MAX_RUN_SECONDS = Number.parseInt(String(process.env.SMTP_TRIGGER_MAX_RUN_SECONDS || '30'), 10) || 30;

let processing = false;

function corsHeaders(req) {
  const origin = String(req.headers.origin || '').trim();
  const allowOrigin = origin || ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function writeJson(res, req, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseSummary(rawOutput = '') {
  const match = String(rawOutput).match(/Batch summary \| processed=(\d+) sent=(\d+) failed=(\d+) skipped=(\d+)/i);
  if (!match) {
    return null;
  }
  return {
    processed: Number.parseInt(match[1], 10) || 0,
    sent: Number.parseInt(match[2], 10) || 0,
    failed: Number.parseInt(match[3], 10) || 0,
    skipped: Number.parseInt(match[4], 10) || 0,
  };
}

function runSmtpWorkerOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/processSmtpOutbox.mjs'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // no-op
      }
    }, MAX_RUN_SECONDS * 1000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk?.toString?.() || '';
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk?.toString?.() || '';
    });
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (timedOut) {
        reject(new Error(`SMTP worker timed out after ${MAX_RUN_SECONDS}s.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `SMTP worker exited with code ${code}.`));
        return;
      }
      resolve({
        code,
        summary: parseSummary(stdout),
        stdout,
        stderr,
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    writeJson(res, req, 200, {
      ok: true,
      service: 'smtp-trigger',
      processing,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/smtp/process-once') {
    if (processing) {
      writeJson(res, req, 202, {
        ok: true,
        processing: true,
        message: 'SMTP worker is already processing.',
      });
      return;
    }

    processing = true;
    try {
      const result = await runSmtpWorkerOnce();
      writeJson(res, req, 200, {
        ok: true,
        processing: false,
        summary: result.summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      writeJson(res, req, 500, {
        ok: false,
        processing: false,
        error: String(error?.message || error || 'SMTP processing failed.'),
      });
    } finally {
      processing = false;
    }
    return;
  }

  writeJson(res, req, 404, { ok: false, error: 'Not found.' });
});

server.listen(PORT, HOST, () => {
  console.log(`[SMTP-TRIGGER] Listening at http://${HOST}:${PORT}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
