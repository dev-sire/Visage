// Creates the `follows` collection (attributes, indexes, permissions) in your
// Appwrite project. Safe to re-run: anything that already exists is skipped.
//
// Usage (Node 20+), from the project root:
//   APPWRITE_API_KEY=<server api key> node --env-file=.env.local scripts/setup-follows-collection.mjs
//
// The API key needs only these scopes: collections.read and collections.write
// (creating attributes and indexes is covered by them). Create one in the
// Appwrite console under Overview -> Integrations -> API keys, and delete it
// afterwards.

const endpoint = process.env.VITE_APPWRITE_URL;
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const collectionId = process.env.FOLLOWS_COLLECTION_ID || "follows";

class SetupFailed extends Error {}

async function api(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { status: response.status, data };
}

/** Runs a create call; treats "already exists" (409) as success. */
async function ensure(label, method, path, body) {
  const { status, data } = await api(method, path, body);
  if (status === 409) {
    console.log(`  = ${label} (already exists)`);
    return;
  }
  if (status < 200 || status >= 300) {
    console.error(`  x ${label} failed (${status}): ${data.message ?? JSON.stringify(data)}`);
    throw new SetupFailed();
  }
  console.log(`  + ${label}`);
}

async function waitForAttribute(key) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { status, data } = await api(
      "GET",
      `/databases/${databaseId}/collections/${collectionId}/attributes/${key}`
    );
    if (status === 200 && data.status === "available") return;
    if (status === 200 && (data.status === "failed" || data.status === "stuck")) {
      console.error(`  x attribute "${key}" ended up ${data.status}: ${data.error ?? ""}`);
      throw new SetupFailed();
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error(`  x timed out waiting for attribute "${key}"`);
  throw new SetupFailed();
}

async function main() {
  const missing = Object.entries({
    VITE_APPWRITE_URL: endpoint,
    VITE_APPWRITE_PROJECT_ID: projectId,
    VITE_APPWRITE_DATABASE_ID: databaseId,
    APPWRITE_API_KEY: apiKey,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error(`Missing: ${missing.join(", ")}`);
    console.error(
      'Run (PowerShell): $env:APPWRITE_API_KEY = "<key>"; node --env-file=.env.local scripts/setup-follows-collection.mjs'
    );
    console.error(
      "Run (bash): APPWRITE_API_KEY=<key> node --env-file=.env.local scripts/setup-follows-collection.mjs"
    );
    throw new SetupFailed();
  }

  const base = `/databases/${databaseId}/collections/${collectionId}`;

  console.log(`Setting up collection "${collectionId}" in database ${databaseId}`);

  // Signed-in users can read and create follows. Delete (unfollow) is not granted at
  // collection level: the app attaches it to each follow for the follower only
  // (that is what documentSecurity enables).
  await ensure("collection", "POST", "/databases/" + databaseId + "/collections", {
    collectionId,
    name: "Follows",
    permissions: ['read("users")', 'create("users")'],
    documentSecurity: true,
  });

  const attributes = [
    { type: "string", key: "followerId", size: 36, required: true },
    { type: "string", key: "followingId", size: 36, required: true },
  ];

  for (const { type, ...definition } of attributes) {
    await ensure(`attribute ${definition.key}`, "POST", `${base}/attributes/${type}`, definition);
  }

  console.log("Waiting for attributes to become available...");
  for (const { key } of attributes) await waitForAttribute(key);

  // The unique pair is what makes a double follow impossible; the other two
  // serve "who do I follow" and "who follows them" (counts).
  const indexes = [
    { key: "unique_pair", type: "unique", attributes: ["followerId", "followingId"], orders: ["ASC", "ASC"] },
    { key: "by_follower", type: "key", attributes: ["followerId"], orders: ["ASC"] },
    { key: "by_following", type: "key", attributes: ["followingId"], orders: ["ASC"] },
  ];
  for (const index of indexes) {
    await ensure(`index ${index.key}`, "POST", `${base}/indexes`, index);
  }

  console.log("\nDone. Add this to .env.local and to your Vercel environment variables:");
  console.log(`VITE_APPWRITE_FOLLOWS_COLLECTION_ID=${collectionId}`);
}

main().catch((error) => {
  if (!(error instanceof SetupFailed)) console.error(error);
  process.exitCode = 1;
});
