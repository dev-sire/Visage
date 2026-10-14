import { INewPost, INewUser, IUpdatePost, IUpdateUser } from "@/types";
import { account, appwriteConfig, avatars, databases, storage } from "./config";
import { AppwriteException, ID, Models, Permission, Query, Role } from "appwrite";

// ============================================================
// RELATIONSHIPS
// ============================================================
// Since Appwrite 2.0, listDocuments/getDocument return NO related documents
// unless the request has a Query.select asking for them (and many-to-many
// attributes such as `likes` are missing entirely). "*" selects the document's
// own fields; "relation.*" expands that relationship. Appwrite resolves at most
// 3 levels, so keep these paths shallow.

/** Posts shown as cards/grids: author + likes (PostCard, PostStats, GridPostList). */
const POST_SELECT = [Query.select(["*", "creator.*", "likes.*"])];

/** Another user's profile page: their posts, each with likes for the stats row. */
const USER_PROFILE_SELECT = [Query.select(["*", "posts.*", "posts.likes.*"])];

/** The signed-in user's saved and liked posts. */
const CURRENT_USER_SELECT = [
    Query.select(["*", "save.*", "save.post.*", "liked.*", "liked.creator.*"]),
];

// ============================================================
// ERRORS
// ============================================================

export function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return "Unknown error";
}

/**
 * Which step of "who is the current user?" failed.
 *  - no-session: Appwrite treats this browser as a guest (401 on account.get)
 *  - no-profile: session is fine, but there is no matching document in the users collection
 *  - error:      anything else (network, permissions on the users collection, ...)
 */
export type AuthFailureReason = "no-session" | "no-profile" | "error";

export class AuthStageError extends Error {
    reason: AuthFailureReason;

    constructor(reason: AuthFailureReason, message: string) {
        super(message);
        this.name = "AuthStageError";
        this.reason = reason;
    }
}

// ============================================================
// AUTH
// ============================================================

export async function createUserAccount(user: INewUser) {
    const newAccount = await account.create({
        userId: ID.unique(),
        email: user.email,
        password: user.password,
        name: user.name,
    });

    const avatarUrl = avatars.getInitials({ name: user.name });

    // Let this throw: an account without a profile document can sign in but
    // can never load, so the caller needs to know.
    return saveUserToDB({
        accountId: newAccount.$id,
        name: newAccount.name,
        email: newAccount.email,
        username: user.username,
        imageURL: avatarUrl,
    });
}

export async function saveUserToDB(user: {
    accountId: string;
    email: string;
    name: string;
    imageURL: string;
    username?: string;
}) {
    return databases.createDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.userCollectionId,
        documentId: ID.unique(),
        data: user,
    });
}

export async function signInAccount(user: { email: string; password: string }) {
    const credentials = { email: user.email, password: user.password };

    try {
        return await account.createEmailPasswordSession(credentials);
    } catch (error) {
        // Appwrite refuses to create a second session while one is active. That
        // happens if an earlier attempt signed in but the profile failed to load.
        // Drop the stale session and retry once so the user isn't stuck.
        if (error instanceof AppwriteException && error.type === "user_session_already_exists") {
            await account.deleteSession({ sessionId: "current" });
            return account.createEmailPasswordSession(credentials);
        }
        throw error;
    }
}

async function getCurrentAccountId(): Promise<string> {
    try {
        const currentAccount = await account.get();
        return currentAccount.$id;
    } catch (error) {
        if (error instanceof AppwriteException && error.code === 401) {
            throw new AuthStageError("no-session", error.message);
        }
        throw new AuthStageError("error", errorMessage(error));
    }
}

async function findProfile(accountId: string, queries: string[] = []) {
    try {
        const result = await databases.listDocuments({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.userCollectionId,
            queries: [Query.equal("accountId", accountId), ...queries],
        });

        const profile = result.documents[0];
        if (!profile) {
            throw new AuthStageError(
                "no-profile",
                "No profile document exists for this account."
            );
        }

        return profile;
    } catch (error) {
        if (error instanceof AuthStageError) throw error;
        throw new AuthStageError("error", errorMessage(error));
    }
}

/**
 * Resolves the signed-in user's profile document (own fields only). Used for
 * the sign-in check. Throws AuthStageError so the caller can tell a missing
 * session apart from a missing profile.
 */
export async function getCurrentUser(): Promise<Models.DefaultDocument> {
    return findProfile(await getCurrentAccountId());
}

/** Same, plus saved/liked posts expanded. Used by the Saved/Liked pages and PostStats. */
export async function getCurrentUserWithRelations(): Promise<Models.DefaultDocument> {
    return findProfile(await getCurrentAccountId(), CURRENT_USER_SELECT);
}

export async function signOutAccount() {
    try {
        return await account.deleteSession({ sessionId: "current" });
    } catch (error) {
        console.log(error);
    }
}

// ============================================================
// POSTS
// ============================================================

export async function createPost(post: INewPost) {
    try {
        // Upload file to appwrite storage
        const uploadedFile = await uploadFile(post.file[0]);

        if (!uploadedFile) throw Error;

        // Get file url
        const fileUrl = getFileUrl(uploadedFile.$id);
        if (!fileUrl) {
            await deleteFile(uploadedFile.$id);
            throw Error;
        }

        // Convert tags into array
        const tags = post.tags?.replace(/ /g, "").split(",") || [];

        // Create post
        const newPost = await databases.createDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.postCollectionId,
            documentId: ID.unique(),
            data: {
                creator: post.userId,
                caption: post.caption,
                imageURL: fileUrl,
                imageID: uploadedFile.$id,
                location: post.location,
                tags: tags,
            },
        });

        if (!newPost) {
            await deleteFile(uploadedFile.$id);
            throw Error;
        }

        return newPost;
    } catch (error) {
        console.log(error);
    }
}

export async function updatePost(post: IUpdatePost) {
    const hasFileToUpdate = post.file.length > 0;
    let newFileId: string | undefined;

    try {
        let image = {
            imageURL: post.imageURL,
            imageID: post.imageID,
        };

        if (hasFileToUpdate) {
            // Upload file to appwrite storage
            const uploadedFile = await uploadFile(post.file[0]);

            if (!uploadedFile) throw Error;
            newFileId = uploadedFile.$id;

            // Get file url
            const fileUrl = getFileUrl(uploadedFile.$id);
            if (!fileUrl) {
                await deleteFile(uploadedFile.$id);
                throw Error;
            }
            image = { ...image, imageURL: fileUrl, imageID: uploadedFile.$id };
        }

        // Convert tags into array
        const tags = post.tags?.replace(/ /g, "").split(",") || [];

        const updatedPost = await databases.updateDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.postCollectionId,
            documentId: post.postId,
            data: {
                caption: post.caption,
                imageURL: image.imageURL,
                imageID: image.imageID,
                location: post.location,
                tags: tags,
            },
        });

        if (!updatedPost) {
            // Only clean up the file *we* just uploaded; the post's existing image must survive.
            if (newFileId) await deleteFile(newFileId);
            throw Error;
        }

        return updatedPost;
    } catch (error) {
        console.log(error);
    }
}

export async function uploadFile(file: File) {
    try {
        return await storage.createFile({
            bucketId: appwriteConfig.storageId,
            fileId: ID.unique(),
            file,
        });
    } catch (error) {
        console.log(error);
    }
}

// Returns the file's /view URL. /preview (resize/quality/gravity) counts as an
// image transformation, which Appwrite blocks on plans that don't include it.
export function getFileUrl(fileId: string) {
    try {
        const fileUrl = storage.getFileView({
            bucketId: appwriteConfig.storageId,
            fileId,
        });

        if (!fileUrl) throw Error;

        return fileUrl;
    } catch (error) {
        console.log(error);
    }
}

export async function deleteFile(fileId: string) {
    try {
        await storage.deleteFile({ bucketId: appwriteConfig.storageId, fileId });

        return { status: "ok" };
    } catch (error) {
        console.log(error);
    }
}

export async function deletePost(postId?: string, imageId?: string) {
    if (!postId || !imageId) return;

    try {
        const statusCode = await databases.deleteDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.postCollectionId,
            documentId: postId,
        });
        if (!statusCode) throw Error;
        await deleteFile(imageId);
        return { status: "Ok" };
    } catch (error) {
        console.log(error);
    }
}

// The read functions below are used as React Query `queryFn`s. In React Query v5
// a queryFn must not resolve to `undefined`, and swallowing the error would hide
// it from `isError` / retry logic, so these let errors propagate.

export async function getRecentPosts() {
    return databases.listDocuments({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.postCollectionId,
        queries: [Query.orderDesc("$createdAt"), Query.limit(20), ...POST_SELECT],
    });
}

export async function likePost(postId: string, likesArray: string[]) {
    try {
        const updatedPost = await databases.updateDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.postCollectionId,
            documentId: postId,
            data: {
                likes: likesArray,
            },
        });
        if (!updatedPost) throw Error;

        return updatedPost;
    } catch (error) {
        console.log(error);
    }
}

export async function savePost(postId: string, userId: string) {
    try {
        const updatedPost = await databases.createDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.saveCollectionId,
            documentId: ID.unique(),
            data: {
                user: userId,
                post: postId,
            },
        });
        if (!updatedPost) throw Error;

        return updatedPost;
    } catch (error) {
        console.log(error);
    }
}

export async function deleteSavedPost(savedRecordId: string) {
    try {
        const statusCode = await databases.deleteDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.saveCollectionId,
            documentId: savedRecordId,
        });
        if (!statusCode) throw Error;

        return { status: "ok" };
    } catch (error) {
        console.log(error);
    }
}

export async function getPostById(postId?: string) {
    if (!postId) throw new Error("A post id is required.");

    return databases.getDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.postCollectionId,
        documentId: postId,
        queries: POST_SELECT,
    });
}

export async function getInfinitePosts({ pageParam }: { pageParam: number }) {
    const queries: string[] = [Query.orderDesc("$updatedAt"), Query.limit(9), ...POST_SELECT];

    if (pageParam) {
        queries.push(Query.cursorAfter(pageParam.toString()));
    }

    return databases.listDocuments({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.postCollectionId,
        queries,
    });
}

export async function searchPosts(searchTerm: string) {
    return databases.listDocuments({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.postCollectionId,
        queries: [Query.search("caption", searchTerm), ...POST_SELECT],
    });
}

// ============================================================
// USER
// ============================================================

export async function getUsers(limit?: number) {
    const queries: string[] = [Query.orderDesc("$createdAt")];

    if (limit) {
        queries.push(Query.limit(limit));
    }

    return databases.listDocuments({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.userCollectionId,
        queries,
    });
}

export async function getUserPosts(userId?: string) {
    if (!userId) throw new Error("A user id is required.");

    return databases.listDocuments({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.postCollectionId,
        queries: [Query.equal("creator", userId), Query.orderDesc("$createdAt"), ...POST_SELECT],
    });
}

export async function getUserById(userId: string) {
    return databases.getDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.userCollectionId,
        documentId: userId,
        queries: USER_PROFILE_SELECT,
    });
}

export async function updateUser(user: IUpdateUser) {
    const hasFileToUpdate = user.file.length > 0;
    try {
        let image = {
            imageUrl: user.imageURL,
            imageId: user.imageID,
        };

        if (hasFileToUpdate) {
            const uploadedFile = await uploadFile(user.file[0]);
            if (!uploadedFile) throw Error;

            const fileUrl = getFileUrl(uploadedFile.$id);
            if (!fileUrl) {
                await deleteFile(uploadedFile.$id);
                throw Error;
            }

            image = { ...image, imageUrl: fileUrl, imageId: uploadedFile.$id };
        }
        const updatedUser = await databases.updateDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.userCollectionId,
            documentId: user.userId,
            data: {
                name: user.name,
                bio: user.bio,
                imageURL: image.imageUrl,
                imageID: image.imageId,
            },
        });

        if (!updatedUser) {
            if (hasFileToUpdate) {
                await deleteFile(image.imageId);
            }
            throw Error;
        }

        if (user.imageID && hasFileToUpdate) {
            await deleteFile(user.imageID);
        }

        return updatedUser;
    } catch (error) {
        console.log(error);
    }
}

// ============================================================
// COMMENTS
// ============================================================
// Collection `comments` (see scripts/setup-comments-collection.mjs):
//   postId, userId (users-collection document id), parentId (set on replies,
//   always the id of the top-level comment, so threads are two levels deep),
//   content, isDeleted. Authors are looked up from the users collection at read
//   time so avatars and names never go stale.

export type INewComment = {
    postId: string;
    userId: string;
    content: string;
    parentId?: string;
};

export type CommentDoc = Models.DefaultDocument & { author?: Models.DefaultDocument };

export async function getPostComments(postId: string): Promise<CommentDoc[]> {
    const result = await databases.listDocuments({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.commentCollectionId,
        queries: [Query.equal("postId", postId), Query.orderAsc("$createdAt"), Query.limit(500)],
    });

    const userIds = [...new Set(result.documents.map((comment) => comment.userId as string))];
    const chunks: string[][] = [];
    for (let i = 0; i < userIds.length; i += 100) chunks.push(userIds.slice(i, i + 100));

    const authorLists = await Promise.all(
        chunks.map((ids) =>
            databases.listDocuments({
                databaseId: appwriteConfig.databaseId,
                collectionId: appwriteConfig.userCollectionId,
                queries: [Query.equal("$id", ids), Query.limit(100)],
            })
        )
    );

    const authors = new Map<string, Models.DefaultDocument>();
    authorLists.forEach((list) => list.documents.forEach((author) => authors.set(author.$id, author)));

    return result.documents.map((comment) => ({ ...comment, author: authors.get(comment.userId) }));
}

// These throw (unlike the older post helpers) so the UI can show the real reason.
export async function createComment(comment: INewComment) {
    const content = comment.content.trim();
    if (!content) throw new Error("A comment can't be empty.");

    // Only the author may edit or delete their own comment.
    const currentAccount = await account.get();

    return databases.createDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.commentCollectionId,
        documentId: ID.unique(),
        data: {
            postId: comment.postId,
            userId: comment.userId,
            content,
            ...(comment.parentId ? { parentId: comment.parentId } : {}),
        },
        permissions: [
            Permission.update(Role.user(currentAccount.$id)),
            Permission.delete(Role.user(currentAccount.$id)),
        ],
    });
}

/**
 * A comment that has replies is blanked (so the thread stays readable) instead
 * of removed; one without replies is deleted outright.
 */
export async function deleteComment({ commentId, hasReplies }: { commentId: string; hasReplies: boolean }) {
    if (hasReplies) {
        return databases.updateDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.commentCollectionId,
            documentId: commentId,
            data: { content: "", isDeleted: true },
        });
    }

    await databases.deleteDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.commentCollectionId,
        documentId: commentId,
    });
    return { status: "ok" };
}

// ------------------------------------------------------------
// Comment counts (the number next to the comment icon on every post)
// ------------------------------------------------------------
// Every PostStats asks for its own post's count, but all the cards that render
// together share ONE request: asks made within a few milliseconds are collected
// and answered by a single query for all of those posts. Replies count; comments
// that were deleted (and only remain as a placeholder) don't, matching the
// "Comments (n)" heading on the post page.

type CountWaiter = { resolve: (count: number) => void; reject: (error: unknown) => void };

const COUNT_BATCH_WINDOW_MS = 20;
const COUNT_POSTS_PER_REQUEST = 100;
const COUNT_PAGE_SIZE = 1000;
const COUNT_MAX_PAGES = 20;

const countWaiters = new Map<string, CountWaiter[]>();
let countTimer: ReturnType<typeof setTimeout> | undefined;

async function countCommentsFor(postIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>(postIds.map((id) => [id, 0]));
    let cursor: string | undefined;

    for (let page = 0; page < COUNT_MAX_PAGES; page++) {
        const queries = [
            Query.equal("postId", postIds),
            Query.select(["postId", "isDeleted"]),
            Query.orderAsc("$createdAt"),
            Query.limit(COUNT_PAGE_SIZE),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const result = await databases.listDocuments({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.commentCollectionId,
            queries,
        });

        for (const comment of result.documents) {
            if (!comment.isDeleted) counts.set(comment.postId, (counts.get(comment.postId) ?? 0) + 1);
        }

        if (result.documents.length < COUNT_PAGE_SIZE) break;
        cursor = result.documents[result.documents.length - 1].$id;
    }

    return counts;
}

async function flushCommentCounts() {
    countTimer = undefined;
    const waiting = new Map(countWaiters);
    countWaiters.clear();

    const postIds = [...waiting.keys()];
    const chunks: string[][] = [];
    for (let i = 0; i < postIds.length; i += COUNT_POSTS_PER_REQUEST) {
        chunks.push(postIds.slice(i, i + COUNT_POSTS_PER_REQUEST));
    }

    // One failing chunk only fails its own posts.
    await Promise.all(
        chunks.map(async (chunk) => {
            try {
                const counts = await countCommentsFor(chunk);
                chunk.forEach((id) => waiting.get(id)?.forEach((w) => w.resolve(counts.get(id) ?? 0)));
            } catch (error) {
                chunk.forEach((id) => waiting.get(id)?.forEach((w) => w.reject(error)));
            }
        })
    );
}

export function getCommentCount(postId: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const waiters = countWaiters.get(postId) ?? [];
        waiters.push({ resolve, reject });
        countWaiters.set(postId, waiters);

        if (countTimer === undefined) countTimer = setTimeout(flushCommentCounts, COUNT_BATCH_WINDOW_MS);
    });
}

// ============================================================
// FOLLOWS
// ============================================================
// Collection `follows` (see scripts/setup-follows-collection.mjs):
//   followerId, followingId: ids of documents in the users collection.
// A unique index on the pair means a user can never follow someone twice.

export async function getFollowing(userId: string): Promise<Models.DefaultDocument[]> {
    const follows: Models.DefaultDocument[] = [];
    let cursor: string | undefined;

    // Pages of 500 (Appwrite's per-query value limit); newest follows first.
    for (let page = 0; page < 5; page++) {
        const queries = [Query.equal("followerId", userId), Query.orderDesc("$createdAt"), Query.limit(500)];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const result = await databases.listDocuments({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.followCollectionId,
            queries,
        });

        follows.push(...result.documents);
        if (result.documents.length < 500) break;
        cursor = result.documents[result.documents.length - 1].$id;
    }

    return follows;
}

export async function getFollowCounts(userId: string) {
    const count = async (field: "followerId" | "followingId") => {
        const result = await databases.listDocuments({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.followCollectionId,
            queries: [Query.equal(field, userId), Query.limit(1)],
        });
        return result.total;
    };

    const [followers, following] = await Promise.all([count("followingId"), count("followerId")]);
    return { followers, following };
}

export async function followUser({ followerId, followingId }: { followerId: string; followingId: string }) {
    if (followerId === followingId) throw new Error("You can't follow yourself.");

    // Only the follower may remove the follow again.
    const currentAccount = await account.get();

    try {
        return await databases.createDocument({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.followCollectionId,
            documentId: ID.unique(),
            data: { followerId, followingId },
            permissions: [Permission.delete(Role.user(currentAccount.$id))],
        });
    } catch (error) {
        // The unique index rejects a duplicate (e.g. a double click or a second
        // tab): that just means we already follow them, so return the existing one.
        if (error instanceof AppwriteException && error.code === 409) {
            const existing = await databases.listDocuments({
                databaseId: appwriteConfig.databaseId,
                collectionId: appwriteConfig.followCollectionId,
                queries: [Query.equal("followerId", followerId), Query.equal("followingId", followingId), Query.limit(1)],
            });
            if (existing.documents[0]) return existing.documents[0];
        }
        throw error;
    }
}

export async function unfollowUser(followId: string) {
    await databases.deleteDocument({
        databaseId: appwriteConfig.databaseId,
        collectionId: appwriteConfig.followCollectionId,
        documentId: followId,
    });
    return { status: "ok" };
}

// ============================================================
// HOME FEED
// ============================================================
// Two sections, one continuous scroll:
//   1. "following": posts by people you follow (and your own), newest first
//   2. "suggested": everyone else's posts, newest first
// Suggested posts are filtered on the client instead of with a server-side
// "creator is not in ..." query: it needs no assumptions about querying
// relationship attributes, and Appwrite caps a query at 500 values anyway.

export type FeedSection = "following" | "suggested";
export type FeedPageParam = { section: FeedSection; cursor: string | null };
export type FeedPage = {
    section: FeedSection;
    documents: Models.DefaultDocument[];
    next: FeedPageParam | null;
};

export const FEED_PAGE_SIZE = 10;
const SUGGESTED_SCAN_SIZE = 25;
const SUGGESTED_MAX_SCANS = 4;
const MAX_FEED_AUTHORS = 500;

export async function getFeedPage({
    userId,
    followingIds,
    param,
}: {
    userId: string;
    followingIds: string[];
    param: FeedPageParam;
}): Promise<FeedPage> {
    // Your own posts count as part of "following" so a new post shows up at once.
    const authorIds = [...new Set([userId, ...followingIds])].slice(0, MAX_FEED_AUTHORS);

    if (param.section === "following") {
        const queries = [
            Query.equal("creator", authorIds),
            Query.orderDesc("$createdAt"),
            Query.limit(FEED_PAGE_SIZE),
            ...POST_SELECT,
        ];
        if (param.cursor) queries.push(Query.cursorAfter(param.cursor));

        const result = await databases.listDocuments({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.postCollectionId,
            queries,
        });

        const documents = result.documents;
        const last = documents[documents.length - 1];
        return {
            section: "following",
            documents,
            next:
                documents.length === FEED_PAGE_SIZE && last
                    ? { section: "following", cursor: last.$id }
                    : { section: "suggested", cursor: null },
        };
    }

    const authors = new Set(authorIds);
    const documents: Models.DefaultDocument[] = [];
    let cursor = param.cursor;
    let exhausted = false;

    for (let scan = 0; scan < SUGGESTED_MAX_SCANS && documents.length < FEED_PAGE_SIZE && !exhausted; scan++) {
        const queries = [Query.orderDesc("$createdAt"), Query.limit(SUGGESTED_SCAN_SIZE), ...POST_SELECT];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const result = await databases.listDocuments({
            databaseId: appwriteConfig.databaseId,
            collectionId: appwriteConfig.postCollectionId,
            queries,
        });

        const batch = result.documents;
        if (batch.length < SUGGESTED_SCAN_SIZE) exhausted = true;
        if (batch.length > 0) cursor = batch[batch.length - 1].$id;

        for (const post of batch) {
            const creatorId = typeof post.creator === "string" ? post.creator : post.creator?.$id;
            if (!authors.has(creatorId)) documents.push(post);
        }
    }

    return {
        section: "suggested",
        documents,
        next: exhausted ? null : { section: "suggested", cursor },
    };
}
