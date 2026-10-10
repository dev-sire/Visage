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
