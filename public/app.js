const loginBtn = document.getElementById('login');
const refreshBtn = document.getElementById('refresh');
const apiBtn = document.getElementById('api');

loginBtn.addEventListener('click', async function(event) {
  event.preventDefault();
  const config = await getConfig();

  const state = randomString(32);
  const codeVerifier = randomString(32);
  const codeChallenge = await sha256(codeVerifier).then(bufferToBase64UrlEncoded);

  console.info("code_verifier ", codeVerifier)
  console.info("code_challenge ", codeChallenge)

  // we need to store the state to validate the callback
  // and also the code verifier to send later
  sessionStorage.setItem(`login-code-verifier-${state}`, codeVerifier);

  const authorizationEndpointUrl = new URL(config.authorization_endpoint);

  // here we encode the authorization request
  authorizationEndpointUrl.search = new URLSearchParams({
    audience: API_AUDIENCE,
    redirect_uri: REDIRECT_URI,
    client_id: AUTH0_CLIENT_ID,
    response_type: 'code',
    // scope: 'openid profile email read:appointments',
    scope: 'openid profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state
  });
  console.info('About to send request to ', authorizationEndpointUrl);
  window.location.assign(authorizationEndpointUrl);
});

// This seems to be called after the above request - I don't know how
(async function handleCallback() {
  console.info("Query string of redirect url ", window.location.search)
  const search = new URLSearchParams(window.location.search);
  if(!search.has('code')) { return; }
  const code = search.get('code');
  const state = search.get('state');
  const code_verifier = sessionStorage.getItem(`login-code-verifier-${state}`);

  console.info("code ", code)
  console.info("code_verifier ", code_verifier)

  if (!code_verifier) {
    console.error('unexpected state parameter');
    return;
  }

  sessionStorage.has
  const config = await getConfig();

  // exchange the authorization code for a tokenset
  console.info("About to exchange the authz code for a token on ", config.token_endpoint)
  const tokenSet = await fetch(config.token_endpoint, {
    method: 'POST',
    body: new URLSearchParams({
      audience: API_AUDIENCE,
      client_id: AUTH0_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier,
      code,
    }),
    headers: new Headers({
      'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    })
  }).then(r => r.json());

  //this has access_token, id_token, expires_in, scope, token_type.
  console.dir(tokenSet);

  window.tokenSet = tokenSet;
  window.verifier = code_verifier

  console.log("Removing querystring from url in address bar which currently is: ", window.location)
  //remove the querystring from the url in the address bar
  const url = new URL(window.location);
  url.search = '';
  window.history.pushState('', document.title, url);
})();


refreshBtn.addEventListener('click', async function(event) {
  event.preventDefault();
  const config = await getConfig();

  const state = randomString(32);
  const codeVerifier = randomString(32);
  const codeChallenge = await sha256(codeVerifier).then(bufferToBase64UrlEncoded);
  const authorizationEndpointUrl = new URL(config.authorization_endpoint);

  // here we encode the authorization request
  authorizationEndpointUrl.search = new URLSearchParams({
    audience: API_AUDIENCE,
    redirect_uri: REDIRECT_URI,
    client_id: AUTH0_CLIENT_ID,
    response_type: 'code',
    response_mode: 'web_message',
    prompt: 'none',
    scope: 'openid profile email read:appointments',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state
  });

  //load the url in an iframe and wait for the response
  const authorizeResponse = await new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';

    const timeoutSetTimeoutId = setTimeout(() => {
      reject(new Error('timed out'));
      window.document.body.removeChild(iframe);
    }, 60 * 1000);

    function responseHandler(e) {
      if (e.origin !== authorizationEndpointUrl.origin ||
          e.data.type !== 'authorization_response') {
        return;
      }
      e.source.close();
      clearTimeout(timeoutSetTimeoutId);
      window.removeEventListener('message', responseHandler, false);
      window.document.body.removeChild(iframe);
      const response = e.data.response;
      if(response.error) {
        return reject(response)
      }
      if (response.state !== state) {
        return reject(new Error("State does not match."));
      }
      resolve(response);
    };

    window.addEventListener('message', responseHandler);
    window.document.body.appendChild(iframe);
    iframe.setAttribute('src', authorizationEndpointUrl);
  });

    // exchange the authorization code for a tokenset
  const tokenSet = await fetch(config.token_endpoint, {
    method: 'POST',
    body: new URLSearchParams({
      audience: API_AUDIENCE,
      client_id: AUTH0_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
      code: authorizeResponse.code,
    }),
    headers: new Headers({
      'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    })
  }).then(r => r.json());

  console.dir(tokenSet);
});


apiBtn.addEventListener('click', async function(event) {
  event.preventDefault();
  const config = await getConfig();

  const accessToken = window.tokenSet.access_token

  console.info("accessToken ", accessToken)

  const apiUrl = new URL("http://localhost:8090/private/messages");

  const data = await fetch(apiUrl, {
    method: 'GET',
    headers: new Headers({
      'Authorization': 'Bearer ' + accessToken
    })
  }).then(r => {
    console.info("API call got: ", r)
   return  r.json()
  });

  console.info("Data: " , data)
});
