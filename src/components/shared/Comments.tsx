import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Models } from "appwrite";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import Loader from "@/components/shared/Loader";
import { useUserContext } from "@/context/AuthContext";
import { CommentDoc, errorMessage } from "@/lib/appwrite/api";
import {
  useCreateComment,
  useDeleteComment,
  useGetPostComments,
} from "@/lib/react-query/queriesAndMutations";
import { multiFormatDateString, resolveImageUrl } from "@/lib/utils";

const MAX_LENGTH = 1000;
const PLACEHOLDER_AVATAR = "/assets/icons/profile-placeholder.svg";

// ------------------------------------------------------------
// Composer: used for top-level comments and for replies
// ------------------------------------------------------------

type ComposerProps = {
  postId: string;
  parentId?: string;
  initialText?: string;
  placeholder: string;
  submitLabel: string;
  inputId?: string;
  autoFocus?: boolean;
  onDone?: () => void;
};

const CommentComposer = ({
  postId,
  parentId,
  initialText = "",
  placeholder,
  submitLabel,
  inputId,
  autoFocus,
  onDone,
}: ComposerProps) => {
  const { user } = useUserContext();
  const { toast } = useToast();
  const { mutateAsync: createComment, isPending } = useCreateComment();
  const [text, setText] = useState(initialText);

  const canSubmit = text.trim().length > 0 && !isPending;

  const submit = async () => {
    if (!canSubmit) return;

    try {
      await createComment({ postId, parentId, userId: user.id, content: text });
      setText("");
      onDone?.();
    } catch (error) {
      toast({ title: `Couldn't post your comment: ${errorMessage(error)}` });
    }
  };

  return (
    <div className="flex w-full gap-3">
      <img
        src={user.imageUrl || PLACEHOLDER_AVATAR}
        alt="you"
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />

      <div className="flex w-full flex-col gap-2">
        <Textarea
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          maxLength={MAX_LENGTH}
          autoFocus={autoFocus}
          aria-label={placeholder}
          className="h-20 min-h-[80px] resize-none rounded-xl border-none bg-dark-2 ring-offset-light-3 focus-visible:ring-1 focus-visible:ring-offset-1"
        />

        <div className="flex items-center justify-end gap-3">
          {text.length > MAX_LENGTH * 0.9 && (
            <span className="subtle-semibold text-light-3">
              {text.length}/{MAX_LENGTH}
            </span>
          )}
          {onDone && (
            <Button
              type="button"
              variant="ghost"
              className="small-medium text-light-3 hover:bg-dark-2 hover:text-white"
              onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            className="shad-button_primary small-medium"
            disabled={!canSubmit}
            onClick={submit}>
            {isPending ? "Posting..." : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// A single comment (top-level or reply)
// ------------------------------------------------------------

const AuthorBadge = () => (
  <span className="rounded border border-secondary-500/40 bg-secondary-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-secondary-500">
    Author
  </span>
);

type RowProps = {
  comment: CommentDoc;
  isPostAuthor: boolean;
  isOwn: boolean;
  isReply?: boolean;
  onReply: () => void;
  onDelete: () => void;
  isDeleting: boolean;
};

const CommentRow = ({ comment, isPostAuthor, isOwn, isReply, onReply, onDelete, isDeleting }: RowProps) => {
  const author = comment.author;
  const avatar = resolveImageUrl(author?.imageURL) || PLACEHOLDER_AVATAR;
  const name = author?.name ?? "Deleted user";

  return (
    <div className="flex w-full gap-3">
      {author ? (
        <Link to={`/profile/${author.$id}`} className="shrink-0">
          <img
            src={avatar}
            alt={name}
            className={`${isReply ? "h-7 w-7" : "h-8 w-8"} rounded-full object-cover`}
          />
        </Link>
      ) : (
        <img
          src={avatar}
          alt={name}
          className={`${isReply ? "h-7 w-7" : "h-8 w-8"} shrink-0 rounded-full object-cover`}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {author ? (
            <Link to={`/profile/${author.$id}`} className="small-medium text-white">
              {name}
            </Link>
          ) : (
            <span className="small-medium text-light-3">{name}</span>
          )}
          {isPostAuthor && <AuthorBadge />}
          <span className="subtle-semibold text-light-3">
            • {multiFormatDateString(comment.$createdAt)}
          </span>
        </div>

        {comment.isDeleted ? (
          <p className="small-regular italic text-light-3">This comment was deleted.</p>
        ) : (
          <p className="small-regular whitespace-pre-wrap break-words">{comment.content}</p>
        )}

        {!comment.isDeleted && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onReply}
              className="subtle-semibold text-light-3 hover:text-white">
              Reply
            </button>
            {isOwn && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={onDelete}
                className="subtle-semibold text-light-3 hover:text-red disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// A top-level comment with its replies
// ------------------------------------------------------------

type ThreadProps = {
  postId: string;
  postAuthorId?: string;
  userId: string;
  comment: CommentDoc;
  replies: CommentDoc[];
  onDelete: (comment: CommentDoc, hasReplies: boolean) => void;
  deletingId?: string;
};

const CommentThread = ({ postId, postAuthorId, userId, comment, replies, onDelete, deletingId }: ThreadProps) => {
  // Replying to a reply stays in the same thread (always parented on the top-level
  // comment) and starts with an @mention of the person being answered.
  const [replyTo, setReplyTo] = useState<CommentDoc | null>(null);

  const startReply = (target: CommentDoc) => setReplyTo(target);

  return (
    <div className="flex w-full flex-col gap-4">
      <CommentRow
        comment={comment}
        isPostAuthor={!!postAuthorId && comment.userId === postAuthorId}
        isOwn={comment.userId === userId}
        onReply={() => startReply(comment)}
        onDelete={() => onDelete(comment, replies.length > 0)}
        isDeleting={deletingId === comment.$id}
      />

      {(replies.length > 0 || replyTo) && (
        <div className="ml-4 flex flex-col gap-4 border-l border-dark-4 pl-4 md:ml-11">
          {replies.map((reply) => (
            <CommentRow
              key={reply.$id}
              comment={reply}
              isReply
              isPostAuthor={!!postAuthorId && reply.userId === postAuthorId}
              isOwn={reply.userId === userId}
              onReply={() => startReply(reply)}
              onDelete={() => onDelete(reply, false)}
              isDeleting={deletingId === reply.$id}
            />
          ))}

          {replyTo && (
            <CommentComposer
              key={replyTo.$id}
              postId={postId}
              parentId={comment.$id}
              initialText={
                replyTo.$id !== comment.$id && replyTo.author ? `@${replyTo.author.name} ` : ""
              }
              placeholder={`Reply to ${replyTo.author?.name ?? "this comment"}...`}
              submitLabel="Reply"
              autoFocus
              onDone={() => setReplyTo(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------
// Section shown on the post page
// ------------------------------------------------------------

type CommentsProps = {
  post: Models.DefaultDocument;
};

const Comments = ({ post }: CommentsProps) => {
  const { user } = useUserContext();
  const { toast } = useToast();
  const { data: comments, isPending, isError, error } = useGetPostComments(post.$id);
  const { mutate: removeComment, isPending: isDeleting, variables } = useDeleteComment(post.$id);
  const location = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ comment: CommentDoc; hasReplies: boolean } | null>(null);

  // The comment icon in the stats row links to /posts/:id#comments.
  useEffect(() => {
    if (location.hash !== "#comments") return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("new-comment-input")?.focus({ preventScroll: true });
  }, [location.hash, location.key]);

  const postAuthorId: string | undefined = post.creator?.$id;

  const { threads, total } = useMemo(() => {
    const all = comments ?? [];
    const repliesByParent = new Map<string, CommentDoc[]>();
    const topLevel: CommentDoc[] = [];

    for (const comment of all) {
      if (comment.parentId) {
        const list = repliesByParent.get(comment.parentId) ?? [];
        list.push(comment);
        repliesByParent.set(comment.parentId, list);
      } else {
        topLevel.push(comment);
      }
    }

    const visible = topLevel
      // A deleted comment only stays visible while it still has replies under it.
      .filter((comment) => !comment.isDeleted || (repliesByParent.get(comment.$id)?.length ?? 0) > 0)
      .reverse() // newest first; replies stay oldest first
      .map((comment) => ({ comment, replies: repliesByParent.get(comment.$id) ?? [] }));

    return { threads: visible, total: all.filter((comment) => !comment.isDeleted).length };
  }, [comments]);

  const handleDelete = (comment: CommentDoc, hasReplies: boolean) => {
    setPendingDelete({ comment, hasReplies });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;

    removeComment(
      { commentId: pendingDelete.comment.$id, hasReplies: pendingDelete.hasReplies },
      {
        onError: (err) => toast({ title: `Couldn't delete the comment: ${errorMessage(err)}` }),
      }
    );
  };

  return (
    <section
      ref={sectionRef}
      id="comments"
      className="flex w-full scroll-mt-20 flex-col gap-6"
      aria-label="Comments">
      <h3 className="body-bold md:h3-bold">
        Comments{comments ? ` (${total})` : ""}
      </h3>

      <CommentComposer
        postId={post.$id}
        placeholder="Add a comment..."
        submitLabel="Comment"
        inputId="new-comment-input"
      />

      {isPending ? (
        <Loader />
      ) : isError ? (
        <p className="small-regular text-light-3">
          Couldn't load comments: {errorMessage(error)}
        </p>
      ) : threads.length === 0 ? (
        <p className="small-regular text-light-3">No comments yet. Be the first to comment.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {threads.map(({ comment, replies }) => (
            <CommentThread
              key={comment.$id}
              postId={post.$id}
              postAuthorId={postAuthorId}
              userId={user.id}
              comment={comment}
              replies={replies}
              onDelete={handleDelete}
              deletingId={isDeleting ? variables?.commentId : undefined}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this comment?"
        description={
          pendingDelete?.hasReplies
            ? "Its replies will stay, and this comment will show as deleted."
            : "This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </section>
  );
};

export default Comments;
