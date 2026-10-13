import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

import { useUserContext } from "@/context/AuthContext";
import { errorMessage } from "@/lib/appwrite/api";
import {
  useGetHomeFeed,
  useGetMyFollows,
  useGetUsers,
} from "@/lib/react-query/queriesAndMutations";
import { Button } from "@/components/ui/button";
import Loader from "@/components/shared/Loader";
import PostCard from "@/components/shared/PostCard";
import UserCard from "@/components/shared/UserCard";

const Home = () => {
  const { user } = useUserContext();
  const { ref, inView } = useInView();

  const {
    data: feed,
    isPending: isFeedLoading,
    isError: isFeedError,
    error: feedError,
    refetch: refetchFeed,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetHomeFeed(user.id);
  const { data: follows } = useGetMyFollows(user.id);
  const {
    data: creators,
    isLoading: isUserLoading,
    isError: isErrorCreators,
  } = useGetUsers(10);

  // Keep loading while the end-of-list marker is on screen.
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // One flat list, remembering which section each post came from.
  const items =
    feed?.pages.flatMap((page) => page.documents.map((post) => ({ post, section: page.section }))) ?? [];
  const firstSuggestedIndex = items.findIndex((item) => item.section === "suggested");
  const followsNobody = follows !== undefined && follows.length === 0;

  return (
    <div className="flex flex-1">
      <div className="home-container">
        <div className="home-posts">
          <h2 className="h3-bold md:h2-bold text-white text-left w-full">Home Feed</h2>

          {isFeedLoading ? (
            <Loader />
          ) : isFeedError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="body-medium text-light-1">Couldn't load your feed: {errorMessage(feedError)}</p>
              <Button type="button" className="shad-button_dark_4" onClick={() => refetchFeed()}>
                Try again
              </Button>
            </div>
          ) : items.length === 0 && !hasNextPage ? (
            <p className="body-medium text-light-3">
              Nothing here yet. Follow people from the Top Creators list, or share the first post.
            </p>
          ) : (
            <ul className="flex flex-col flex-1 gap-9 w-full">
              {items.map(({ post }, index) => (
                <li key={post.$id} className="flex w-full flex-col items-center gap-9">
                  {index === firstSuggestedIndex && (
                    <div className="flex w-full max-w-screen-sm flex-col gap-1 border-t border-dark-4 pt-9">
                      <h3 className="body-bold md:h3-bold">Suggested for you</h3>
                      <p className="small-regular text-light-3">
                        {followsNobody
                          ? "You're not following anyone yet. Follow people to see their posts first."
                          : "Posts from people you don't follow yet."}
                      </p>
                    </div>
                  )}
                  <PostCard post={post} />
                </li>
              ))}
            </ul>
          )}

          {hasNextPage && (
            <div ref={ref} className="mt-10 w-full">
              <Loader />
            </div>
          )}
        </div>
      </div>

      <div className="home-creators">
        <h3 className="h3-bold text-white">Top Creators</h3>
        {isErrorCreators ? (
          <p className="body-medium text-light-1">Couldn't load creators.</p>
        ) : isUserLoading && !creators ? (
          <Loader />
        ) : (
          <ul className="grid 2xl:grid-cols-2 gap-6">
            {creators?.documents.map((creator) => (
              <li key={creator?.$id}>
                <UserCard user={creator} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Home;
