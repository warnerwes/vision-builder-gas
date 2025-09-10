//Auth.gs
// OPTION A (same Workspace domain): simplest
function getCurrentUserEmail() {
  // Returns '' if the viewer isn't in your domain or the web app isn't restricted.
  return Session.getActiveUser().getEmail();
}

// OPTION B (mixed accounts): verify Google ID token from client
// 1) Put your Google OAuth Web Client ID below
const OAUTH_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

function verifyIdToken_(idToken) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {throw new Error('Invalid ID token');}

  const data = JSON.parse(resp.getContentText());

  // --- REQUIRED checks ---
  if (data.aud !== OAUTH_CLIENT_ID) {throw new Error('Bad audience (aud).');}
  if (!(data.iss === 'https://accounts.google.com' || data.iss === 'accounts.google.com')) {throw new Error('Bad issuer (iss).');}
  if (String(data.email_verified) !== 'true') {throw new Error('Email not verified.');}
  const now = Math.floor(Date.now() / 1000);
  if (Number(data.exp) < now) {throw new Error('Token expired.');}

  // Optional: restrict to your domain (uncomment if desired)
  // if (data.hd && data.hd !== 'yourdomain.org') throw new Error('Wrong hosted domain.');

  return { email: data.email, sub: data.sub };
}
