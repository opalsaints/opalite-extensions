/**
 * Opalite Background Bridge
 * Handles messages from opalite-bridge.js content script.
 * Runs alongside the original Inssist bg.js in the same service worker.
 */

// Listen for Opalite-specific messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message._opalite) return false;

  switch (message.type) {
    case 'OPALITE_FETCH_IMAGE':
      handleFetchImage(message.url)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async

    case 'OPALITE_GET_IG_COOKIES':
      handleGetIgCookies()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'OPALITE_POST_TO_INSTAGRAM':
      handlePostToInstagram(message.imageData, message.caption)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
  }

  return false;
});

/**
 * Fetch image from R2 URL and return as base64
 */
async function handleFetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    success: true,
    base64: btoa(binary),
    contentType: blob.type,
    size: bytes.byteLength,
  };
}

/**
 * Get Instagram cookies (csrftoken, ds_user_id, sessionid)
 */
async function handleGetIgCookies() {
  const cookies = await chrome.cookies.getAll({ domain: '.instagram.com' });
  const result = {};
  for (const c of cookies) {
    if (['csrftoken', 'ds_user_id', 'sessionid', 'ig_did', 'mid'].includes(c.name)) {
      result[c.name] = c.value;
    }
  }
  return { success: true, cookies: result };
}

/**
 * Post an image to Instagram using internal web API.
 * imageData: { base64, contentType }
 * caption: string
 */
async function handlePostToInstagram(imageData, caption) {
  // 1. Get CSRF token from cookies
  const cookieResult = await handleGetIgCookies();
  if (!cookieResult.success) throw new Error('Failed to get Instagram cookies');

  const csrfToken = cookieResult.cookies.csrftoken;
  const dsUserId = cookieResult.cookies.ds_user_id;

  if (!csrfToken || !dsUserId) {
    throw new Error('Not logged into Instagram. Please log in first.');
  }

  // 2. Convert base64 to JPEG binary
  const binaryStr = atob(imageData.base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // If not JPEG, we'll try posting as-is (Instagram may accept PNG too via this endpoint)
  const isJpeg = imageData.contentType === 'image/jpeg' || imageData.contentType === 'image/jpg';

  // 3. Upload image via rupload_igphoto
  const uploadId = Date.now().toString();
  const entityName = `fb_uploader_${uploadId}`;

  const ruploadParams = JSON.stringify({
    media_type: 1,
    upload_id: uploadId,
    upload_media_height: 1080,
    upload_media_width: 1080,
  });

  const uploadRes = await fetch(`https://www.instagram.com/rupload_igphoto/${entityName}`, {
    method: 'POST',
    headers: {
      'x-csrftoken': csrfToken,
      'x-ig-app-id': '1217981644879628',
      'x-instagram-rupload-params': ruploadParams,
      'x-entity-name': entityName,
      'x-entity-length': bytes.byteLength.toString(),
      'content-type': isJpeg ? 'image/jpeg' : 'application/octet-stream',
      'offset': '0',
    },
    body: bytes.buffer,
    credentials: 'include',
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Image upload failed (${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  const uploadData = await uploadRes.json();
  if (uploadData.status !== 'ok') {
    throw new Error(`Upload rejected: ${JSON.stringify(uploadData)}`);
  }

  // 4. Configure/publish the post
  const configureRes = await fetch('https://www.instagram.com/api/v1/media/configure/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-csrftoken': csrfToken,
      'x-ig-app-id': '1217981644879628',
    },
    body: new URLSearchParams({
      upload_id: uploadId,
      caption: caption || '',
      usertags: '',
      custom_accessibility_caption: '',
      retry_timeout: '',
    }),
    credentials: 'include',
  });

  if (!configureRes.ok) {
    const text = await configureRes.text();
    throw new Error(`Post configure failed (${configureRes.status}): ${text.slice(0, 200)}`);
  }

  const configureData = await configureRes.json();

  if (configureData.status !== 'ok') {
    throw new Error(`Post rejected: ${JSON.stringify(configureData).slice(0, 300)}`);
  }

  return {
    success: true,
    igMediaId: configureData.media?.id || configureData.media?.pk,
    igPostCode: configureData.media?.code,
  };
}
