const OAuthClient = require('intuit-oauth');

// Returns a fresh client per call instead of a shared singleton. The
// intuit-oauth client holds mutable per-token state (setToken/refresh/getToken),
// and concurrent requests (different sessions, or several fetches within one
// request) were clobbering each other's token state on a shared instance.
function createOAuthClient() {
  return new OAuthClient({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    environment: process.env.ENVIRONMENT || 'sandbox',
    redirectUri: process.env.REDIRECT_URI,
  });
}

module.exports = createOAuthClient;
