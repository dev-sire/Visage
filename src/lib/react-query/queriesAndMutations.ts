import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import { Models } from "appwrite";
import { createComment, createPost, createUserAccount, deleteComment, deletePost, deleteSavedPost, getCurrentUserWithRelations, getInfinitePosts, getPostById, getPostComments, getRecentPosts, getUserById, getUserPosts, getUsers, likePost, savePost, searchPosts, signInAccount, signOutAccount, updatePost, updateUser } from "../appwrite/api";
import { FeedPageParam, followUser, getCommentCount, getFeedPage, getFollowCounts, getFollowing, INewComment, unfollowUser } from "../appwrite/api";
import { INewPost, INewUser, IUpdatePost, IUpdateUser } from "@/types";
import { QUERY_KEYS } from "./queryKeys";

// Home now renders GET_HOME_FEED. Keep it fresh wherever the old recent-posts
// query was invalidated. `refetch: false` only marks it stale (used for likes and
// saves, where PostStats already shows the new state locally).
const invalidateFeeds = (queryClient: QueryClient, refetch = true) => {
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_RECENT_POSTS] });
  queryClient.invalidateQueries({
    queryKey: [QUERY_KEYS.GET_HOME_FEED],
    refetchType: refetch ? "active" : "none",
  });
};

export const useCreateUserAccount = () => {
    return useMutation({
      mutationFn: (user: INewUser) => createUserAccount(user),
    });
};
export const useSignInAccount = () => {
    return useMutation({
      mutationFn: (user: { email: string; password: string }) =>
        signInAccount(user),
    });
};
export const useSignOutAccount = () => {
  return useMutation({
    mutationFn: signOutAccount,
  });
};
export const useCreatePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (post: INewPost) => createPost(post),
    onSuccess: () => {
      invalidateFeeds(queryClient);
    }
  });
};
export const useGetRecentPosts = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_RECENT_POSTS],
    queryFn: getRecentPosts,
  })
};
export const useGetUsers = (limit?: number) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_USERS],
    queryFn: () => getUsers(limit),
  });
};
export const useLikePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({postId, likesArray} : { postId: string, likesArray: string[]}) => likePost(postId, likesArray),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POST_BY_ID, data?.$id]
      })
      invalidateFeeds(queryClient, false);
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POSTS]
      })
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_CURRENT_USER]
      })
    }
  })
};
export const useSavePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({postId, userId} : { postId: string, userId: string}) => savePost(postId, userId),
    onSuccess: () => {
      invalidateFeeds(queryClient, false);
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POSTS]
      })
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_CURRENT_USER]
      })
    }
  })
};
export const useDeleteSavedPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (savedRecordId: string) => deleteSavedPost(savedRecordId),
    onSuccess: () => {
      invalidateFeeds(queryClient, false);
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POSTS]
      })
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_CURRENT_USER]
      })
    }
  })
};
export const useGetCurrentUser = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_CURRENT_USER],
    queryFn: getCurrentUserWithRelations
  })
};
export const useGetUserPosts = (userId?: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_USER_POSTS, userId],
    queryFn: () => getUserPosts(userId),
    enabled: !!userId,
  });
};
export const useGetPostById = (postId?: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_POST_BY_ID, postId],
    queryFn: () => getPostById(postId),
    enabled: !!postId,
  });
};
export const useUpdatePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (post: IUpdatePost) => updatePost(post),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POST_BY_ID, data?.$id]
      })
      invalidateFeeds(queryClient);
    }
  })
};
export const useDeletePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, imageId }: { postId?: string; imageId: string }) => deletePost(postId, imageId),
    onSuccess: () => {
      invalidateFeeds(queryClient);
    },
  });
};

export const useGetPosts = () => {
  return useInfiniteQuery({
    queryKey: [QUERY_KEYS.GET_INFINITE_POSTS],
    queryFn: getInfinitePosts as any,
    initialPageParam: null,          // ← add this
    getNextPageParam: (lastPage: any) => {
      if (lastPage && lastPage.documents.length === 0) return null;
      return lastPage.documents[lastPage.documents.length - 1].$id;
    },
  });
};

export const useSearchPosts = (searchTerm: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.SEARCH_POSTS, searchTerm],
    queryFn: () => searchPosts(searchTerm),
    enabled: !!searchTerm,
  });
};
export const useGetUserById = (userId: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_USER_BY_ID, userId],
    queryFn: () => getUserById(userId),
    enabled: !!userId,
  });
};
export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (user: IUpdateUser) => updateUser(user),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_CURRENT_USER],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_USER_BY_ID, data?.$id],
      });
    },
  });
};

export const useGetPostComments = (postId?: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_POST_COMMENTS, postId],
    queryFn: () => getPostComments(postId as string),
    enabled: !!postId,
  });
};

export const useGetCommentCount = (postId?: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_COMMENT_COUNT, postId],
    queryFn: () => getCommentCount(postId as string),
    enabled: !!postId,
    staleTime: 30_000,
  });
};

export const useCreateComment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comment: INewComment) => createComment(comment),
    onSuccess: (_data, comment) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POST_COMMENTS, comment.postId],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_COMMENT_COUNT, comment.postId],
      });
    },
  });
};

export const useDeleteComment = (postId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { commentId: string; hasReplies: boolean }) => deleteComment(args),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_POST_COMMENTS, postId],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.GET_COMMENT_COUNT, postId],
      });
    },
  });
};

// ------------------------------------------------------------
// Follows
// ------------------------------------------------------------

type FollowCounts = { followers: number; following: number };

const myFollowsKey = (userId: string) => [QUERY_KEYS.GET_MY_FOLLOWS, userId];

/** Every follow document where `userId` is the follower. Shared by buttons and the feed. */
export const useGetMyFollows = (userId?: string) => {
  return useQuery({
    queryKey: myFollowsKey(userId ?? ""),
    queryFn: () => getFollowing(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  });
};

export const useGetFollowCounts = (userId?: string) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_FOLLOW_COUNTS, userId],
    queryFn: () => getFollowCounts(userId as string),
    enabled: !!userId,
  });
};

const adjustCounts = (queryClient: QueryClient, currentUserId: string, targetId: string, delta: number) => {
  queryClient.setQueryData<FollowCounts>([QUERY_KEYS.GET_FOLLOW_COUNTS, targetId], (old) =>
    old && { ...old, followers: Math.max(0, old.followers + delta) }
  );
  queryClient.setQueryData<FollowCounts>([QUERY_KEYS.GET_FOLLOW_COUNTS, currentUserId], (old) =>
    old && { ...old, following: Math.max(0, old.following + delta) }
  );
};

const resyncFollows = (queryClient: QueryClient, currentUserId: string, targetId: string) => {
  queryClient.invalidateQueries({ queryKey: myFollowsKey(currentUserId) });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_FOLLOW_COUNTS, targetId] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_FOLLOW_COUNTS, currentUserId] });
  // The feed's contents depend on who you follow.
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_HOME_FEED] });
};

// Both mutations update the UI immediately and roll back if the server refuses.
export const useFollowUser = (currentUserId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetId: string) => followUser({ followerId: currentUserId, followingId: targetId }),
    onMutate: async (targetId) => {
      await queryClient.cancelQueries({ queryKey: myFollowsKey(currentUserId) });
      const previous = queryClient.getQueryData<Models.DefaultDocument[]>(myFollowsKey(currentUserId));

      const pending = { $id: `pending-${targetId}`, followerId: currentUserId, followingId: targetId } as unknown as Models.DefaultDocument;
      queryClient.setQueryData<Models.DefaultDocument[]>(myFollowsKey(currentUserId), (old = []) => [pending, ...old]);
      adjustCounts(queryClient, currentUserId, targetId, 1);

      return { previous };
    },
    onSuccess: (created, targetId) => {
      // Swap the placeholder for the real document so Unfollow has the right id.
      queryClient.setQueryData<Models.DefaultDocument[]>(myFollowsKey(currentUserId), (old = []) =>
        old.map((follow) => (follow.$id === `pending-${targetId}` ? created : follow))
      );
    },
    onError: (_error, _targetId, context) => {
      queryClient.setQueryData(myFollowsKey(currentUserId), context?.previous);
    },
    onSettled: (_data, _error, targetId) => resyncFollows(queryClient, currentUserId, targetId),
  });
};

export const useUnfollowUser = (currentUserId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ followId }: { targetId: string; followId: string }) => unfollowUser(followId),
    onMutate: async ({ targetId, followId }) => {
      await queryClient.cancelQueries({ queryKey: myFollowsKey(currentUserId) });
      const previous = queryClient.getQueryData<Models.DefaultDocument[]>(myFollowsKey(currentUserId));

      queryClient.setQueryData<Models.DefaultDocument[]>(myFollowsKey(currentUserId), (old = []) =>
        old.filter((follow) => follow.$id !== followId)
      );
      adjustCounts(queryClient, currentUserId, targetId, -1);

      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(myFollowsKey(currentUserId), context?.previous);
    },
    onSettled: (_data, _error, { targetId }) => resyncFollows(queryClient, currentUserId, targetId),
  });
};

// ------------------------------------------------------------
// Home feed: people you follow first, then suggested posts
// ------------------------------------------------------------

export const useGetHomeFeed = (userId?: string) => {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: [QUERY_KEYS.GET_HOME_FEED, userId],
    enabled: !!userId,
    initialPageParam: { section: "following", cursor: null } as FeedPageParam,
    queryFn: async ({ pageParam }) => {
      // fetchQuery (unlike ensureQueryData) refetches when the follow list was invalidated.
      const follows = await queryClient.fetchQuery({
        queryKey: myFollowsKey(userId as string),
        queryFn: () => getFollowing(userId as string),
        staleTime: 60_000,
      });

      return getFeedPage({
        userId: userId as string,
        followingIds: follows.map((follow) => follow.followingId as string),
        param: pageParam,
      });
    },
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });
};
