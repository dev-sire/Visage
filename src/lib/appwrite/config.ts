import { Client, Account, Databases, Storage, Avatars } from "appwrite";

export const appwriteConfig = {
    url: import.meta.env.VITE_APPWRITE_URL,
    projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID,
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID,
    storageId: import.meta.env.VITE_APPWRITE_STORAGE_ID,
    userCollectionId: import.meta.env.VITE_APPWRITE_USERS_COLLECTION_ID,
    postCollectionId: import.meta.env.VITE_APPWRITE_POSTS_COLLECTION_ID,
    saveCollectionId: import.meta.env.VITE_APPWRITE_SAVES_COLLECTION_ID,
    commentCollectionId: import.meta.env.VITE_APPWRITE_COMMENTS_COLLECTION_ID,
}

// Fail loudly (once, at startup) if an env var didn't make it into the bundle.
// Vite only exposes variables prefixed with VITE_, and they're baked in at
// build time, so on Vercel they must be set in the project settings.
const missing = Object.entries(appwriteConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
if (missing.length > 0) {
    console.error(`[appwrite] Missing environment configuration for: ${missing.join(", ")}`);
}

export const client = new Client();

client.setProject(appwriteConfig.projectId);
client.setEndpoint(appwriteConfig.url);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const avatars = new Avatars(client);