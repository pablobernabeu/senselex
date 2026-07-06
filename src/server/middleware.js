// Cross-cutting request handling: security headers, a strict CORS policy, a
// body reader that enforces a hard size limit, and an in-memory rate limiter.
// Each piece is deliberately small and explicit so that its behaviour can be
// read off directly rather than inferred from a framework's defaults.

export function securityHeaders(response) {
  // A restrictive content security policy. The Atlas front end is served from
  // the same origin and uses no inline script beyond its own bundle, so the
  // policy can stay tight.
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

export function applyCors(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Max-Age', '600');
  }
}

export function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
      return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (size === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

// A fixed-window rate limiter keyed by client address. It is intentionally
// simple and in-process, which is enough for one node and for the prototype.
// A scaled deployment behind several nodes would back this with a shared store
// such as Redis; the interface would not change.
export function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();

  function sweep(now) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.start >= windowMs) buckets.delete(key);
    }
  }

  return {
    check(key, now = Date.now()) {
      if (buckets.size > 10_000) sweep(now);
      const bucket = buckets.get(key);
      if (!bucket || now - bucket.start >= windowMs) {
        buckets.set(key, { start: now, count: 1 });
        return { allowed: true, remaining: max - 1 };
      }
      if (bucket.count >= max) {
        const retryAfter = Math.ceil((windowMs - (now - bucket.start)) / 1000);
        return { allowed: false, retryAfter };
      }
      bucket.count += 1;
      return { allowed: true, remaining: max - bucket.count };
    },
  };
}

export function clientAddress(request) {
  // Trust the socket address by default. A deployment behind a known proxy would
  // parse a forwarded header only for that proxy's address, which is left to the
  // operator rather than trusted blindly here.
  return request.socket?.remoteAddress || 'unknown';
}
