import { getLocalApiOrigin } from './localApi';

/**
 * Fabrary GraphQL API client
 * Fetches deck data directly from Fabrary's AWS AppSync API
 */

const GRAPHQL_ENDPOINT = 'https://42xrd23ihbd47fjvsrt27ufpfe.appsync-api.us-east-2.amazonaws.com/graphql';
const REGION = 'us-east-2';
const COGNITO_IDENTITY_POOL_ID = 'us-east-2:845208739518'; // Extracted from AWS headers

// GraphQL query to fetch deck data
const GET_DECK_QUERY = `
query getDeck($deckId: ID!) {
  getDeck(deckId: $deckId) {
    name
    hero {
      name
      pitch
    }
    deckCards {
      quantity
      card {
        name
        pitch
        types
      }
    }
  }
}
`;

/**
 * Get temporary AWS credentials for anonymous access
 */
async function getCognitoCredentials() {
  try {
    // Get identity ID from Cognito
    const identityResponse = await fetch(`https://cognito-identity.${REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityService.GetId',
      },
      body: JSON.stringify({
        IdentityPoolId: COGNITO_IDENTITY_POOL_ID
      })
    });

    if (!identityResponse.ok) {
      throw new Error(`Failed to get Cognito identity: ${identityResponse.status}`);
    }

    const { IdentityId } = await identityResponse.json();

    // Get credentials for the identity
    const credentialsResponse = await fetch(`https://cognito-identity.${REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity',
      },
      body: JSON.stringify({
        IdentityId
      })
    });

    if (!credentialsResponse.ok) {
      throw new Error(`Failed to get Cognito credentials: ${credentialsResponse.status}`);
    }

    const { Credentials } = await credentialsResponse.json();
    return {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretKey,
      sessionToken: Credentials.SessionToken
    };
  } catch (error) {
    console.error('Error getting Cognito credentials:', error);
    throw error;
  }
}

/**
 * Simple AWS Signature V4 implementation for AppSync
 */
async function signRequest(url, body, credentials) {
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);

  const host = new URL(url).host;
  const canonicalUri = '/graphql';
  const canonicalHeaders = `content-type:application/json; charset=UTF-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${credentials.sessionToken}\nx-amz-user-agent:aws-amplify/5.3.11 api/1 framework/1\n`;
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token;x-amz-user-agent';

  const payloadHash = await sha256(body);
  const canonicalRequest = `POST\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${REGION}/appsync/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

  const signingKey = await getSignatureKey(credentials.secretAccessKey, dateStamp, REGION, 'appsync');
  const signature = await hmac(signingKey, stringToSign);

  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'x-amz-date': amzDate,
    'x-amz-security-token': credentials.sessionToken,
    'x-amz-user-agent': 'aws-amplify/5.3.11 api/1 framework/1',
    'Authorization': `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

/**
 * SHA256 hash function using Web Crypto API
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * HMAC-SHA256 function using Web Crypto API
 */
async function hmac(key, message) {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get AWS Signature V4 signing key
 */
async function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = await hmacBinary(`AWS4${key}`, dateStamp);
  const kRegion = await hmacBinary(kDate, regionName);
  const kService = await hmacBinary(kRegion, serviceName);
  const kSigning = await hmacBinary(kService, 'aws4_request');
  return kSigning;
}

/**
 * HMAC that returns binary data
 */
async function hmacBinary(key, message) {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
}

/**
 * Extract deck ID from Fabrary URL
 */
export function extractDeckIdFromUrl(url) {
  const match = url.match(/fabrary\.net\/decks\/([A-Z0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * Check if a string is a Fabrary deck URL
 */
export function isFabraryUrl(text) {
  return /fabrary\.net\/decks\/[A-Z0-9]+/i.test(text);
}

/**
 * Fetch deck data from Fabrary GraphQL API
 */
export async function fetchDeckFromFabrary(deckId) {
  try {
    // Try without authentication first (in case the endpoint allows public access)
    const requestBody = JSON.stringify({
      query: GET_DECK_QUERY,
      variables: { deckId }
    });

    let response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'da2-fakeApiId123456' // Try with a placeholder API key
      },
      body: requestBody
    });

    // If unauthenticated request fails, try with Cognito credentials
    if (!response.ok && response.status === 401) {
      const credentials = await getCognitoCredentials();
      const headers = await signRequest(GRAPHQL_ENDPOINT, requestBody, credentials);

      response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers,
        body: requestBody
      });
    }

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${result.errors[0].message}`);
    }

    return result.data.getDeck;
  } catch (error) {
    console.error('Error fetching deck from Fabrary:', error);
    throw error;
  }
}

/**
 * Convert Fabrary deck data to import text format
 */
export function convertDeckToText(deckData) {
  if (!deckData) {
    return '';
  }

  const lines = [];

  // Add hero
  if (deckData.hero && deckData.hero.name) {
    lines.push(`Hero: ${deckData.hero.name}`);
  }

  // Add deck cards with counts
  if (deckData.deckCards && deckData.deckCards.length > 0) {
    // Group cards by name and pitch
    const cardCounts = {};

    deckData.deckCards.forEach(deckCard => {
      if (!deckCard.card || !deckCard.card.name) return;

      const name = deckCard.card.name;
      const pitch = deckCard.card.pitch;
      const quantity = deckCard.quantity || 1;

      // Create key with pitch if present
      let key = name;
      if (pitch) {
        const pitchMap = { '1': 'red', '2': 'yellow', '3': 'blue' };
        const pitchName = pitchMap[pitch] || pitch;
        key = `${name} (${pitchName})`;
      }

      cardCounts[key] = (cardCounts[key] || 0) + quantity;
    });

    // Convert to lines
    Object.entries(cardCounts).forEach(([name, count]) => {
      lines.push(`${count}x ${name}`);
    });
  }

  return lines.join('\n');
}

/**
 * Import deck from Fabrary URL using local proxy server
 */
export async function importFromFabraryUrl(url, { signal } = {}) {
  const deckId = extractDeckIdFromUrl(url);

  if (!deckId) {
    throw new Error('Invalid Fabrary URL. Expected format: https://fabrary.net/decks/DECKID');
  }

  // Use local proxy server
  const proxyUrl = `${getLocalApiOrigin()}/api/fabrary/deck/${deckId}`;

  try {
    const response = await fetch(proxyUrl, { signal });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch deck: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.deckText) {
      throw new Error('Invalid response from proxy server');
    }

    return data.deckText;
  } catch (error) {
    console.error('Error importing from Fabrary URL:', error);
    throw error;
  }
}
