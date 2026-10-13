import { MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useUserContext } from "@/context/AuthContext";
import { errorMessage } from "@/lib/appwrite/api";
import {
  useFollowUser,
  useGetMyFollows,
  useUnfollowUser,
} from "@/lib/react-query/queriesAndMutations";
import { cn } from "@/lib/utils";

type FollowButtonProps = {
  /** Id of the user (users-collection document) this button follows / unfollows. */
  targetId: string;
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Set when the button sits inside a link (e.g. UserCard) so a click doesn't navigate. */
  insideLink?: boolean;
};

const FollowButton = ({ targetId, size = "sm", className, insideLink }: FollowButtonProps) => {
  const { user } = useUserContext();
  const { toast } = useToast();
  const { data: follows, isPending: isLoadingFollows } = useGetMyFollows(user.id);
  const { mutate: follow, isPending: isFollowing } = useFollowUser(user.id);
  const { mutate: unfollow, isPending: isUnfollowing } = useUnfollowUser(user.id);

  // Nothing to follow: not signed in yet, or this is you.
  if (!user.id || targetId === user.id) return null;

  const followDoc = follows?.find((follow) => follow.followingId === targetId);
  const isFollowed = !!followDoc;
  // Wait for the real document id before allowing an unfollow of a just-made follow.
  const busy =
    isLoadingFollows || isFollowing || isUnfollowing || !!followDoc?.$id.startsWith("pending-");

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (insideLink) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy) return;

    const onError = (error: unknown) =>
      toast({ title: `Couldn't ${isFollowed ? "unfollow" : "follow"}: ${errorMessage(error)}` });

    if (followDoc) unfollow({ targetId, followId: followDoc.$id }, { onError });
    else follow(targetId, { onError });
  };

  return (
    <Button
      type="button"
      size={size}
      disabled={busy}
      aria-pressed={isFollowed}
      aria-label={isFollowed ? "Unfollow" : "Follow"}
      onClick={handleClick}
      className={cn(
        "group min-w-[104px]",
        isFollowed ? "bg-dark-4 text-white hover:bg-red/80" : "shad-button_primary",
        className
      )}>
      {isFollowed ? (
        <>
          <span className="group-hover:hidden">Following</span>
          <span className="hidden group-hover:inline">Unfollow</span>
        </>
      ) : (
        "Follow"
      )}
    </Button>
  );
};

export default FollowButton;
